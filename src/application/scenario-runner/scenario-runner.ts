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
  hover?: number | string;
  press?: string;
  select?: { ref: number | string; value: string };
  scroll?: string | number;
  screenshot?: string;
  assert?: { ref?: number | string; kind: AssertionKind; expected?: string | number | boolean; operator?: ComparisonOperator };
  assertPerf?: { metric: 'fcp' | 'load' | 'ttfb' | 'domContentLoaded' | 'dcl'; thresholdMs: number; operator?: 'lte' | 'lt' | 'gte' | 'gt' | 'equals' };
  mock?: { urlPattern: string; status?: number; body?: string | Record<string, unknown>; contentType?: string };
  wait?: number;
}

export interface ScenarioConfig {
  name: string;
  baseUrl?: string;
  headless?: boolean;
  storageState?: string;
  device?: string;
  data?: Record<string, string | number>[]; // Feature #14: data-driven rows
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

    for (const row of dataRows) {
      const sessionId = `scenario-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      try {
        const { state } = await this.sessionManager.startSession({
          url: config.baseUrl ?? 'about:blank',
          headless: config.headless ?? true,
          device: config.device,
          storageState: config.storageState,
          sessionId,
        });

        for (const step of config.steps) {
          stepsExecuted++;
          await this.runStep(step, row, sessionId);
        }

        const report = await this.sessionManager.generateReport({ title: config.name, outputPath: path.resolve(process.cwd(), 'test-reports', `${this.safeName(config.name)}.md`) }, sessionId);
        if (report.report.status === 'FAILED') {
          failures.push(`${config.name}: report status FAILED`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(msg);
      } finally {
        await this.sessionManager.closeSession(sessionId);
      }
    }

    return {
      name: config.name,
      passed: failures.length === 0,
      stepsExecuted,
      failures,
    };
  }

  private async runStep(step: ScenarioStep, row: Record<string, string | number> | undefined, sessionId: string): Promise<void> {
    if (step.navigate) {
      await this.sessionManager.executeAction({ type: 'navigate', value: this.interpolate(step.navigate, row) }, sessionId);
      return;
    }
    if (step.mock) {
      await this.sessionManager.executeAction({ type: 'navigate' } as never, sessionId); // noop placeholder
      return;
    }
    if (step.click !== undefined) {
      const ref = typeof step.click === 'string' ? this.resolveRefAlias(step.click) : step.click;
      await this.sessionManager.executeAction({ type: 'click', ref }, sessionId);
      return;
    }
    if (step.fill) {
      const ref = typeof step.fill.ref === 'string' ? this.resolveRefAlias(step.fill.ref) : step.fill.ref;
      await this.sessionManager.executeAction({ type: 'fill', ref, value: this.interpolate(String(step.fill.value), row) }, sessionId);
      return;
    }
    if (step.hover !== undefined) {
      const ref = typeof step.hover === 'string' ? this.resolveRefAlias(step.hover) : step.hover;
      await this.sessionManager.executeAction({ type: 'hover', ref }, sessionId);
      return;
    }
    if (step.press) {
      await this.sessionManager.executeAction({ type: 'press', value: this.interpolate(step.press, row) }, sessionId);
      return;
    }
    if (step.select) {
      const ref = typeof step.select.ref === 'string' ? this.resolveRefAlias(step.select.ref) : step.select.ref;
      await this.sessionManager.executeAction({ type: 'select', ref, value: step.select.value }, sessionId);
      return;
    }
    if (step.scroll !== undefined) {
      await this.sessionManager.executeAction({ type: 'scroll', value: typeof step.scroll === 'number' ? String(step.scroll) : step.scroll }, sessionId);
      return;
    }
    if (step.screenshot) {
      await this.sessionManager.takeScreenshot(step.screenshot, false, sessionId);
      return;
    }
    if (step.assert) {
      const ref = typeof step.assert.ref === 'string' ? this.resolveRefAlias(step.assert.ref) : step.assert.ref;
      const res = await this.sessionManager.assert({
        ref,
        kind: step.assert.kind,
        expected: step.assert.expected,
        operator: step.assert.operator,
        sessionId,
      });
      if (!res.result.passed) throw new Error(`Assertion failed: ${res.result.message}`);
      return;
    }
    if (step.assertPerf) {
      const res = await this.sessionManager.assertPerformance(step.assertPerf.metric, step.assertPerf.thresholdMs, step.assertPerf.operator, sessionId);
      if (!res.result.passed) throw new Error(`Perf assertion failed: ${res.result.message}`);
      return;
    }
    if (step.wait !== undefined) {
      await new Promise((r) => setTimeout(r, step.wait));
      return;
    }
  }

  private interpolate(value: string, row?: Record<string, string | number>): string {
    if (!row) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(row[key] ?? `{{${key}}}`));
  }

  private resolveRefAlias(_alias: string): number {
    // Future: support named refs; for now treat string as numeric via map if needed
    return Number(_alias);
  }

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  }
}
