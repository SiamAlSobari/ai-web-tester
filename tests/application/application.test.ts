import { describe, it, expect, vi } from 'vitest';
import { IBrowserDriver, InteractiveScanResult } from '../../src/domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../../src/domain/interfaces/telemetry-observer.interface.js';
import { IReporter } from '../../src/domain/interfaces/reporter.interface.js';
import { ElementRef } from '../../src/domain/value-objects/element-ref.vo.js';
import { Issue } from '../../src/domain/entities/issue.entity.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { StateExtractor } from '../../src/application/state-extractor.js';
import { ActionExecutor } from '../../src/application/action-executor.js';
import { ReportBuilder } from '../../src/application/report-builder.js';
import { Session } from '../../src/domain/entities/session.entity.js';
import { SessionNotInitializedError } from '../../src/shared/errors/domain-errors.js';

class MockBrowserDriver implements IBrowserDriver {
  private alive = false;
  private currentUrl = 'about:blank';
  private elementsMap: Map<number, ElementRef> = new Map();

  constructor() {
    this.elementsMap.set(
      1,
      new ElementRef({ ref: 1, role: 'textbox', name: 'Email', type: 'email' })
    );
    this.elementsMap.set(
      2,
      new ElementRef({ ref: 2, role: 'button', name: 'Submit' })
    );
  }

  async launch(): Promise<void> {
    this.alive = true;
  }

  async navigate(url: string): Promise<void> {
    this.currentUrl = url;
  }

  async click(_ref: number): Promise<void> {}
  async fill(_ref: number, _text: string): Promise<void> {}
  async hover(_ref: number): Promise<void> {}
  async press(_key: string): Promise<void> {}
  async selectOption(_ref: number, _value: string): Promise<void> {}
  async scroll(_directionOrPixels?: string | number, _ref?: number): Promise<void> {}

  async scanInteractiveElements(): Promise<InteractiveScanResult> {
    return {
      url: this.currentUrl,
      title: 'Mock Application',
      ariaTreeSummary: '[1] textbox "Email"\n[2] button "Submit"',
      elements: new Map(this.elementsMap),
    };
  }

  async captureScreenshot(filepath: string): Promise<string> {
    return filepath;
  }

  getUrl(): string {
    return this.currentUrl;
  }

  async getTitle(): Promise<string> {
    return 'Mock Application';
  }

  async close(): Promise<void> {
    this.alive = false;
  }

  isAlive(): boolean {
    return this.alive;
  }
}

class MockTelemetryObserver implements ITelemetryObserver {
  private issues: Issue[] = [];

  attach(): void {}
  getIssues(): Issue[] {
    return this.issues;
  }
  getRecentIssues(): Issue[] {
    return this.issues;
  }
  addIssue(issue: Issue): void {
    this.issues.push(issue);
  }
  clear(): void {
    this.issues = [];
  }
  detach(): void {}
}

class MockReporter implements IReporter {
  async generate(report: any): Promise<{ filepath: string; content: string }> {
    return {
      filepath: `./test-reports/report-${report.id}.md`,
      content: `# Laporan ${report.title}`,
    };
  }
}

describe('Application Layer Use Cases', () => {
  it('StateExtractor extracts current PageState from driver', async () => {
    const driver = new MockBrowserDriver();
    const telemetry = new MockTelemetryObserver();
    const extractor = new StateExtractor(driver, telemetry);

    const state = await extractor.extractCurrentState();
    expect(state.title).toBe('Mock Application');
    expect(state.elements.size).toBe(2);
    expect(state.getElement(1)?.name).toBe('Email');
  });

  it('ActionExecutor executes actions and updates session', async () => {
    const driver = new MockBrowserDriver();
    const telemetry = new MockTelemetryObserver();
    const extractor = new StateExtractor(driver, telemetry);
    const executor = new ActionExecutor(driver, telemetry, extractor);

    const session = Session.create('http://localhost:3000');

    const result = await executor.execute(session, {
      type: 'fill',
      ref: 1,
      value: 'admin@test.com',
    });

    expect(result.action.status).toBe('PASSED');
    expect(session.actions.length).toBe(1);
    expect(result.llmSummary).toContain('✅ Step 1: FILL on [ref=1]');
  });

  it('ReportBuilder compiles session into markdown report', async () => {
    const reporter = new MockReporter();
    const builder = new ReportBuilder(reporter);

    const session = Session.create('http://localhost:3000');
    const result = await builder.buildFromSession(session, { title: 'Custom Title' });

    expect(result.report.title).toBe('Custom Title');
    expect(result.content).toContain('# Laporan Custom Title');
  });

  it('SessionManager orchestrates full test lifecycle', async () => {
    const driver = new MockBrowserDriver();
    const telemetry = new MockTelemetryObserver();
    const reporter = new MockReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    await expect(manager.inspect()).rejects.toThrow(SessionNotInitializedError);

    // Start session
    const { session, state } = await manager.startSession({ url: 'http://localhost:3000' });
    expect(session.status).toBe('ACTIVE');
    expect(state.url).toBe('http://localhost:3000');

    // Execute click
    const actResult = await manager.executeAction({ type: 'click', ref: 2 });
    expect(actResult.action.status).toBe('PASSED');

    // Inspect
    const inspectResult = await manager.inspect();
    expect(inspectResult.llmContext).toContain('Mock Application');

    // Generate Report
    const repResult = await manager.generateReport({ title: 'E2E Flow' });
    expect(repResult.filepath).toContain('.md');

    // Close
    await manager.closeSession();
    expect(manager.getActiveSession()).toBeNull();
  });
});
