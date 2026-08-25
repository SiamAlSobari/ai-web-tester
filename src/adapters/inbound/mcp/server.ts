import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SessionManager } from '../../../application/session-manager.js';
import { PlaywrightDriver } from '../../outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter, HtmlReporter, JUnitReporter } from '../../outbound/reporter/index.js';
import { SitemapCrawler } from '../../../application/crawler/sitemap-crawler.js';
import { ScenarioRunner } from '../../../application/scenario-runner/scenario-runner.js';
import { A11yAuditor } from '../../outbound/a11y/a11y-auditor.js';
import { publishLiveEvent } from '../../../shared/events/live-bus.js';
import { assertUrlAllowed, type SecurityConfig } from '../../../shared/config/security.js';

export function createMcpServer(sessionManager?: SessionManager, securityConfig?: SecurityConfig): McpServer {
  const driver = new PlaywrightDriver();
  const telemetry = new PlaywrightTelemetryObserver();
  const reporter = new MarkdownReporter();
  const manager = sessionManager ?? new SessionManager(driver, telemetry, reporter);
  if (securityConfig) manager.setSecurityConfig(securityConfig);
  const a11yAuditor = new A11yAuditor();
  const scenarioRunner = new ScenarioRunner(manager);

  const server = new McpServer({
    name: 'ai-browser-testing',
    version: '0.3.1',
  });

  server.tool(
    'browser_open',
    'Opens target URL in browser, returns sessionId + interactive elements.',
    {
      url: z.string().url().describe('The URL to open and test (e.g. http://localhost:3000)'),
      headless: z.boolean().optional().default(true),
      width: z.number().optional().default(1280),
      height: z.number().optional().default(720),
      device: z.string().optional(),
      storageState: z.string().optional(),
      networkProfile: z.enum(['None', 'Fast 3G', 'Slow 3G', 'Offline']).optional().default('None'),
      recordTrace: z.boolean().optional().default(false),
      sessionId: z.string().optional().describe('Custom session id for multi-session parallel testing'),
    },
    async ({ url, headless, width, height, device, storageState, networkProfile, recordTrace, sessionId }) => {
      try {
        const { sessionId: sid, state } = await manager.startSession({
          url,
          headless,
          viewport: { width, height },
          device,
          storageState,
          networkProfile,
          recordTrace,
          sessionId,
        });
        return { content: [{ type: 'text', text: `✅ Opened ${url} [session: ${sid}]\n\n${state.toLLMContext()}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ Failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_act',
    'Executes an interaction on a referenced element.',
    {
      action: z.enum(['click', 'fill', 'hover', 'press', 'select', 'scroll', 'upload', 'download', 'switch_tab', 'screenshot']),
      ref: z.number().optional(),
      value: z.string().optional(),
      filePaths: z.array(z.string()).optional(),
      screenshotName: z.string().optional(),
      sessionId: z.string().optional(),
    },
    async ({ action, ref, value, filePaths, screenshotName, sessionId }) => {
      try {
        const result = await manager.executeAction({ type: action, ref, value, filePaths, screenshotName }, sessionId);
        return { content: [{ type: 'text', text: result.llmSummary }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ Action failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_assert',
    'Feature #1: Asserts page state — visibility, text, value, count, checked, etc.',
    {
      kind: z.enum(['visible', 'hidden', 'exists', 'text', 'value', 'contains', 'enabled', 'disabled', 'checked', 'count']),
      ref: z.number().optional(),
      expected: z.union([z.string(), z.number(), z.boolean()]).optional(),
      operator: z.enum(['equals', 'contains', 'gte', 'lte', 'gt', 'lt', 'regex']).optional().default('equals'),
      sessionId: z.string().optional(),
    },
    async ({ kind, ref, expected, operator, sessionId }) => {
      try {
        const { sessionId: sid, result } = await manager.assert({ kind, ref, expected, operator, sessionId });
        return {
          content: [
            {
              type: 'text',
              text: `${result.passed ? '✅ Assertion PASSED' : '❌ Assertion FAILED'}: ${result.message} [session: ${sid}]`,
            },
          ],
        };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ Assert failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_assert_perf',
    'Feature #15: Asserts Web Vitals performance budget (FCP/Load/TTFB/DCL).',
    {
      metric: z.enum(['fcp', 'load', 'ttfb', 'domContentLoaded', 'dcl']),
      thresholdMs: z.number(),
      operator: z.enum(['lte', 'lt', 'gte', 'gt', 'equals']).optional().default('lte'),
      sessionId: z.string().optional(),
    },
    async ({ metric, thresholdMs, operator, sessionId }) => {
      try {
        const { result } = await manager.assertPerformance(metric, thresholdMs, operator, sessionId);
        return {
          content: [{ type: 'text', text: `${result.passed ? '✅ Perf OK' : '❌ Perf Budget Violated'}: ${result.message}` }],
        };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_inspect',
    'Refreshes interactive element refs and all captured console/network errors.',
    { sessionId: z.string().optional() },
    async ({ sessionId }) => {
      try {
        const result = await manager.inspect(sessionId);
        return { content: [{ type: 'text', text: result.llmContext }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ Inspection failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_screenshot',
    'Takes a screenshot; supports visual regression compare against a baseline.',
    {
      name: z.string().optional(),
      fullPage: z.boolean().optional().default(false),
      compareBaseline: z.string().optional().describe('Path to baseline PNG for visual regression'),
      threshold: z.number().optional().default(0.1),
      sessionId: z.string().optional(),
    },
    async ({ name, fullPage, compareBaseline, threshold, sessionId }) => {
      try {
        const { filepath } = await manager.takeScreenshot(name, fullPage, sessionId);
        let diffMsg = '';
        if (compareBaseline) {
          const diff = await driver.compareScreenshot(filepath, compareBaseline, threshold);
          diffMsg = `\n\n🔍 Visual Regression: ${diff.message} (diff ${diff.diffPercentage}%)`;
        }
        return { content: [{ type: 'text', text: `📸 Screenshot saved: ${filepath}${diffMsg}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_switch_tab',
    'Lists open tabs or switches active tab by index.',
    { tabIndex: z.number().optional(), sessionId: z.string().optional() },
    async ({ tabIndex, sessionId }) => {
      try {
        if (tabIndex === undefined) {
          const tabs = manager.getTabs();
          const tabList = tabs.map((t) => `[Tab ${t.index}] ${t.isActive ? '👉 (Active)' : ''} URL: ${t.url}`).join('\n');
          return { content: [{ type: 'text', text: `📑 Open Tabs (${tabs.length}):\n\n${tabList}` }] };
        }
        const result = await manager.switchTab(tabIndex, sessionId);
        return { content: [{ type: 'text', text: `🔄 Switched to Tab ${tabIndex}\n\n${result.llmContext}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_save_auth',
    'Saves cookies/localStorage to JSON for reuse.',
    { path: z.string().optional(), sessionId: z.string().optional() },
    async ({ path: customPath, sessionId }) => {
      try {
        const result = await manager.saveAuthState(customPath, sessionId);
        return { content: [{ type: 'text', text: `💾 Auth saved: ${result.filepath}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_mock',
    'Feature #10: Mocks a network route (simulate 500/401 error states without backend changes).',
    {
      urlPattern: z.string(),
      status: z.number().optional().default(200),
      body: z.union([z.string(), z.record(z.unknown())]).optional(),
      contentType: z.string().optional(),
      sessionId: z.string().optional(),
    },
    async ({ urlPattern, status, body, contentType, sessionId }) => {
      try {
        await driver.routeMock({ urlPattern, status, body, contentType });
        return { content: [{ type: 'text', text: `🎭 Mocked ${urlPattern} -> ${status}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_mock_reset',
    'Removes network mocks (all or a specific pattern).',
    { urlPattern: z.string().optional(), sessionId: z.string().optional() },
    async ({ urlPattern }) => {
      try {
        await driver.routeUnmock(urlPattern);
        return { content: [{ type: 'text', text: `🧹 Mocks cleared${urlPattern ? ` for ${urlPattern}` : ''}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_audit_a11y',
    'Runs automated WCAG 2.1 AA accessibility audit on the active page.',
    { sessionId: z.string().optional() },
    async () => {
      try {
        const page = driver.getRawPage() as unknown;
        if (!page) throw new Error('No active page.');
        const result = await driver.auditA11y();
        const markdown = a11yAuditor.toMarkdownSummary(result);
        return { content: [{ type: 'text', text: markdown }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ A11y audit failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_crawl',
    'Autonomously crawls internal routes, builds sitemap, detects broken links (real HTTP status).',
    {
      url: z.string().url(),
      maxDepth: z.number().optional().default(3),
      maxPages: z.number().optional().default(20),
    },
    async ({ url, maxDepth, maxPages }) => {
      try {
        const crawlDriver = new PlaywrightDriver();
        const crawler = new SitemapCrawler(crawlDriver, telemetry);
        const result = await crawler.crawl(url, { maxDepth, maxPages });
        const markdown = crawler.toMarkdownReport(result);
        await crawlDriver.close();
        return { content: [{ type: 'text', text: markdown }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ Crawl failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_report',
    'Compiles all steps, assertions, console errors into a Markdown report.',
    {
      title: z.string().optional(),
      outputPath: z.string().optional(),
      sessionId: z.string().optional(),
    },
    async ({ title, outputPath, sessionId }) => {
      try {
        const result = await manager.generateReport({ title, outputPath }, sessionId);
        publishLiveEvent('report:generated', { path: result.filepath, status: result.report.status });
        return {
          content: [
            {
              type: 'text',
              text: `📄 Report: ${result.filepath}\nStatus: ${result.report.status}\nSteps: ${result.report.totalSteps} (Passed: ${result.report.passedSteps}, Failed: ${result.report.failedSteps})\nIssues: ${result.report.issues.length}`,
            },
          ],
        };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_report_junit',
    'Feature #11: Generates JUnit XML report for CI/CD (GitHub Actions annotations).',
    {
      outputPath: z.string().optional(),
      sessionId: z.string().optional(),
    },
    async ({ outputPath, sessionId }) => {
      try {
        const junit = new JUnitReporter();
        const result = await manager.generateReport({ outputPath }, sessionId);
        const { filepath } = await junit.generate(result.report, outputPath ?? undefined);
        return { content: [{ type: 'text', text: `🧪 JUnit report: ${filepath}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_report_html',
    'Feature #11: Generates interactive HTML report.',
    {
      outputPath: z.string().optional(),
      sessionId: z.string().optional(),
    },
    async ({ outputPath, sessionId }) => {
      try {
        const html = new HtmlReporter();
        const result = await manager.generateReport({ outputPath }, sessionId);
        const { filepath } = await html.generate(result.report, outputPath ?? undefined);
        return { content: [{ type: 'text', text: `🌐 HTML report: ${filepath}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_run_scenario',
    'Feature #4 + #14: Runs a YAML scenario file (data-driven via `data:` rows).',
    { path: z.string() },
    async ({ path: scenarioPath }) => {
      try {
        const result = await scenarioRunner.runFromYaml(scenarioPath);
        return {
          content: [
            {
              type: 'text',
              text: `${result.passed ? '✅ Scenario PASSED' : '❌ Scenario FAILED'}: ${result.name}\nSteps: ${result.stepsExecuted}\nFailures: ${result.failures.join('\n') || 'none'}`,
            },
          ],
        };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_sessions',
    'Lists all active multi-sessions.',
    {},
    async () => {
      try {
        const sessions = manager.listSessions();
        const text = sessions.length === 0 ? 'No active sessions.' : sessions.map((s) => `[${s.id}] ${s.url} (${s.status}, ${s.actions} actions, ${s.issues} issues)`).join('\n');
        return { content: [{ type: 'text', text: `📚 Active Sessions:\n${text}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_health',
    'Health check: browser alive, version, pages, artifact usage.',
    {},
    async () => {
      try {
        const health = await (driver as unknown as { healthCheck?: () => Promise<unknown> }).healthCheck?.() ?? { alive: driver.isAlive() };
        const sessions = manager.listSessions();
        return { content: [{ type: 'text', text: `🏥 Health: ${JSON.stringify({ health, sessions: sessions.length }, null, 2)}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_wait_for',
    'Waits for element [ref] to reach visible/hidden/attached/detached state.',
    { ref: z.number(), state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().default('visible'), timeoutMs: z.number().optional().default(10000), sessionId: z.string().optional() },
    async ({ ref, state, timeoutMs }) => {
      try {
        await (driver as unknown as { waitForSelector?: (r: number, s: string, t: number) => Promise<void> }).waitForSelector?.(ref, state, timeoutMs);
        return { content: [{ type: 'text', text: `✅ [ref=${ref}] reached ${state}` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ waitFor failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_extract',
    'Extracts text/value/html/href from element [ref] for variable chaining.',
    { ref: z.number(), attribute: z.enum(['text', 'value', 'html', 'href']).optional().default('text'), sessionId: z.string().optional() },
    async ({ ref, attribute }) => {
      try {
        const val = await (driver as unknown as { extractValue?: (r: number, a: string) => Promise<string> }).extractValue?.(ref, attribute) ?? '';
        return { content: [{ type: 'text', text: `📋 [ref=${ref}] ${attribute}="${val}"` }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ extract failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_live_screenshot',
    'Returns live base64 screenshot for dashboards (no file write).',
    { fullPage: z.boolean().optional().default(false) },
    async ({ fullPage }) => {
      try {
        const b64 = await (driver as unknown as { captureScreenshotBase64?: (fp: boolean) => Promise<string> }).captureScreenshotBase64?.(fullPage) ?? '';
        return { content: [{ type: 'text', text: `📸 LIVE_SCREENSHOT_BASE64:${b64.slice(0, 80)}... (${b64.length} chars)` }, { type: 'image', data: b64, mimeType: 'image/png' } as unknown as { type: 'text'; text: string }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    'browser_close',
    'Closes browser session and releases resources.',
    { sessionId: z.string().optional() },
    async ({ sessionId }) => {
      try {
        await manager.closeSession(sessionId);
        return { content: [{ type: 'text', text: '🔒 Session closed & cleaned up.' }] };
      } catch (err: unknown) {
        return { isError: true, content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  return server;
}

export async function runMcpServer(sessionManager?: SessionManager, securityConfig?: SecurityConfig): Promise<void> {
  const server = createMcpServer(sessionManager, securityConfig);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
