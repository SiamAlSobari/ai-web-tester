import path from 'node:path';
import fs from 'node:fs/promises';
import { IBrowserDriver, LaunchOptions } from '../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../domain/interfaces/telemetry-observer.interface.js';
import { IReporter } from '../domain/interfaces/reporter.interface.js';
import { Session } from '../domain/entities/session.entity.js';
import { PageState } from '../domain/entities/page-state.entity.js';
import { StateExtractor } from './state-extractor.js';
import { ActionExecutor, ExecuteActionParams, ExecuteActionResult } from './action-executor.js';
import { ReportBuilder, BuildReportOptions, BuildReportResult } from './report-builder.js';
import { SessionNotInitializedError } from '../shared/errors/domain-errors.js';
import { PlaywrightDriver } from '../adapters/outbound/playwright/playwright-driver.js';

export interface StartSessionOptions extends LaunchOptions {
  url: string;
}

export class SessionManager {
  private activeSession: Session | null = null;
  private readonly stateExtractor: StateExtractor;
  private readonly actionExecutor: ActionExecutor;
  private readonly reportBuilder: ReportBuilder;

  constructor(
    private readonly driver: IBrowserDriver,
    private readonly telemetry: ITelemetryObserver,
    private readonly reporter: IReporter
  ) {
    this.stateExtractor = new StateExtractor(this.driver, this.telemetry);
    this.actionExecutor = new ActionExecutor(this.driver, this.telemetry, this.stateExtractor);
    this.reportBuilder = new ReportBuilder(this.reporter);
  }

  async startSession(options: StartSessionOptions): Promise<{ session: Session; state: PageState }> {
    // If active session exists, close it first
    if (this.activeSession) {
      await this.closeSession();
    }

    this.telemetry.clear();
    await this.driver.launch(options);

    // Attach telemetry listener to page if driver is PlaywrightDriver
    if (this.driver instanceof PlaywrightDriver) {
      const page = this.driver.getPage();
      if (page) {
        this.telemetry.attach(page);
      }
    }

    const session = Session.create(options.url);
    this.activeSession = session;

    // Navigate to initial target URL
    await this.driver.navigate(options.url);

    // Extract initial state
    const initialState = await this.stateExtractor.extractCurrentState();
    session.updateState(initialState);

    return { session, state: initialState };
  }

  async executeAction(params: ExecuteActionParams): Promise<ExecuteActionResult> {
    const session = this.ensureActiveSession();
    return this.actionExecutor.execute(session, params);
  }

  async inspect(): Promise<{ session: Session; state: PageState; llmContext: string }> {
    const session = this.ensureActiveSession();
    const state = await this.stateExtractor.extractCurrentState();
    session.updateState(state);
    return {
      session,
      state,
      llmContext: state.toLLMContext(),
    };
  }

  async saveAuthState(customPath?: string): Promise<{ filepath: string }> {
    this.ensureActiveSession();
    const artifactDir = path.resolve(process.cwd(), 'artifacts', 'auth');
    await fs.mkdir(artifactDir, { recursive: true });
    const targetFile = customPath || path.join(artifactDir, `auth-${Date.now()}.json`);
    const savedPath = await this.driver.saveStorageState(targetFile);
    return { filepath: savedPath };
  }

  getTabs(): Array<{ index: number; url: string; title: string; isActive: boolean }> {
    this.ensureActiveSession();
    return this.driver.getPages();
  }

  async switchTab(tabIndex: number): Promise<{ session: Session; state: PageState; llmContext: string }> {
    const session = this.ensureActiveSession();
    await this.driver.switchPage(tabIndex);

    // Re-attach telemetry to the newly active page if driver is PlaywrightDriver
    if (this.driver instanceof PlaywrightDriver) {
      const page = this.driver.getPage();
      if (page) {
        this.telemetry.attach(page);
      }
    }

    const state = await this.stateExtractor.extractCurrentState();
    session.updateState(state);
    return {
      session,
      state,
      llmContext: state.toLLMContext(),
    };
  }

  async saveTrace(customPath?: string): Promise<{ filepath: string }> {
    this.ensureActiveSession();
    const traceDir = path.resolve(process.cwd(), 'artifacts', 'traces');
    await fs.mkdir(traceDir, { recursive: true });
    const targetFile = customPath || path.join(traceDir, `trace-${Date.now()}.zip`);
    if (this.driver instanceof PlaywrightDriver) {
      await this.driver.stopTracing(targetFile);
    }
    return { filepath: targetFile };
  }

  async takeScreenshot(name?: string, fullPage = false): Promise<{ filepath: string }> {

    const session = this.ensureActiveSession();
    const artifactName = name ? (name.endsWith('.png') ? name : `${name}.png`) : `screenshot-${Date.now()}.png`;
    const artifactDir = path.resolve(process.cwd(), 'artifacts');
    await fs.mkdir(artifactDir, { recursive: true });
    const filepath = path.join(artifactDir, artifactName);

    await this.driver.captureScreenshot(filepath, fullPage);
    session.recordScreenshot(filepath);

    return { filepath };
  }

  async generateReport(options?: BuildReportOptions): Promise<BuildReportResult> {
    const session = this.ensureActiveSession();
    return this.reportBuilder.buildFromSession(session, options);
  }

  async closeSession(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.close();
      this.activeSession = null;
    }
    this.telemetry.detach();
    await this.driver.close();
  }

  getActiveSession(): Session | null {
    return this.activeSession;
  }

  private ensureActiveSession(): Session {
    if (!this.activeSession || this.activeSession.status === 'CLOSED') {
      throw new SessionNotInitializedError();
    }
    return this.activeSession;
  }
}
