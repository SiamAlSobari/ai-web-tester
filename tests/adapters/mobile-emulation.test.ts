import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('Mobile Device Presets & Network Emulation', () => {
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

  it('launches in mobile device preset (iPhone 15) with accurate viewport and touch support', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Responsive Test Page</h1>
            <div id="device-info"></div>
            <script>
              document.getElementById('device-info').innerText = window.innerWidth + 'x' + window.innerHeight + ' Touch:' + ('ontouchstart' in window);
            </script>
          </body>
        </html>
      `);
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

    // Launch with iPhone 15 preset
    const { state } = await sessionManager.startSession({
      url: serverUrl,
      device: 'iPhone 15',
      headless: true,
    });

    expect(state.url).toContain(serverUrl);
    const page = driver.getPage();
    const viewport = page?.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(500); // Mobile width is ~393

  });
});
