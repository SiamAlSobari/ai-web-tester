import { IBrowserDriver } from '../domain/interfaces/browser-driver.interface.js';
import { Session } from '../domain/entities/session.entity.js';
import { Issue, IssueType } from '../domain/entities/issue.entity.js';

export type AssertionKind =
  | 'visible'
  | 'hidden'
  | 'exists'
  | 'text'
  | 'value'
  | 'contains'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'count';

export type ComparisonOperator = 'equals' | 'contains' | 'gte' | 'lte' | 'gt' | 'lt' | 'regex';

export interface AssertionParams {
  ref?: number;
  kind: AssertionKind;
  expected?: string | number | boolean;
  operator?: ComparisonOperator;
  timeoutMs?: number;
}

export interface AssertionResult {
  passed: boolean;
  message: string;
  actual?: string;
}

export type PerfMetric = 'fcp' | 'load' | 'ttfb' | 'domContentLoaded' | 'dcl';

export interface PerfAssertionResult extends AssertionResult {
  metric: PerfMetric;
  thresholdMs: number;
  actualMs: number;
}

/**
 * Feature #1: Assertion Engine — verifies page state instead of blind execution.
 * Feature #15: Performance Budget Assertion — validates Web Vitals against thresholds.
 */
export class AssertionEngine {
  constructor(
    private readonly driver: IBrowserDriver,
    private readonly stateExtractor?: { extractCurrentState: (v?: { width: number; height: number }) => Promise<{ elements: Map<number, unknown> }> }
  ) {}

  async assert(session: Session, params: AssertionParams): Promise<AssertionResult> {
    const { ref, kind, expected, operator = 'equals', timeoutMs = 10000 } = params;

    try {
      if (kind === 'count') {
        return await this.assertCount(session, expected, operator);
      }

      if (ref === undefined) {
        return { passed: false, message: `Assertion "${kind}" requires a ref.` };
      }

      const elRef = session.currentState?.getElement(ref);
      if (kind === 'exists') {
        const ok = elRef !== undefined;
        return { passed: ok, message: ok ? `Element [ref=${ref}] exists.` : `Element [ref=${ref}] does not exist.`, actual: ok ? 'exists' : 'absent' };
      }

      const page = this.driver.getRawPage?.() as unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = (this.driver as any)['getLocator']?.(ref) ?? null;
      if (!loc) {
        return { passed: false, message: `Locator for [ref=${ref}] not found.`, actual: 'absent' };
      }

      switch (kind) {
        case 'visible': {
          const isVis = await loc.isVisible({ timeout: timeoutMs }).catch(() => false);
          return { passed: isVis, message: isVis ? `[ref=${ref}] is visible.` : `[ref=${ref}] is NOT visible.`, actual: String(isVis) };
        }
        case 'hidden': {
          const isVis = await loc.isVisible({ timeout: timeoutMs }).catch(() => false);
          return { passed: !isVis, message: !isVis ? `[ref=${ref}] is hidden.` : `[ref=${ref}] is visible (expected hidden).`, actual: String(isVis) };
        }
        case 'enabled': {
          const disabled = await loc.isDisabled({ timeout: timeoutMs }).catch(() => elRef?.disabled ?? false);
          return { passed: !disabled, message: !disabled ? `[ref=${ref}] is enabled.` : `[ref=${ref}] is disabled.`, actual: String(!disabled) };
        }
        case 'disabled': {
          const disabled = await loc.isDisabled({ timeout: timeoutMs }).catch(() => elRef?.disabled ?? false);
          return { passed: disabled, message: disabled ? `[ref=${ref}] is disabled.` : `[ref=${ref}] is enabled (expected disabled).`, actual: String(disabled) };
        }
        case 'checked': {
          const checked = await loc.isChecked({ timeout: timeoutMs }).catch(() => elRef?.checked ?? false);
          return { passed: checked, message: checked ? `[ref=${ref}] is checked.` : `[ref=${ref}] is not checked.`, actual: String(checked) };
        }
        case 'text': {
          const actual = ((await loc.innerText({ timeout: timeoutMs })) ?? '').trim();
          const ok = this.compare(actual, String(expected ?? ''), operator);
          return { passed: ok, message: ok ? `[ref=${ref}] text "${actual}" ${operator} "${expected}".` : `[ref=${ref}] text "${actual}" does NOT ${operator} "${expected}".`, actual };
        }
        case 'contains': {
          const actual = ((await loc.innerText({ timeout: timeoutMs })) ?? '').trim();
          const ok = this.compare(actual, String(expected ?? ''), 'contains');
          return { passed: ok, message: ok ? `[ref=${ref}] contains "${expected}".` : `[ref=${ref}] "${actual}" does NOT contain "${expected}".`, actual };
        }
        case 'value': {
          const actual = (await loc.inputValue({ timeout: timeoutMs })) ?? '';
          const ok = this.compare(actual, String(expected ?? ''), operator);
          return { passed: ok, message: ok ? `[ref=${ref}] value "${actual}" ${operator} "${expected}".` : `[ref=${ref}] value "${actual}" does NOT ${operator} "${expected}".`, actual };
        }
        default:
          return { passed: false, message: `Unsupported assertion kind: ${kind}` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { passed: false, message: `Assertion "${kind}" on [ref=${ref}] errored: ${msg}`, actual: 'error' };
    }
  }

  async assertPerformance(session: Session, metric: PerfMetric, thresholdMs: number, operator: ComparisonOperator = 'lte'): Promise<PerfAssertionResult> {
    const perf = session.currentState?.performance;
    const map: Record<PerfMetric, number | undefined> = {
      fcp: perf?.firstContentfulPaintMs,
      load: perf?.loadDurationMs,
      ttfb: perf?.ttfbMs,
      domContentLoaded: perf?.domContentLoadedMs,
      dcl: perf?.domContentLoadedMs,
    };
    const actualMs = map[metric] ?? -1;
    let ok = false;
    if (actualMs >= 0) {
      switch (operator) {
        case 'lte':
          ok = actualMs <= thresholdMs;
          break;
        case 'lt':
          ok = actualMs < thresholdMs;
          break;
        case 'gte':
          ok = actualMs >= thresholdMs;
          break;
        case 'gt':
          ok = actualMs > thresholdMs;
          break;
        case 'equals':
          ok = actualMs === thresholdMs;
          break;
        default:
          ok = actualMs <= thresholdMs;
      }
    }
    return {
      metric,
      thresholdMs,
      actualMs,
      passed: ok,
      message: ok
        ? `Performance ${metric.toUpperCase()} ${actualMs}ms ${operator} ${thresholdMs}ms (budget OK).`
        : `Performance ${metric.toUpperCase()} ${actualMs}ms violates budget (${operator} ${thresholdMs}ms).`,
      actual: `${actualMs}ms`,
    };
  }

  createIssueForFailure(session: Session, assertionLabel: string, result: AssertionResult): Issue {
    return Issue.create(
      'ASSERTION_FAILURE' as IssueType,
      `[Assertion Failed] ${assertionLabel}: ${result.message}`,
      session.targetUrl,
      { details: { actual: result.actual } }
    );
  }

  private async assertCount(session: Session, expected?: string | number | boolean, operator: ComparisonOperator = 'equals'): Promise<AssertionResult> {
    const count = session.currentState?.elements.size ?? 0;
    const expectedNum = typeof expected === 'number' ? expected : Number(expected ?? 0);
    const ok = this.compare(String(count), String(expectedNum), operator);
    return {
      passed: ok,
      message: ok ? `Interactive element count ${count} ${operator} ${expectedNum}.` : `Count ${count} does NOT ${operator} ${expectedNum}.`,
      actual: String(count),
    };
  }

  private compare(actual: string, expected: string, operator: ComparisonOperator): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'contains':
        return actual.includes(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'gt':
        return Number(actual) > Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'regex':
        try {
          return new RegExp(expected).test(actual);
        } catch {
          return false;
        }
      default:
        return actual === expected;
    }
  }
}
