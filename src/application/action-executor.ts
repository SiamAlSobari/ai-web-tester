import path from 'node:path';
import fs from 'node:fs/promises';
import { IBrowserDriver } from '../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../domain/interfaces/telemetry-observer.interface.js';
import { StateExtractor } from './state-extractor.js';
import { AssertionEngine } from './assertion-engine.js';
import { Session } from '../domain/entities/session.entity.js';
import { Action, ActionType } from '../domain/entities/action.entity.js';
import { PageState } from '../domain/entities/page-state.entity.js';

export interface ExecuteActionParams {
  type: ActionType;
  ref?: number;
  value?: string;
  filePaths?: string[];
  screenshotName?: string;
}

export interface ExecuteActionResult {
  action: Action;
  state: PageState;
  llmSummary: string;
}

export class ActionExecutor {
  constructor(
    private readonly driver: IBrowserDriver,
    private readonly telemetry: ITelemetryObserver,
    private readonly stateExtractor: StateExtractor,
    private readonly assertionEngine?: AssertionEngine
  ) {}

  async execute(session: Session, params: ExecuteActionParams): Promise<ExecuteActionResult> {
    const stepNumber = session.actions.length + 1;
    const targetElement = params.ref !== undefined ? session.currentState?.getElement(params.ref) : undefined;
    const targetDescription = targetElement ? targetElement.toPromptString() : undefined;

    const action = Action.create(stepNumber, params.type, {
      targetRef: params.ref,
      targetDescription,
      value: params.value,
      filePaths: params.filePaths,
    });
    session.recordAction(action);

    const initialTimestamp = new Date().toISOString();

    try {
      await this.performActionWithRetry(params);
      action.complete();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      action.fail(errorMsg);
    }

    // Capture telemetry issues occurred during this action
    const newIssues = this.telemetry.getRecentIssues(initialTimestamp);
    for (const issue of newIssues) {
      session.recordIssue(issue);
    }

    // Automatic screenshot + optional auto trace on error/issue (#8)
    if (action.status === 'FAILED' || newIssues.length > 0) {
      try {
        const artifactDir = path.resolve(process.cwd(), 'artifacts');
        await fs.mkdir(artifactDir, { recursive: true });
        const filename = `error-step-${action.stepNumber}-${Date.now()}.png`;
        const screenshotPath = path.join(artifactDir, filename);
        await this.driver.captureScreenshot(screenshotPath);
        session.recordScreenshot(screenshotPath);
        if (action.status === 'FAILED') {
          action.screenshotPath = screenshotPath;
        }
        // Auto-save trace if tracing was enabled for debugging
        if (this.driver.isTracingActive?.()) {
          const tracePath = path.join(artifactDir, 'traces', `trace-step-${action.stepNumber}-${Date.now()}.zip`);
          await this.driver.saveTrace?.(tracePath).catch(() => {});
        }
      } catch {
        // Suppress screenshot errors
      }
    }

    // Extract fresh state after action
    const newState = await this.stateExtractor.extractCurrentState();
    session.updateState(newState);

    const llmSummary = this.buildActionSummary(action, newState);
    return {
      action,
      state: newState,
      llmSummary,
    };
  }

  private async performActionWithRetry(params: ExecuteActionParams, maxRetries = 2): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        switch (params.type) {
          case 'navigate':
            if (!params.value) throw new Error('URL value required for navigation');
            await this.driver.navigate(params.value);
            return;
          case 'click':
            if (params.ref === undefined) throw new Error('Ref ID required for click action');
            await this.selfHealing(() => this.driver.click(params.ref!), params.ref, 'click');
            return;
          case 'fill':
            if (params.ref === undefined) throw new Error('Ref ID required for fill action');
            await this.selfHealing(() => this.driver.fill(params.ref!, params.value ?? ''), params.ref, 'fill');
            return;
          case 'hover':
            if (params.ref === undefined) throw new Error('Ref ID required for hover action');
            await this.selfHealing(() => this.driver.hover(params.ref!), params.ref, 'hover');
            return;
          case 'press':
            if (!params.value) throw new Error('Key name required for press action');
            await this.driver.press(params.value);
            return;
          case 'select':
            if (params.ref === undefined) throw new Error('Ref ID required for select action');
            await this.selfHealing(() => this.driver.selectOption(params.ref!, params.value ?? ''), params.ref, 'select', params.value);
            return;
          case 'fill_form':
            if (this.driver.fillForm) {
              const res = await this.driver.fillForm({ formRef: params.ref, mode: params.value === 'fuzz' ? 'fuzz' : 'valid' });
              params.value = JSON.stringify(res.filledFields);
            }
            return;
          case 'scroll':
            await this.driver.scroll(params.value || 'down', params.ref);
            return;
          case 'upload':
            if (params.ref === undefined) throw new Error('Ref ID required for upload action');
            if (!params.filePaths || params.filePaths.length === 0) throw new Error('filePaths required for upload action');
            await this.selfHealing(() => this.driver.uploadFile(params.ref!, params.filePaths!), params.ref, 'upload', undefined, params.filePaths);
            return;
          case 'download':
            if (params.ref === undefined) throw new Error('Ref ID required for download trigger');
            await this.driver.waitForDownload(async () => {
              await this.driver.click(params.ref!);
            }, params.value);
            return;
          case 'switch_tab': {
            const tabIdx = params.value ? parseInt(params.value, 10) : (params.ref ?? 0);
            await this.driver.switchPage(tabIdx);
            return;
          }
          case 'screenshot': {
            const artifactName = params.screenshotName || `screenshot-step-${Date.now()}.png`;
            const artifactDir = path.resolve(process.cwd(), 'artifacts');
            const targetPath = path.join(artifactDir, artifactName);
            await this.driver.captureScreenshot(targetPath);
            return;
          }
          default:
            throw new Error(`Unsupported action type: ${params.type}`);
        }
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    throw lastError;
  }

  /**
   * Feature #9: Full-Spectrum Self-Healing Locator Engine.
   * On failure, fall back to rich selector hierarchy (data-testid, id, name, text, aria-label)
   * across all action types (click, fill, select, hover, upload).
   */
  private async selfHealing(
    primary: () => Promise<void>,
    ref: number,
    primaryType?: string,
    valParam?: string,
    filePathsParam?: string[]
  ): Promise<void> {
    try {
      await primary();
      return;
    } catch (primaryErr) {
      const page = this.driver.getRawPage?.() as unknown;
      if (page && typeof (page as { locator?: unknown }).locator === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elRef = (this.driver as any)['elementRefCache']?.get?.(ref) ?? (this.driver as any)['getElementRef']?.(ref) ?? null;
        if (elRef) {
          const selectors = this.buildFallbackSelectors(elRef);
          for (const selector of selectors) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const loc = (page as any).locator(selector).first();
              await loc.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
              await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});

              if (primaryType === 'click') {
                await loc.click({ timeout: 5000 });
                return;
              } else if (primaryType === 'fill') {
                const textToFill = valParam ?? (elRef as { value?: string })?.value ?? '';
                await loc.fill(textToFill, { timeout: 5000 });
                return;
              } else if (primaryType === 'select') {
                if (valParam) await loc.selectOption(valParam, { timeout: 5000 });
                return;
              } else if (primaryType === 'hover') {
                await loc.hover({ timeout: 5000 });
                return;
              } else if (primaryType === 'upload' && filePathsParam) {
                await loc.setInputFiles(filePathsParam, { timeout: 5000 });
                return;
              }
              await primary();
              return;
            } catch {
              // try next fallback selector
            }
          }
        }
      }
      throw primaryErr;
    }
  }

  private buildFallbackSelectors(elRef: {
    role?: string;
    name?: string;
    tag?: string;
    type?: string;
    placeholder?: string;
    testId?: string;
    id?: string;
    nameAttr?: string;
  }): string[] {
    const selectors: string[] = [];
    if (elRef.testId) {
      selectors.push(`[data-testid="${elRef.testId}"]`, `[data-test="${elRef.testId}"]`, `[data-cy="${elRef.testId}"]`);
    }
    if (elRef.id) {
      selectors.push(`#${elRef.id}`);
    }
    if (elRef.nameAttr) {
      selectors.push(`[name="${elRef.nameAttr}"]`);
    }
    const name = elRef.name?.trim()?.slice(0, 40)?.replace(/"/g, '\\"');
    if (name) {
      if (elRef.role) selectors.push(`${elRef.role}:has-text("${name}")`);
      selectors.push(`text="${name}"`);
      selectors.push(`[aria-label="${name}"]`);
    }
    if (elRef.placeholder) selectors.push(`[placeholder="${elRef.placeholder.replace(/"/g, '\\"')}"]`);
    if (elRef.tag && elRef.type) selectors.push(`${elRef.tag}[type="${elRef.type}"]`);
    if (elRef.tag) selectors.push(elRef.tag);
    return selectors.filter(Boolean);
  }

  private buildActionSummary(action: Action, state: PageState): string {
    const lines = [action.toSummaryString(), '', state.toLLMContext()];
    return lines.join('\n');
  }
}
