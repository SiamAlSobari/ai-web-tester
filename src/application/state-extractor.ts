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

    return new PageState({
      url: scan.url,
      title: scan.title,
      elements: scan.elements,
      ariaTreeSummary: scan.ariaTreeSummary,
      issues,
      timestamp: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
    });
  }
}
