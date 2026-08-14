import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('End-to-End Integration Suite (Real Playwright + HTTP Fixture)', () => {
  let server: http.Server;
  let serverUrl = '';
  const port = 9182;

  const htmlFixture = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AI Browser Testing Fixture</title>
</head>
<body style="font-family: sans-serif; padding: 20px;">
  <h1>Test Portal</h1>
  <div id="status-box">Ready</div>

  <form id="login-form" onsubmit="event.preventDefault(); document.getElementById('status-box').innerText = 'Login Success';">
    <label for="email">Email</label>
    <input id="email" type="email" placeholder="name@domain.com" required />

    <label for="password">Password</label>
    <input id="password" type="password" required />

    <label for="role">Role</label>
    <select id="role">
      <option value="admin">Administrator</option>
      <option value="member">Standard Member</option>
    </select>

    <button id="btn-login" type="submit">Sign In</button>
  </form>

  <button id="btn-error" type="button" onclick="console.error('Simulated React Uncaught Error');">Trigger Error</button>
</body>
</html>`;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlFixture);
    });

    await new Promise<void>((resolve) => {
      server.listen(port, '127.0.0.1', () => {
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('executes full automated flow, captures telemetry, and generates .md report', async () => {
    const driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    // 1. Open URL
    const { session, state } = await manager.startSession({
      url: serverUrl,
      headless: true,
    });

    expect(session.status).toBe('ACTIVE');
    expect(state.title).toBe('AI Browser Testing Fixture');
    expect(state.elements.size).toBeGreaterThanOrEqual(4);

    // Find email input ref
    let emailRef: number | undefined;
    let errorBtnRef: number | undefined;
    let submitBtnRef: number | undefined;

    for (const [ref, el] of state.elements.entries()) {
      if (el.type === 'email' || el.name === 'Email') emailRef = ref;
      if (el.name === 'Trigger Error') errorBtnRef = ref;
      if (el.name === 'Sign In') submitBtnRef = ref;
    }

    expect(emailRef).toBeDefined();
    expect(errorBtnRef).toBeDefined();
    expect(submitBtnRef).toBeDefined();

    // 2. Fill Email
    const fillResult = await manager.executeAction({
      type: 'fill',
      ref: emailRef!,
      value: 'qa-tester@company.com',
    });
    expect(fillResult.action.status).toBe('PASSED');

    // 3. Trigger Console Error
    const errorBtnResult = await manager.executeAction({
      type: 'click',
      ref: errorBtnRef!,
    });
    expect(errorBtnResult.action.status).toBe('PASSED');

    // Verify telemetry captured the error
    const issues = telemetry.getIssues();
    expect(issues.some((i) => i.message.includes('Simulated React Uncaught Error'))).toBe(true);

    // 4. Submit form
    const submitResult = await manager.executeAction({
      type: 'click',
      ref: submitBtnRef!,
    });
    expect(submitResult.action.status).toBe('PASSED');

    // 5. Take screenshot
    const screenshot = await manager.takeScreenshot('e2e-result.png');
    expect(screenshot.filepath).toContain('.png');

    // 6. Generate Markdown Report (.md)
    const reportOutPath = path.resolve(process.cwd(), 'test-reports', 'e2e-test-report.md');
    const reportResult = await manager.generateReport({
      title: 'E2E Health & Form Validation Test',
      outputPath: reportOutPath,
    });

    expect(reportResult.filepath).toBe(reportOutPath);
    expect(reportResult.report.totalSteps).toBe(3);
    expect(reportResult.report.passedSteps).toBe(3);
    expect(reportResult.report.status).toBe('FAILED'); // Failed because console error was detected
    expect(reportResult.content).toContain('Simulated React Uncaught Error');
    expect(reportResult.content).toContain('qa-tester@company.com');
    expect(reportResult.content).toContain('---');

    // Verify report file was created on disk
    const fileExists = await fs.stat(reportOutPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    // 7. Close Session
    await manager.closeSession();
    expect(driver.isAlive()).toBe(false);

    // Clean up report artifact
    await fs.unlink(reportOutPath).catch(() => {});
  }, 45000);
});
