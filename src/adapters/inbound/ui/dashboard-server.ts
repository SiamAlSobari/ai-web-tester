import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { subscribe } from '../../../shared/events/live-bus.js';

export interface DashboardServerOptions {
  port?: number;
  reportsDir?: string;
  artifactsDir?: string;
}

export class DashboardServer {
  private server: http.Server | null = null;

  constructor(private readonly options?: DashboardServerOptions) {}

  async start(port = 3100): Promise<{ server: http.Server; url: string }> {
    const reportsDir = this.options?.reportsDir || path.resolve(process.cwd(), 'test-reports');
    const artifactsDir = this.options?.artifactsDir || path.resolve(process.cwd(), 'artifacts');

    await fs.mkdir(reportsDir, { recursive: true });
    await fs.mkdir(artifactsDir, { recursive: true });

    this.server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;

      // Enable CORS for flexibility
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Feature #12: SSE live event stream
      if (pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const send = (event: { type: string; payload: unknown; timestamp: string }) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        const unsub = subscribe(send);
        req.on('close', () => unsub());
        return;
      }

      // API: List test reports (paginated)
      if (pathname === '/api/reports') {
        try {
          const page = parseInt(parsedUrl.searchParams.get('page') ?? '1', 10);
          const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '20', 10), 50);
          const allFiles = await fs.readdir(reportsDir);
          const mdFiles = allFiles.filter((f) => f.endsWith('.md') || f.endsWith('.html') || f.endsWith('.xml'));
          // Sort by mtime desc without reading all
          const withStat = await Promise.all(mdFiles.map(async (f) => ({ f, stat: await fs.stat(path.join(reportsDir, f)).catch(() => null) })));
          withStat.sort((a, b) => (b.stat?.mtime.getTime() ?? 0) - (a.stat?.mtime.getTime() ?? 0));
          const total = withStat.length;
          const slice = withStat.slice((page - 1) * limit, page * limit);
          const reports = [];
          for (const { f, stat } of slice) {
            const content = await fs.readFile(path.join(reportsDir, f), 'utf-8');
            reports.push({ filename: f, content: content.slice(0, 8000), fullLength: content.length, modifiedAt: stat?.mtime ?? new Date() });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reports, total, page, limit }));
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to read reports' }));
        }
        return;
      }
      // API: single report full content
      if (pathname.startsWith('/api/report/')) {
        const fname = decodeURIComponent(pathname.replace('/api/report/', ''));
        if (fname.includes('..') || fname.includes('/') || fname.includes('\\')) {
          res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Invalid filename'); return;
        }
        try {
          const content = await fs.readFile(path.join(reportsDir, fname), 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(content);
        } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
        return;
      }

      // Serve Artifacts (images, diffs, downloads) — path traversal guard
      if (pathname.startsWith('/artifacts/')) {
        const relPath = pathname.replace('/artifacts/', '');
        if (relPath.includes('..')) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Invalid path'); return; }
        const targetPath = path.join(artifactsDir, relPath);
        const resolved = path.resolve(targetPath);
        if (!resolved.startsWith(path.resolve(artifactsDir))) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return; }
        try {
          const fileBuf = await fs.readFile(targetPath);
          const ext = path.extname(targetPath).toLowerCase();
          const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(fileBuf);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Artifact not found');
        }
        return;
      }

      // Serve Main Dashboard HTML
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderDashboardHtml());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, '0.0.0.0', () => resolve());
      this.server!.on('error', reject);
    });

    const actualPort = (this.server.address() as { port: number }).port;
    const url = `http://localhost:${actualPort}`;
    return { server: this.server, url };
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private renderDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Web Tester | Local Quality Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0f1c;
      --card-bg: #0f172a;
      --border: #1e293b;
      --border-focus: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #f59e0b;
      --cyan: #38bdf8;
      --success: #4ade80;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); padding: 24px; font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .container { max-width: 1280px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .logo-badge { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; letter-spacing: 0.1em; color: var(--text); }
    .logo-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--primary); }
    .header-sub { color: var(--text-muted); font-size: 12px; margin-top: 4px; font-family: 'JetBrains Mono', monospace; }
    .btn { background: var(--primary); color: #000; border: none; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; font-family: 'IBM Plex Sans', sans-serif; }
    .btn:hover { opacity: 0.9; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
    .metric-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; }
    .metric-val { font-size: 26px; font-weight: 700; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
    .main-grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; }
    .report-list { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; height: 620px; overflow-y: auto; }
    .report-item { padding: 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
    .report-item:hover, .report-item.active { background: #1e293b; }
    .report-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; font-family: 'JetBrains Mono', monospace; color: #e2e8f0; }
    .report-meta { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono', monospace; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge-passed { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-failed { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .viewer { background: #020617; border: 1px solid var(--border); border-radius: 10px; padding: 24px; height: 620px; overflow-y: auto; white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.6; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="logo-badge">
          <div class="logo-dot"></div>
          <span>AI Web Tester Dashboard</span>
        </div>
        <div class="header-sub">Local Execution Telemetry & Quality Reports</div>
      </div>
      <button class="btn" onclick="loadReports()">Refresh Data</button>
    </header>

    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">Total Test Runs</div>
        <div class="metric-val" id="m-total">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Passed Runs</div>
        <div class="metric-val" id="m-passed" style="color: var(--success);">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Failed / Issues</div>
        <div class="metric-val" id="m-failed" style="color: var(--danger);">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Success Rate</div>
        <div class="metric-val" id="m-rate" style="color: var(--cyan);">100%</div>
      </div>
    </div>

    <div class="main-grid">
      <div class="report-list" id="report-list">
        <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading reports...</div>
      </div>
      <div class="viewer" id="report-viewer">
        Select a test report on the left panel to inspect its execution trace, assertions, and issues.
      </div>
    </div>
  </div>

  <script>
    let reportsData = [];

    async function loadReports() {
      try {
        const res = await fetch('/api/reports');
        const data = await res.json();
        reportsData = data.reports || [];
        renderList();
        updateMetrics();
      } catch (err) {
        console.error(err);
      }
    }

    function updateMetrics() {
      const total = reportsData.length;
      let passed = 0;
      let failed = 0;
      reportsData.forEach(r => {
        if (r.content.includes('status: "PASSED"') || r.content.includes('[PASS]')) {
          passed++;
        } else {
          failed++;
        }
      });
      document.getElementById('m-total').innerText = total;
      document.getElementById('m-passed').innerText = passed;
      document.getElementById('m-failed').innerText = failed;
      const rate = total > 0 ? Math.round((passed / total) * 100) : 100;
      document.getElementById('m-rate').innerText = rate + '%';
    }

    function renderList() {
      const listEl = document.getElementById('report-list');
      if (reportsData.length === 0) {
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">No reports found in ./test-reports/</div>';
        return;
      }
      listEl.innerHTML = reportsData.map((r, idx) => {
        const isPassed = r.content.includes('status: "PASSED"') || r.content.includes('[PASS]');
        const badgeClass = isPassed ? 'badge-passed' : 'badge-failed';
        const badgeText = isPassed ? 'PASSED' : 'FAILED';
        return \`
          <div class="report-item" onclick="viewReport(\${idx})">
            <span class="badge \${badgeClass}">\${badgeText}</span>
            <div class="report-title">\${r.filename}</div>
            <div class="report-meta">\${new Date(r.modifiedAt).toLocaleString()}</div>
          </div>
        \`;
      }).join('');
      if (reportsData.length > 0) {
        viewReport(0);
      }
    }

    function viewReport(idx) {
      const items = document.querySelectorAll('.report-item');
      items.forEach((it, i) => it.classList.toggle('active', i === idx));
      const report = reportsData[idx];
      if (report) {
        document.getElementById('report-viewer').innerText = report.content;
      }
    }

    loadReports();
  </script>
</body>
</html>`;
  }
}
