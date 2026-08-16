import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('Multi-Tab & OAuth Popup Management', () => {
  let server: http.Server;
  let serverUrl: string;
  let driver: PlaywrightDriver;
  let sessionManager: SessionManager;

  afterEach(async () => {
    if (sessionManager) {
      await sessionManager.closeSession().catch(() => {});
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('tracks popup tabs and allows switching between active pages', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Main Page</h1>
              <a id="popup-link" href="/popup" target="_blank">Open OAuth Popup</a>
            </body>
          </html>
        `);
      } else if (req.url === '/popup') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>OAuth Authentication Dialog</h1>
              <button id="authorize-btn">Authorize AI Web Tester</button>
            </body>
          </html>
        `);
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    sessionManager = new SessionManager(driver, telemetry, reporter);

    // 1. Open Main page
    const { state: initialState } = await sessionManager.startSession({
      url: serverUrl,
      headless: true,
    });

    // Find popup link ref
    let popupLinkRef: number | undefined;
    for (const [ref, el] of initialState.elements.entries()) {
      if (el.tag === 'a' || el.name.includes('Open OAuth Popup')) {
        popupLinkRef = ref;
      }
    }
    expect(popupLinkRef).toBeDefined();

    // 2. Click popup link
    await sessionManager.executeAction({
      type: 'click',
      ref: popupLinkRef,
    });

    // Give brief time for popup page to register
    await new Promise((r) => setTimeout(r, 600));

    // 3. Inspect tabs
    const tabs = sessionManager.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    // 4. Switch to popup tab
    const switchResult = await sessionManager.switchTab(1);
    expect(switchResult.state.url).toContain('/popup');
    expect(switchResult.llmContext).toContain('Authorize AI Web Tester');
  });
});
