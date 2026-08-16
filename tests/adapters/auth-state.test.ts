import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('Auth State Persistence (Cookies & StorageState)', () => {
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

  it('saves and re-loads authentication cookies/localStorage via storageState', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/login') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': 'auth_token=supersecretjwt123; Path=/; HttpOnly',
        });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Welcome Authenticated User</h1>
              <script>
                localStorage.setItem('user_role', 'admin');
              </script>
            </body>
          </html>
        `);
      } else if (req.url === '/profile') {
        const cookie = req.headers.cookie || '';
        if (cookie.includes('auth_token=supersecretjwt123')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html><html><body><h1>Admin Dashboard</h1></body></html>`);
        } else {
          res.writeHead(401, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html><html><body><h1>Unauthorized</h1></body></html>`);
        }
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

    // 1. Open login page
    await sessionManager.startSession({
      url: `${serverUrl}/login`,
      headless: true,
    });

    // 2. Save auth state to artifact
    const authDir = path.resolve(process.cwd(), 'artifacts', 'auth');
    await fs.mkdir(authDir, { recursive: true });
    const authPath = path.join(authDir, `test-auth-${Date.now()}.json`);

    const saveResult = await sessionManager.saveAuthState(authPath);
    expect(saveResult.filepath).toBe(authPath);

    // Check file exists
    const fileData = await fs.readFile(authPath, 'utf-8');
    const parsedData = JSON.parse(fileData);
    expect(parsedData.cookies.some((c: { name: string; value: string }) => c.name === 'auth_token' && c.value === 'supersecretjwt123')).toBe(true);

    // 3. Close current session
    await sessionManager.closeSession();

    // 4. Start new session with loaded storageState pointing to protected /profile
    const secondDriver = new PlaywrightDriver();
    const secondSessionManager = new SessionManager(secondDriver, telemetry, reporter);

    const { state } = await secondSessionManager.startSession({
      url: `${serverUrl}/profile`,
      storageState: authPath,
      headless: true,
    });

    expect(state.title).toBe('');
    const inspection = await secondSessionManager.inspect();
    expect(inspection.state.url).toContain('/profile');
    await secondSessionManager.closeSession();

    // Cleanup temp auth file
    await fs.unlink(authPath).catch(() => {});
  });
});
