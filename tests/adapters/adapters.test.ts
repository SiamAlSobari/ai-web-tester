import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ProcessGuard } from '../../src/shared/guards/process-guard.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';
import { TestReport } from '../../src/domain/entities/test-report.entity.js';
import { Action } from '../../src/domain/entities/action.entity.js';
import { Issue } from '../../src/domain/entities/issue.entity.js';

describe('Outbound Adapters & Safety Guards', () => {
  it('ProcessGuard registers and executes cleanups', async () => {
    let cleaned = false;
    const unregister = ProcessGuard.register(() => {
      cleaned = true;
    });

    expect(typeof unregister).toBe('function');
    await ProcessGuard.runAllCleanups();
    expect(cleaned).toBe(true);
  });

  it('PlaywrightTelemetryObserver filters and stores issues', () => {
    const observer = new PlaywrightTelemetryObserver();
    expect(observer.getIssues().length).toBe(0);

    observer.clear();
    expect(observer.getIssues().length).toBe(0);
  });

  it('MarkdownReporter generates valid .md file with frontmatter', async () => {
    const reporter = new MarkdownReporter();

    const act1 = Action.create(1, 'navigate', { value: 'http://localhost:3000' });
    act1.complete();

    const act2 = Action.create(2, 'click', { targetRef: 3, targetDescription: 'button "Submit"' });
    act2.fail('Click intercepted');

    const issue = Issue.create('CONSOLE_ERROR', 'Uncaught SyntaxError on line 12', 'http://localhost:3000');

    const report = TestReport.fromSession(
      'Checkout Page Flow Test',
      [act1, act2],
      [issue],
      ['./test-reports/shot-1.png'],
      'http://localhost:3000',
      new Date().toISOString()
    );

    const testOutputPath = path.resolve(process.cwd(), 'test-reports', `test-out-${Date.now()}.md`);
    const { filepath, content } = await reporter.generate(report, testOutputPath);

    expect(filepath).toBe(testOutputPath);
    expect(content).toContain('test_run_id:');
    expect(content).toContain('status: "FAILED"');
    expect(content).toContain('# 📋 Laporan Hasil Pengujian: Checkout Page Flow Test');
    expect(content).toContain('Uncaught SyntaxError');

    // Clean up temporary test file
    await fs.unlink(filepath).catch(() => {});
  });
});
