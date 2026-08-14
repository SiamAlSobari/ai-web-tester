import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('Senior QA Multi-Scenario Test Matrix (Positive, Negative, Boundary & Security)', () => {
  let server: http.Server;
  let serverUrl = '';
  const port = 9283;

  const htmlApp = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Enterprise QA Portal</title>
  <style>
    .error { color: red; display: none; }
    .success { color: green; display: none; }
  </style>
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <h1>Enterprise Login Portal</h1>
  
  <div id="alert-error" class="error"></div>
  <div id="alert-success" class="success">Welcome, Admin! Access Granted.</div>

  <form id="auth-form">
    <div>
      <label for="email">Work Email</label>
      <input id="email" type="text" placeholder="name@company.com" />
      <span id="email-error" class="error">Valid corporate email is required</span>
    </div>

    <div style="margin-top: 10px;">
      <label for="password">Password</label>
      <input id="password" type="password" placeholder="Min 6 characters" />
      <span id="pass-error" class="error">Password must be at least 6 characters</span>
    </div>

    <div style="margin-top: 15px;">
      <button id="btn-submit" type="button" onclick="handleLogin()">Sign In</button>
      <button id="btn-reset" type="button" onclick="resetForm()">Reset</button>
    </div>
  </form>

  <script>
    function handleLogin() {
      const email = document.getElementById('email').value.trim();
      const pass = document.getElementById('password').value;
      const alertErr = document.getElementById('alert-error');
      const alertSuccess = document.getElementById('alert-success');
      const emailErr = document.getElementById('email-error');
      const passErr = document.getElementById('pass-error');

      // Reset errors
      alertErr.style.display = 'none';
      alertSuccess.style.display = 'none';
      emailErr.style.display = 'none';
      passErr.style.display = 'none';

      // 1. Empty Check
      if (!email || !pass) {
        if (!email) emailErr.style.display = 'block';
        if (!pass) passErr.style.display = 'block';
        return;
      }

      // 2. Email format check
      if (!email.includes('@') || !email.includes('.')) {
        emailErr.style.display = 'block';
        return;
      }

      // 3. Password length check
      if (pass.length < 6) {
        passErr.style.display = 'block';
        return;
      }

      // 4. Security Edge Case check (safe handling without crash)
      if (email.includes("'") || email.includes("<script>")) {
        alertErr.innerText = 'Security Violation: Malicious characters detected.';
        alertErr.style.display = 'block';
        console.warn('Security audit log: potential injection pattern detected in input');
        return;
      }

      // 5. Wrong Credentials Check
      if (email === 'valid@company.com' && pass === 'wrongpassword') {
        alertErr.innerText = 'Invalid email or password.';
        alertErr.style.display = 'block';
        return;
      }

      // 6. Happy Path
      if (email === 'valid@company.com' && pass === 'correctpass123') {
        alertSuccess.style.display = 'block';
        return;
      }

      alertErr.innerText = 'User account does not exist.';
      alertErr.style.display = 'block';
    }

    function resetForm() {
      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      document.getElementById('alert-error').style.display = 'none';
      document.getElementById('alert-success').style.display = 'none';
      document.getElementById('email-error').style.display = 'none';
      document.getElementById('pass-error').style.display = 'none';
    }
  </script>
</body>
</html>`;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlApp);
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

  it('runs 5-scenario Senior QA matrix on auth flow and compiles comprehensive report', async () => {
    const driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    // Initial Open
    const { state } = await manager.startSession({ url: serverUrl, headless: true });
    expect(state.title).toBe('Enterprise QA Portal');

    // Resolve refs
    let emailRef = 0;
    let passRef = 0;
    let submitRef = 0;

    for (const [ref, el] of state.elements.entries()) {
      if (el.name.includes('Work Email') || el.placeholder?.includes('company.com')) emailRef = ref;
      if (el.name.includes('Password') || el.placeholder?.includes('characters')) passRef = ref;
      if (el.name === 'Sign In') submitRef = ref;
    }

    expect(emailRef).toBeGreaterThan(0);
    expect(passRef).toBeGreaterThan(0);
    expect(submitRef).toBeGreaterThan(0);

    // === SCENARIO 1: Empty Fields (Negative) ===
    await manager.executeAction({ type: 'click', ref: submitRef });
    let snapshot = await manager.inspect();
    expect(snapshot.state.elements.size).toBeGreaterThanOrEqual(3);

    // === SCENARIO 2: Invalid Email Format (Negative) ===
    await manager.executeAction({ type: 'fill', ref: emailRef, value: 'invalid-email' });
    await manager.executeAction({ type: 'fill', ref: passRef, value: '123' });
    await manager.executeAction({ type: 'click', ref: submitRef });

    // === SCENARIO 3: Security & Injection Payload (Edge Case) ===
    await manager.executeAction({ type: 'fill', ref: emailRef, value: "' OR '1'='1" });
    await manager.executeAction({ type: 'fill', ref: passRef, value: 'secretpass' });
    await manager.executeAction({ type: 'click', ref: submitRef });

    // === SCENARIO 4: Wrong Credentials (Negative) ===
    await manager.executeAction({ type: 'fill', ref: emailRef, value: 'valid@company.com' });
    await manager.executeAction({ type: 'fill', ref: passRef, value: 'wrongpassword' });
    await manager.executeAction({ type: 'click', ref: submitRef });

    // === SCENARIO 5: Happy Path - Valid Login (Positive) ===
    await manager.executeAction({ type: 'fill', ref: emailRef, value: 'valid@company.com' });
    await manager.executeAction({ type: 'fill', ref: passRef, value: 'correctpass123' });
    await manager.executeAction({ type: 'click', ref: submitRef });

    // Screenshot after success
    await manager.takeScreenshot('qa-matrix-success.png');

    // Generate Final Senior QA Report
    const reportPath = path.resolve(process.cwd(), 'test-reports', 'senior-qa-matrix-report.md');
    const reportResult = await manager.generateReport({
      title: 'Enterprise Authentication - Senior QA Test Matrix',
      outputPath: reportPath,
    });

    expect(reportResult.filepath).toBe(reportPath);
    expect(reportResult.report.totalSteps).toBe(13);
    expect(reportResult.report.passedSteps).toBe(13);
    expect(reportResult.content).toContain('Enterprise Authentication - Senior QA Test Matrix');
    expect(reportResult.content).toContain('valid@company.com');
    expect(reportResult.content).toContain('correctpass123');

    // Close session
    await manager.closeSession();

    // Clean up report
    await fs.unlink(reportPath).catch(() => {});
  }, 45000);
});
