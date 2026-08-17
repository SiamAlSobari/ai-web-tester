import { IBrowserDriver } from '../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../domain/interfaces/telemetry-observer.interface.js';
import { PageState } from '../domain/entities/page-state.entity.js';

export class StateExtractor {
  constructor(
    private readonly driver: IBrowserDriver,
    private readonly telemetry: ITelemetryObserver
  ) {}

  async extractCurrentState(): Promise<PageState> {
    const scan = await this.driver.scanInteractiveElements();
    const issues = this.telemetry.getIssues();
    const performance =
      typeof this.driver.getPerformanceMetrics === 'function'
        ? await this.driver.getPerformanceMetrics().catch(() => undefined)
        : undefined;

    return new PageState({
      url: scan.url,
      title: scan.title,
      elements: scan.elements,
      ariaTreeSummary: scan.ariaTreeSummary,
      issues,
      timestamp: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      performance,
      scrollInfo: scan.scrollInfo,
    });
  }
}
