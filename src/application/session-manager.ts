import path from 'node:path';
import fs from 'node:fs/promises';
import { IBrowserDriver, LaunchOptions } from '../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../domain/interfaces/telemetry-observer.interface.js';
import { IReporter } from '../domain/interfaces/reporter.interface.js';
import { Session } from '../domain/entities/session.entity.js';
import { PageState } from '../domain/entities/page-state.entity.js';
import { Issue } from '../domain/entities/issue.entity.js';
import { StateExtractor } from './state-extractor.js';
import { ActionExecutor, ExecuteActionParams, ExecuteActionResult } from './action-executor.js';
import { ReportBuilder, BuildReportOptions, BuildReportResult } from './report-builder.js';
import { AssertionEngine, AssertionParams, AssertionResult, PerfMetric } from './assertion-engine.js';
import { SessionNotInitializedError } from '../shared/errors/domain-errors.js';
import { assertUrlAllowed, type SecurityConfig } from '../shared/config/security.js';
import { publishLiveEvent } from '../shared/events/live-bus.js';

export interface StartSessionOptions extends LaunchOptions {
  url: string;
  sessionId?: string;
}

export interface AssertParams extends AssertionParams {
  sessionId?: string;
}

export interface SessionSummary {
  id: string;
  url: string;
  status: string;
  actions: number;
  issues: number;
}

export class SessionManager {
  private readonly sessions: Map<string, Session> = new Map();
  private readonly stateExtractors: Map<string, StateExtractor> = new Map();
  private readonly actionExecutors: Map<string, ActionExecutor> = new Map();
  private activeSessionId: string | null = null;
  private readonly assertionEngine: AssertionEngine;
  private securityConfig?: SecurityConfig;

  constructor(
    private readonly driver: IBrowserDriver,
    private readonly telemetry: ITelemetryObserver,
    private readonly reporter: IReporter
  ) {
    this.assertionEngine = new AssertionEngine(this.driver);
  }

  setSecurityConfig(config?: SecurityConfig): void {
    this.securityConfig = config;
  }

  async startSession(options: StartSessionOptions): Promise<{ sessionId: string; session: Session; state: PageState }> {
    assertUrlAllowed(options.url, this.securityConfig);

    this.telemetry.clear();
    await this.driver.launch(options);

    // Hexagonal decoupling: attach telemetry via interface (no instanceof needed)
    this.driver.attachTelemetry?.(this.telemetry);

    const session = Session.create(options.url);
    const sessionId = options.sessionId || session.id;
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    publishLiveEvent('session:start', { sessionId, url: options.url });

    const viewport = this.driver.getViewport?.() ?? undefined;
    const stateExtractor = new StateExtractor(this.driver, this.telemetry, viewport);
    this.stateExtractors.set(sessionId, stateExtractor);
    this.actionExecutors.set(
      sessionId,
      new ActionExecutor(this.driver, this.telemetry, stateExtractor, this.assertionEngine)
    );

    await this.driver.navigate(options.url);
    const initialState = await stateExtractor.extractCurrentState();
    session.updateState(initialState);

    return { sessionId, session, state: initialState };
  }

  private getSession(sessionId?: string): Session {
    const id = sessionId || this.activeSessionId;
    if (!id) throw new SessionNotInitializedError();
    const session = this.sessions.get(id);
    if (!session || session.status === 'CLOSED') throw new SessionNotInitializedError();
    return session;
  }

  private getExecutor(sessionId?: string): ActionExecutor {
    const id = sessionId || this.activeSessionId;
    const ex = id ? this.actionExecutors.get(id) : undefined;
    if (!ex) throw new SessionNotInitializedError();
    return ex;
  }

  async executeAction(params: ExecuteActionParams, sessionId?: string): Promise<ExecuteActionResult> {
    const sid = sessionId || this.activeSessionId || undefined;
    if (params.type === 'navigate' && params.value) {
      assertUrlAllowed(params.value, this.securityConfig);
    }
    const session = this.getSession(sid);
    const result = await this.getExecutor(sid).execute(session, params);
    publishLiveEvent('action:executed', { sessionId: sid, action: result.action.toJSON() });
    return result;
  }

  enforceAllowed(url: string): void {
    assertUrlAllowed(url, this.securityConfig);
  }

  async assert(params: AssertParams): Promise<{ sessionId: string; result: AssertionResult }> {
    const session = this.getSession(params.sessionId);
    const result = await this.assertionEngine.assert(session, params);
    if (!result.passed) {
      session.recordIssue(this.assertionEngine.createIssueForFailure(session, params.kind, result));
    }
    publishLiveEvent('assertion:result', { sessionId: params.sessionId || this.activeSessionId, passed: result.passed, message: result.message });
    return { sessionId: (params.sessionId || this.activeSessionId)!, result };
  }

  async assertPerformance(metric: PerfMetric, thresholdMs: number, operator: 'lte' | 'lt' | 'gte' | 'gt' | 'equals' = 'lte', sessionId?: string) {
    const session = this.getSession(sessionId);
    const result = await this.assertionEngine.assertPerformance(session, metric, thresholdMs, operator);
    if (!result.passed) {
      session.recordIssue(
        Issue.create('ASSERTION_FAILURE', `[Perf Budget] ${result.message}`, session.targetUrl, {
          details: { metric, thresholdMs, actualMs: result.actualMs },
        })
      );
    }
    return { sessionId: (sessionId || this.activeSessionId)!, result };
  }

  async inspect(sessionId?: string): Promise<{ sessionId: string; session: Session; state: PageState; llmContext: string }> {
    const session = this.getSession(sessionId);
    const stateExtractor = this.stateExtractors.get(sessionId || this.activeSessionId!)!;
    const state = await stateExtractor.extractCurrentState();
    session.updateState(state);
    return { sessionId: (sessionId || this.activeSessionId)!, session, state, llmContext: state.toLLMContext() };
  }

  async saveAuthState(customPath?: string, sessionId?: string): Promise<{ filepath: string }> {
    this.getSession(sessionId);
    const artifactDir = path.resolve(process.cwd(), 'artifacts', 'auth');
    await fs.mkdir(artifactDir, { recursive: true });
    const targetFile = customPath || path.join(artifactDir, `auth-${Date.now()}.json`);
    const savedPath = await this.driver.saveStorageState(targetFile);
    return { filepath: savedPath };
  }

  getTabs(): Array<{ index: number; url: string; title: string; isActive: boolean }> {
    return this.driver.getPages();
  }

  async switchTab(tabIndex: number, sessionId?: string): Promise<{ sessionId: string; session: Session; state: PageState; llmContext: string }> {
    const session = this.getSession(sessionId);
    await this.driver.switchPage(tabIndex);
    this.driver.attachTelemetry?.(this.telemetry);
    const stateExtractor = this.stateExtractors.get(sessionId || this.activeSessionId!)!;
    const state = await stateExtractor.extractCurrentState();
    session.updateState(state);
    return { sessionId: (sessionId || this.activeSessionId)!, session, state, llmContext: state.toLLMContext() };
  }

  async saveTrace(customPath?: string, sessionId?: string): Promise<{ filepath: string }> {
    this.getSession(sessionId);
    const traceDir = path.resolve(process.cwd(), 'artifacts', 'traces');
    await fs.mkdir(traceDir, { recursive: true });
    const targetFile = customPath || path.join(traceDir, `trace-${Date.now()}.zip`);
    if (this.driver.isTracingActive?.()) {
      await this.driver.saveTrace?.(targetFile);
    }
    return { filepath: targetFile };
  }

  async takeScreenshot(name?: string, fullPage = false, sessionId?: string): Promise<{ filepath: string }> {
    const session = this.getSession(sessionId);
    const artifactName = name ? (name.endsWith('.png') ? name : `${name}.png`) : `screenshot-${Date.now()}.png`;
    const artifactDir = path.resolve(process.cwd(), 'artifacts');
    await fs.mkdir(artifactDir, { recursive: true });
    const filepath = path.join(artifactDir, artifactName);
    await this.driver.captureScreenshot(filepath, fullPage);
    session.recordScreenshot(filepath);
    return { filepath };
  }

  async fillForm(options?: { formRef?: number; mode?: 'valid' | 'fuzz'; overrides?: Record<string, string> }, sessionId?: string): Promise<{ result: { filledFields: Record<string, string>; message: string }; state: PageState; llmContext: string }> {
    const session = this.getSession(sessionId);
    const fillResult = await this.driver.fillForm?.(options) ?? { filledFields: {}, message: 'fillForm not supported' };
    const stateExtractor = this.stateExtractors.get(sessionId || this.activeSessionId!)!;
    const state = await stateExtractor.extractCurrentState();
    session.updateState(state);
    return { result: fillResult, state, llmContext: `${fillResult.message}\n\n${state.toLLMContext()}` };
  }

  async generateScenario(name = 'Generated Scenario', sessionId?: string): Promise<{ yaml: string; filepath?: string }> {
    const session = this.getSession(sessionId);
    const steps: Array<Record<string, unknown>> = [];

    for (const a of session.actions) {
      if (a.type === 'navigate' && a.value) steps.push({ navigate: a.value });
      else if (a.type === 'click' && a.targetRef !== undefined) steps.push({ click: a.targetRef });
      else if (a.type === 'fill' && a.targetRef !== undefined) steps.push({ fill: { ref: a.targetRef, value: a.value ?? '' } });
      else if (a.type === 'select' && a.targetRef !== undefined) steps.push({ select: { ref: a.targetRef, value: a.value ?? '' } });
      else if (a.type === 'hover' && a.targetRef !== undefined) steps.push({ hover: a.targetRef });
      else if (a.type === 'press' && a.value) steps.push({ press: a.value });
      else if (a.type === 'scroll') steps.push({ scroll: a.value || 'down' });
      else if (a.type === 'screenshot') steps.push({ screenshot: `step-${a.stepNumber}` });
    }

    const scenarioObj = {
      name,
      baseUrl: session.targetUrl,
      headless: true,
      steps,
    };

    const yamlModule = await import('js-yaml');
    const yamlStr = yamlModule.dump(scenarioObj);
    const targetDir = path.resolve(process.cwd(), 'scenarios');
    await fs.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.yaml`);
    await fs.writeFile(targetFile, yamlStr, 'utf-8');
    return { yaml: yamlStr, filepath: targetFile };
  }

  async generateReport(options?: BuildReportOptions, sessionId?: string): Promise<BuildReportResult> {
    const session = this.getSession(sessionId);
    const reportBuilder = new ReportBuilder(this.reporter);
    return reportBuilder.buildFromSession(session, options);
  }

  listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      url: s.targetUrl,
      status: s.status,
      actions: s.actions.length,
      issues: s.issues.length,
    }));
  }

  async closeSession(sessionId?: string): Promise<void> {
    const id = sessionId || this.activeSessionId;
    if (!id) return;
    publishLiveEvent('session:close', { sessionId: id });
    const session = this.sessions.get(id);
    if (session) {
      session.close();
      this.sessions.delete(id);
      this.stateExtractors.delete(id);
      this.actionExecutors.delete(id);
    }
    if (this.activeSessionId === id) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
    }
    if (this.sessions.size === 0) {
      this.telemetry.detach();
      await this.driver.close();
    }
  }

  async closeAll(): Promise<void> {
    for (const id of Array.from(this.sessions.keys())) {
      await this.closeSession(id);
    }
  }

  getActiveSession(sessionId?: string): Session | null {
    try {
      return this.getSession(sessionId);
    } catch {
      return null;
    }
  }
}
