import path from 'node:path';
import fs from 'node:fs/promises';
import { IBrowserDriver } from '../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../domain/interfaces/telemetry-observer.interface.js';
import { StateExtractor } from './state-extractor.js';
import { Session } from '../domain/entities/session.entity.js';
import { Action, ActionType } from '../domain/entities/action.entity.js';
import { PageState } from '../domain/entities/page-state.entity.js';

export interface ExecuteActionParams {
  type: ActionType;
  ref?: number;
  value?: string;
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
    private readonly stateExtractor: StateExtractor
  ) {}

  async execute(session: Session, params: ExecuteActionParams): Promise<ExecuteActionResult> {
    const stepNumber = session.actions.length + 1;
    const targetElement = params.ref !== undefined ? session.currentState?.getElement(params.ref) : undefined;
    const targetDescription = targetElement ? targetElement.toPromptString() : undefined;

    const action = Action.create(stepNumber, params.type, {
      targetRef: params.ref,
      targetDescription,
      value: params.value,
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

    // Automatic screenshot capture ONLY when error/issue is detected
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
            await this.driver.click(params.ref);
            return;
          case 'fill':
            if (params.ref === undefined) throw new Error('Ref ID required for fill action');
            await this.driver.fill(params.ref, params.value ?? '');
            return;
          case 'hover':
            if (params.ref === undefined) throw new Error('Ref ID required for hover action');
            await this.driver.hover(params.ref);
            return;
          case 'press':
            if (!params.value) throw new Error('Key name required for press action');
            await this.driver.press(params.value);
            return;
          case 'select':
            if (params.ref === undefined) throw new Error('Ref ID required for select action');
            await this.driver.selectOption(params.ref, params.value ?? '');
            return;
          case 'scroll':
            await this.driver.scroll(params.value || 'down', params.ref);
            return;
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
        // Brief pause before retry in case of transient DOM animation/state change
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    throw lastError;
  }

  private buildActionSummary(action: Action, state: PageState): string {
    const lines = [
      action.toSummaryString(),
      '',
      state.toLLMContext(),
    ];
    return lines.join('\n');
  }
}
