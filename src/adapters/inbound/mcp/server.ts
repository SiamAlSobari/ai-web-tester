import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SessionManager } from '../../../application/session-manager.js';
import { PlaywrightDriver } from '../../outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../outbound/reporter/markdown-reporter.js';
import { SitemapCrawler } from '../../../application/crawler/sitemap-crawler.js';
import { A11yAuditor } from '../../outbound/a11y/a11y-auditor.js';

export function createMcpServer(sessionManager?: SessionManager): McpServer {
  const driver = new PlaywrightDriver();
  const telemetry = new PlaywrightTelemetryObserver();
  const reporter = new MarkdownReporter();
  const manager = sessionManager ?? new SessionManager(driver, telemetry, reporter);
  const a11yAuditor = new A11yAuditor();

  const server = new McpServer({
    name: 'ai-browser-testing',
    version: '0.2.3',
  });


  // Tool 1: browser_open
  server.tool(
    'browser_open',
    'Opens target URL in browser, extracts interactive elements with ref IDs, and returns initial state.',
    {
      url: z.string().url().describe('The URL to open and test (e.g. http://localhost:3000)'),
      headless: z.boolean().optional().default(true).describe('Run browser in headless background mode (default true for lightweight execution)'),
      width: z.number().optional().default(1280).describe('Browser viewport width'),
      height: z.number().optional().default(720).describe('Browser viewport height'),
      device: z.string().optional().describe('Mobile device preset to emulate (e.g. "iPhone 15", "Pixel 7", "iPad Pro 11")'),
      storageState: z.string().optional().describe('Path to saved auth state JSON file (cookies/localStorage)'),
      networkProfile: z.enum(['None', 'Fast 3G', 'Slow 3G', 'Offline']).optional().default('None').describe('Network throttling profile'),
      recordTrace: z.boolean().optional().default(false).describe('Record full Playwright trace (.zip) for deep debugging'),
    },
    async ({ url, headless, width, height, device, storageState, networkProfile, recordTrace }) => {
      try {
        const { state } = await manager.startSession({
          url,
          headless,
          viewport: { width, height },
          device,
          storageState,
          networkProfile,
          recordTrace,
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully opened ${url}\n\n${state.toLLMContext()}`,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to open URL: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 2: browser_act
  server.tool(
    'browser_act',
    'Executes an interaction on a referenced element (click, fill, hover, press, select, scroll, upload, download, switch_tab, screenshot).',
    {
      action: z
        .enum(['click', 'fill', 'hover', 'press', 'select', 'scroll', 'upload', 'download', 'switch_tab', 'screenshot'])
        .describe('Action type to execute'),
      ref: z.number().optional().describe('Element ref ID to interact with, or element to scroll into view / upload to / download from'),
      value: z.string().optional().describe('Value to fill, key to press, option to select, download save path, or scroll direction ("down", "up", "bottom", "top")'),
      filePaths: z.array(z.string()).optional().describe('Array of absolute file paths if action is upload'),
      screenshotName: z.string().optional().describe('Custom name if action is screenshot'),
    },
    async ({ action, ref, value, filePaths, screenshotName }) => {
      try {
        const result = await manager.executeAction({
          type: action,
          ref,
          value,
          filePaths,
          screenshotName,
        });

        return {
          content: [
            {
              type: 'text',
              text: result.llmSummary,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Action failed: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 3: browser_inspect
  server.tool(
    'browser_inspect',
    'Inspects current page state, refreshed interactive element refs, and all captured console/network errors.',
    {},
    async () => {
      try {
        const result = await manager.inspect();
        return {
          content: [
            {
              type: 'text',
              text: result.llmContext,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Inspection failed: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 4: browser_screenshot
  server.tool(
    'browser_screenshot',
    'Takes a screenshot of the current page and saves it to artifacts directory.',
    {
      name: z.string().optional().describe('Screenshot filename (e.g. login-error)'),
      fullPage: z.boolean().optional().default(false).describe('Capture full scrollable page'),
    },
    async ({ name, fullPage }) => {
      try {
        const { filepath } = await manager.takeScreenshot(name, fullPage);
        return {
          content: [
            {
              type: 'text',
              text: `📸 Screenshot saved successfully to: ${filepath}`,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to capture screenshot: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 5: browser_switch_tab
  server.tool(
    'browser_switch_tab',
    'Lists open tabs or switches active browser tab/popup by index.',
    {
      tabIndex: z.number().optional().describe('Zero-based index of the tab to activate. If omitted, returns list of open tabs.'),
    },
    async ({ tabIndex }) => {
      try {
        if (tabIndex === undefined) {
          const tabs = manager.getTabs();
          const tabList = tabs.map((t) => `[Tab ${t.index}] ${t.isActive ? '👉 (Active)' : ''} URL: ${t.url}`).join('\n');
          return {
            content: [{ type: 'text', text: `📑 Open Tabs (${tabs.length}):\n\n${tabList}` }],
          };
        }

        const result = await manager.switchTab(tabIndex);
        return {
          content: [
            {
              type: 'text',
              text: `🔄 Switched to Tab ${tabIndex}\n\n${result.llmContext}`,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to switch tab: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 6: browser_save_auth
  server.tool(
    'browser_save_auth',
    'Saves current browser session cookies and localStorage to a JSON file for re-use in future tests.',
    {
      path: z.string().optional().describe('Custom file path to save auth JSON (defaults to ./artifacts/auth/auth-[timestamp].json)'),
    },
    async ({ path: customPath }) => {
      try {
        const result = await manager.saveAuthState(customPath);
        return {
          content: [
            {
              type: 'text',
              text: `💾 Auth state saved successfully to: ${result.filepath}\nUse this path in future browser_open calls via storageState parameter.`,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to save auth state: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 7: browser_audit_a11y
  server.tool(
    'browser_audit_a11y',
    'Runs automated WCAG 2.1 AA accessibility audit on the active page via axe-core.',
    {},
    async () => {
      try {
        const activeDriver = (manager as unknown as { driver: PlaywrightDriver }).driver;
        const page = activeDriver?.getPage();
        if (!page) {
          throw new Error('No active page to audit.');
        }

        const result = await a11yAuditor.audit(page);
        const markdown = a11yAuditor.toMarkdownSummary(result);
        return {
          content: [{ type: 'text', text: markdown }],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ A11y audit failed: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 8: browser_crawl
  server.tool(
    'browser_crawl',
    'Autonomously explores internal website routes, builds sitemap hierarchy tree, and detects 404/broken links.',
    {
      url: z.string().url().describe('The root URL to start crawling from'),
      maxDepth: z.number().optional().default(3).describe('Maximum crawl depth (default 3)'),
      maxPages: z.number().optional().default(20).describe('Maximum pages to visit (default 20)'),
    },
    async ({ url, maxDepth, maxPages }) => {
      try {
        const crawlDriver = new PlaywrightDriver();
        const crawler = new SitemapCrawler(crawlDriver);
        const result = await crawler.crawl(url, { maxDepth, maxPages });
        const markdown = crawler.toMarkdownReport(result);
        await crawlDriver.close();
        return {
          content: [{ type: 'text', text: markdown }],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Crawl failed: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 9: browser_report
  server.tool(
    'browser_report',
    'Compiles all test steps, captured console errors, failed assertions, and screenshots into a Markdown (.md) test report file.',
    {
      title: z.string().optional().describe('Title of the test report (e.g. Authentication Flow Test)'),
      outputPath: z.string().optional().describe('Custom file path to save the .md report'),
    },
    async ({ title, outputPath }) => {
      try {
        const result = await manager.generateReport({ title, outputPath });
        return {
          content: [
            {
              type: 'text',
              text: `📄 Test Report generated successfully!\n\n**File Location:** \`${result.filepath}\`\n**Status:** ${result.report.status}\n**Total Steps:** ${result.report.totalSteps} (Passed: ${result.report.passedSteps}, Failed: ${result.report.failedSteps})\n**Issues Found:** ${result.report.issues.length}\n\n---\n\n${result.content}`,
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to generate report: ${errorMsg}` }],
        };
      }
    }
  );

  // Tool 10: browser_close
  server.tool(
    'browser_close',
    'Closes current active browser testing session and releases system resources.',
    {},
    async () => {
      try {
        await manager.closeSession();
        return {
          content: [
            {
              type: 'text',
              text: '🔒 Browser session closed and resources cleaned up.',
            },
          ],
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Failed to close session: ${errorMsg}` }],
        };
      }
    }
  );

  return server;
}

export async function runMcpServer(sessionManager?: SessionManager): Promise<void> {
  const server = createMcpServer(sessionManager);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
