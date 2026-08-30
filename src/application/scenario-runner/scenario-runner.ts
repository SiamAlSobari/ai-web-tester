import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'js-yaml';
import { SessionManager } from '../session-manager.js';
import { ActionType } from '../../domain/entities/action.entity.js';
import { AssertionEngine, type AssertionKind, type ComparisonOperator } from '../assertion-engine.js';

export interface ScenarioStep {
  navigate?: string;
  click?: number | string;
  fill?: { ref: number | string; value: string | number };
  fill_form?: { formRef?: number | string; mode?: 'valid' | 'fuzz'; overrides?: Record<string, string> };
  hover?: number | string;
  press?: string;
  select?: { ref: number | string; value: string };
  scroll?: string | number;
  screenshot?: string;
  assert?: { ref?: number | string; kind: AssertionKind; expected?: string | number | boolean; operator?: ComparisonOperator; timeoutMs?: number };
  assertPerf?: { metric: 'fcp' | 'load' | 'ttfb' | 'domContentLoaded' | 'dcl'; thresholdMs: number; operator?: 'lte' | 'lt' | 'gte' | 'gt' | 'equals' };
  mock?: { urlPattern: string; status?: number; body?: string | Record<string, unknown>; contentType?: string };
  mockReset?: { urlPattern?: string };
  wait?: number;
  waitFor?: { ref?: number | string; state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeoutMs?: number };
  extract?: { varName: string; ref?: number | string; attribute?: 'text' | 'value' | 'html' | 'href' };
  request?: { method?: string; url: string; body?: string | Record<string, unknown>; headers?: Record<string, string>; expectStatus?: number };
  retry?: { attempts?: number };
  timeoutMs?: number;
}

export interface ScenarioConfig {
  name: string;
  baseUrl?: string;
  headless?: boolean;
  storageState?: string;
  device?: string;
  data?: Record<string, string | number>[]; // Feature #14: data-driven rows
  browser?: 'chromium' | 'firefox' | 'webkit';
  retries?: number;
  concurrency?: number;
  beforeAll?: ScenarioStep[];
  afterAll?: ScenarioStep[];
  beforeEach?: ScenarioStep[];
  afterEach?: ScenarioStep[];
  steps: ScenarioStep[];
}

export interface ScenarioRunResult {
  name: string;
  passed: boolean;
  stepsExecuted: number;
  failures: string[];
  reportPath?: string;
}

/**
 * Feature #4: Scenario YAML Runner — CI/CD replayable test flow.
 * Feature #14: Data-Driven — iterate steps over `data` rows, substituting {{key}}.
 */
export class ScenarioRunner {
  constructor(private readonly sessionManager: SessionManager) {}

  async runFromYaml(filePath: string): Promise<ScenarioRunResult> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const config = YAML.load(raw) as ScenarioConfig;
    return this.run(config);
  }

  async run(config: ScenarioConfig): Promise<ScenarioRunResult> {
    const failures: string[] = [];
    const dataRows = config.data && config.data.length > 0 ? config.data : [undefined];
    let stepsExecuted = 0;
    const retries = config.retries ?? 0;
    const concurrency = Math.min(config.concurrency ?? 1, 4);

    const runRow = async (row: Record<string, string | number> | undefined, rowIdx: number) => {
      let lastErr: string | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const sessionId = `scenario-${Date.now()}-${rowIdx}-${attempt}-${Math.random().toString(36).substring(2, 4)}`;
        const vars: Record<string, string> = row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])) : {};
        try {
          await this.sessionManager.startSession({
            url: config.baseUrl ?? 'about:blank',
            headless: config.headless ?? true,
            device: config.device,
            browser: config.browser as never,
            storageState: config.storageState,
            sessionId,
          });
          if (config.beforeAll) for (const s of config.beforeAll) { stepsExecuted++; await this.runStep(s, vars, sessionId); }
          if (config.beforeEach) for (const s of config.beforeEach) { stepsExecuted++; await this.runStep(s, vars, sessionId); }
          for (const step of config.steps) {
            stepsExecuted++;
            await this.runStep(step, vars, sessionId);
          }
          if (config.afterEach) for (const s of config.afterEach) { stepsExecuted++; await this.runStep(s, vars, sessionId); }
          if (config.afterAll) for (const s of config.afterAll) { stepsExecuted++; await this.runStep(s, vars, sessionId); }
          const report = await this.sessionManager.generateReport({ title: config.name, outputPath: path.resolve(process.cwd(), 'test-reports', `${this.safeName(config.name)}${dataRows.length > 1 ? `-row${rowIdx}` : ''}.md`) }, sessionId);
          if (report.report.status === 'FAILED') throw new Error(`${config.name}: report status FAILED (${report.report.issues.length} issues)`);
          return; // success — no failure push
        } catch (err: unknown) {
          lastErr = err instanceof Error ? err.message : String(err);
          if (attempt === retries) failures.push(lastErr);
          else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } finally {
          await this.sessionManager.closeSession(sessionId).catch(() => {});
        }
        if (lastErr && attempt === retries) break;
        if (!lastErr) break;
      }
    };

    if (concurrency > 1 && dataRows.length > 1) {
      // Batched parallel execution
      for (let i = 0; i < dataRows.length; i += concurrency) {
        const batch = dataRows.slice(i, i + concurrency).map((row, bi) => runRow(row, i + bi));
        await Promise.all(batch);
      }
    } else {
      for (let idx = 0; idx < dataRows.length; idx++) await runRow(dataRows[idx], idx);
    }

    return { name: config.name, passed: failures.length === 0, stepsExecuted, failures };
  }

  private async runStep(step: ScenarioStep, vars: Record<string, string> | undefined, sessionId: string): Promise<void> {
    if (step.navigate) {
      await this.sessionManager.executeAction({ type: 'navigate', value: this.interpolate(step.navigate, vars) }, sessionId);
      return;
    }
    if (step.fill_form) {
      const formRef = typeof step.fill_form.formRef === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.fill_form.formRef), vars))) : step.fill_form.formRef;
      await this.sessionManager.executeAction({ type: 'fill_form', ref: formRef, value: step.fill_form.mode ?? 'valid' }, sessionId);
      return;
    }
    if (step.mock) {
      const driver = (this.sessionManager as unknown as { driver: { routeMock: (o: unknown) => Promise<void> } }).driver;
      if (driver?.routeMock) {
        await driver.routeMock({ urlPattern: this.interpolate(step.mock.urlPattern, vars), status: step.mock.status, body: step.mock.body, contentType: step.mock.contentType });
      }
      return;
    }
    if (step.mockReset) {
      const driver = (this.sessionManager as unknown as { driver: { routeUnmock: (p?: string) => Promise<void> } }).driver;
      if (driver?.routeUnmock) {
        await driver.routeUnmock(step.mockReset.urlPattern ? this.interpolate(step.mockReset.urlPattern, vars) : undefined);
      }
      return;
    }
    if (step.click !== undefined) {
      const ref = typeof step.click === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.click), vars))) : step.click;
      await this.sessionManager.executeAction({ type: 'click', ref }, sessionId);
      return;
    }
    if (step.fill) {
      const ref = typeof step.fill.ref === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.fill.ref), vars))) : step.fill.ref;
      await this.sessionManager.executeAction({ type: 'fill', ref, value: this.interpolate(String(step.fill.value), vars) }, sessionId);
      return;
    }
    if (step.hover !== undefined) {
      const ref = typeof step.hover === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.hover), vars))) : step.hover;
      await this.sessionManager.executeAction({ type: 'hover', ref }, sessionId);
      return;
    }
    if (step.press) {
      await this.sessionManager.executeAction({ type: 'press', value: this.interpolate(step.press, vars) }, sessionId);
      return;
    }
    if (step.select) {
      const ref = typeof step.select.ref === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.select.ref), vars))) : step.select.ref;
      await this.sessionManager.executeAction({ type: 'select', ref, value: this.interpolate(step.select.value, vars) }, sessionId);
      return;
    }
    if (step.scroll !== undefined) {
      await this.sessionManager.executeAction({ type: 'scroll', value: typeof step.scroll === 'number' ? String(step.scroll) : this.interpolate(String(step.scroll), vars) }, sessionId);
      return;
    }
    if (step.screenshot) {
      await this.sessionManager.takeScreenshot(this.interpolate(step.screenshot, vars), false, sessionId);
      return;
    }
    if (step.assert) {
      const ref = typeof step.assert.ref === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.assert.ref), vars))) : step.assert.ref;
      const expected = typeof step.assert.expected === 'string' ? this.interpolate(step.assert.expected, vars) : step.assert.expected;
      const res = await this.sessionManager.assert({ ref, kind: step.assert.kind, expected, operator: step.assert.operator, timeoutMs: step.assert.timeoutMs, sessionId });
      if (!res.result.passed) throw new Error(`Assertion failed: ${res.result.message}`);
      return;
    }
    if (step.assertPerf) {
      const res = await this.sessionManager.assertPerformance(step.assertPerf.metric, step.assertPerf.thresholdMs, step.assertPerf.operator, sessionId);
      if (!res.result.passed) throw new Error(`Perf assertion failed: ${res.result.message}`);
      return;
    }
    if (step.waitFor) {
      const ref = step.waitFor.ref !== undefined ? (typeof step.waitFor.ref === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.waitFor.ref), vars))) : step.waitFor.ref) : undefined;
      if (ref !== undefined) {
        const driver = (this.sessionManager as unknown as { driver: { waitForSelector?: (r: number, s: string, t: number) => Promise<void> } }).driver;
        await driver.waitForSelector?.(ref, step.waitFor!.state ?? 'visible', step.waitFor!.timeoutMs ?? 10000);
      } else {
        await new Promise((r) => setTimeout(r, step.waitFor!.timeoutMs ?? 1000));
      }
      return;
    }
    if (step.extract) {
      const ref = step.extract.ref !== undefined ? (typeof step.extract.ref === 'string' ? this.resolveRefAlias(String(this.interpolate(String(step.extract.ref), vars))) : step.extract.ref as number) : undefined;
      if (ref !== undefined) {
        const driver = (this.sessionManager as unknown as { driver: { extractValue?: (r: number, a: string) => Promise<string> } }).driver;
        const val = await driver.extractValue?.(ref, step.extract.attribute ?? 'text') ?? '';
        if (vars) vars[step.extract.varName] = val;
      }
      return;
    }
    if (step.request) {
      const driver = (this.sessionManager as unknown as { driver: { apiRequest?: (o: unknown) => Promise<{ status: number; body: string }> } }).driver;
      const url = this.interpolate(step.request.url, vars);
      const body = typeof step.request.body === 'string' ? this.interpolate(step.request.body, vars) : step.request.body;
      const res = await driver.apiRequest?.({ method: step.request.method ?? 'GET', url, body, headers: step.request.headers });
      if (step.request.expectStatus !== undefined && res && res.status !== step.request.expectStatus) {
        throw new Error(`Request ${url} expected ${step.request.expectStatus} got ${res.status}: ${res.body.slice(0, 300)}`);
      }
      return;
    }
    if (step.wait !== undefined) {
      await new Promise((r) => setTimeout(r, step.wait));
      return;
    }
  }

  private interpolate(value: string, vars?: Record<string, string>): string {
    // 1. Process ${{ env.VAR_NAME }} and {{env.VAR_NAME}}
    let out = value.replace(/\$\{\{\s*env\.(\w+)\s*\}\}/g, (_, key) => process.env[key] ?? '')
                   .replace(/\{\{\s*env\.(\w+)\s*\}\}/g, (_, key) => process.env[key] ?? '');

    // 2. Process variable rows {{key}}
    if (vars) {
      out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
    }

    // 3. Process faker placeholders
    return this.interpolateFaker(out);
  }

  private interpolateFaker(value: string): string {
    // Light faker without deps: {{faker.email}}, {{faker.uuid}}, {{faker.int:1-100}}
    return value.replace(/\{\{faker\.(\w+)(?::([^}]+))?\}\}/g, (_, kind: string, arg: string | undefined) => {
      switch (kind) {
        case 'email': return `test+${Math.random().toString(36).slice(2, 8)}@example.com`;
        case 'uuid': return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        case 'int': {
          const m = arg?.match(/(\d+)-(\d+)/);
          const lo = m ? parseInt(m[1]!, 10) : 0, hi = m ? parseInt(m[2]!, 10) : 100;
          return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
        }
        case 'name': return `User${Math.random().toString(36).slice(2, 6)}`;
        default: return `{{faker.${kind}}}`;
      }
    });
  }

  private resolveRefAlias(_alias: string): number {
    // Future: support named refs; for now treat string as numeric via map if needed
    return Number(_alias);
  }

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  }
}
