import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SessionManager } from '../../../application/session-manager.js';
import { PlaywrightDriver } from '../../outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../outbound/reporter/markdown-reporter.js';

export function createMcpServer(sessionManager?: SessionManager): McpServer {
  const driver = new PlaywrightDriver();
  const telemetry = new PlaywrightTelemetryObserver();
  const reporter = new MarkdownReporter();
  const manager = sessionManager ?? new SessionManager(driver, telemetry, reporter);

  const server = new McpServer({
    name: 'ai-browser-testing',
    version: '0.1.0',
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
    },
    async ({ url, headless, width, height }) => {
      try {
        const { state } = await manager.startSession({
          url,
          headless,
          viewport: { width, height },
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
    'Executes an interaction on a referenced element (click, fill, hover, press, select, scroll, screenshot).',
    {
      action: z
        .enum(['click', 'fill', 'hover', 'press', 'select', 'scroll', 'screenshot'])
        .describe('Action type to execute (click, fill, hover, press, select, scroll, screenshot)'),
      ref: z.number().optional().describe('Element ref ID to interact with, or element to scroll into view'),
      value: z.string().optional().describe('Value to fill, key to press, option to select, or scroll direction ("down", "up", "bottom", "top", or pixel number)'),
      screenshotName: z.string().optional().describe('Custom name if action is screenshot'),
    },
    async ({ action, ref, value, screenshotName }) => {
      try {
        const result = await manager.executeAction({
          type: action,
          ref,
          value,
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

  // Tool 5: browser_report
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

  // Tool 6: browser_close
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
