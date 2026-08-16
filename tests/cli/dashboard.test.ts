import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { DashboardServer } from '../../src/adapters/inbound/ui/dashboard-server.js';

describe('Local Web UI Dashboard Server', () => {
  let dashboard: DashboardServer;

  afterEach(async () => {
    if (dashboard) {
      await dashboard.stop().catch(() => {});
    }
  });

  it('starts local HTTP server, serves dashboard HTML and /api/reports endpoint', async () => {
    const tempReports = path.resolve(process.cwd(), 'artifacts', 'test-reports-dummy');
    await fs.mkdir(tempReports, { recursive: true });
    await fs.writeFile(path.join(tempReports, 'sample-report.md'), '# Dummy Test Report\nstatus: "PASSED"', 'utf-8');

    dashboard = new DashboardServer({ reportsDir: tempReports });
    const { url } = await dashboard.start(0);

    // 1. Test HTML endpoint
    const htmlRes = await fetch(`${url}/`);
    expect(htmlRes.status).toBe(200);
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('AI Web Tester Dashboard');

    // 2. Test API reports endpoint
    const apiRes = await fetch(`${url}/api/reports`);
    expect(apiRes.status).toBe(200);
    const apiJson = (await apiRes.json()) as { reports: Array<{ filename: string; content: string }> };
    expect(apiJson.reports.length).toBeGreaterThanOrEqual(1);
    expect(apiJson.reports.some((r) => r.filename === 'sample-report.md')).toBe(true);

    // Cleanup
    await fs.unlink(path.join(tempReports, 'sample-report.md')).catch(() => {});
  });
});
