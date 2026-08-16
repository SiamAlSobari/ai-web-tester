import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

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

      // API: List test reports
      if (pathname === '/api/reports') {
        try {
          const files = await fs.readdir(reportsDir);
          const reports = [];
          for (const file of files) {
            if (file.endsWith('.md')) {
              const content = await fs.readFile(path.join(reportsDir, file), 'utf-8');
              reports.push({
                filename: file,
                content,
                modifiedAt: (await fs.stat(path.join(reportsDir, file))).mtime,
              });
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reports }));
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to read reports' }));
        }
        return;
      }

      // Serve Artifacts (images, diffs, downloads)
      if (pathname.startsWith('/artifacts/')) {
        const relPath = pathname.replace('/artifacts/', '');
        const targetPath = path.join(artifactsDir, relPath);
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
  <title>AI Web Tester — Local Quality Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    h1 { font-size: 24px; font-weight: 700; color: var(--primary); }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .metric-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-val { font-size: 28px; font-weight: bold; margin-top: 8px; }
    .main-grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; }
    .report-list { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; height: 600px; overflow-y: auto; }
    .report-item { padding: 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
    .report-item:hover, .report-item.active { background: #334155; }
    .report-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .report-meta { font-size: 12px; color: var(--text-muted); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 4px; }
    .badge-passed { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .badge-failed { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .viewer { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 24px; height: 600px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>🌐 AI Web Tester Dashboard</h1>
        <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Live Local Test Reports & Quality Telemetry</p>
      </div>
      <button onclick="loadReports()" style="background: var(--primary); color: #000; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">🔄 Refresh</button>
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
        <div class="metric-val" id="m-rate" style="color: var(--primary);">100%</div>
      </div>
    </div>

    <div class="main-grid">
      <div class="report-list" id="report-list">
        <div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading reports...</div>
      </div>
      <div class="viewer" id="report-viewer">
        Select a test report on the left to inspect its complete execution logs, assertions, and recommendations.
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
        if (r.content.includes('status: "PASSED"') || r.content.includes('✅ PASSED')) {
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
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No reports found in ./test-reports/</div>';
        return;
      }
      listEl.innerHTML = reportsData.map((r, idx) => {
        const isPassed = r.content.includes('status: "PASSED"') || r.content.includes('✅ PASSED');
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
