import fs from 'node:fs/promises';
import path from 'node:path';
import { IReporter } from '../../../domain/interfaces/reporter.interface.js';
import { TestReport } from '../../../domain/entities/test-report.entity.js';
import { ReportGenerationError } from '../../../shared/errors/domain-errors.js';

export class HtmlReporter implements IReporter {
  async generate(report: TestReport, outputPath?: string): Promise<{ filepath: string; content: string }> {
    try {
      const content = this.renderHtml(report);
      const targetDir = outputPath ? path.dirname(outputPath) : path.resolve(process.cwd(), 'test-reports');
      const filename = outputPath ? path.basename(outputPath) : `report-${report.id}.html`;
      const finalPath = path.join(targetDir, filename.endsWith('.html') ? filename : `${filename}.html`);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(finalPath, content, 'utf-8');
      return { filepath: finalPath, content };
    } catch (err: unknown) {
      throw new ReportGenerationError(err instanceof Error ? err.message : String(err), { reportId: report.id });
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private renderHtml(r: TestReport): string {
    const statusBg = r.status === 'PASSED' ? 'rgba(34, 197, 94, 0.15)' : r.status === 'FAILED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
    const statusColor = r.status === 'PASSED' ? '#4ade80' : r.status === 'FAILED' ? '#f87171' : '#fbbf24';
    const statusBorder = r.status === 'PASSED' ? 'rgba(34, 197, 94, 0.3)' : r.status === 'FAILED' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)';

    const actionsRows = r.actions
      .map((a) => {
        const color = a.status === 'PASSED' ? '#4ade80' : a.status === 'FAILED' ? '#f87171' : '#94a3b8';
        const err = a.error ? `<div style="color:#f87171;font-size:11px;margin-top:4px">⚠️ ${this.esc(a.error)}</div>` : '';
        const shot = a.screenshotPath ? `<div style="margin-top:4px"><a href="file:///${this.esc(a.screenshotPath.replace(/\\/g, '/'))}" target="_blank" style="color:#38bdf8;font-size:11px">📸 View Screenshot</a></div>` : '';
        return `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-family:'JetBrains Mono',monospace;font-size:12px;color:#94a3b8">#${a.stepNumber}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:#f59e0b">${this.esc(a.type.toUpperCase())}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-size:13px;color:#cbd5e1">${this.esc(a.targetDescription ?? (a.targetRef !== undefined ? `[ref=${a.targetRef}]` : 'Browser Context'))}${err}${shot}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:${color}">${a.status}</td>
        </tr>`;
      })
      .join('');

    const issuesBlocks = r.issues
      .map((i) => {
        const isSec = i.type === 'SECURITY_WARNING';
        const isSlow = i.type === 'SLOW_NETWORK_WARNING';
        const badgeColor = isSec ? '#a855f7' : isSlow ? '#fbbf24' : '#ef4444';
        return `<div style="margin:10px 0;padding:12px 16px;background:#0a0f1c;border:1px solid #334155;border-left:4px solid ${badgeColor};border-radius:6px;font-size:13px;line-height:1.5">
          <span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:${badgeColor}">[${this.esc(i.type)}]</span>
          <span style="color:#e2e8f0;margin-left:8px">${this.esc(i.message)}</span>
        </div>`;
      })
      .join('');

    const perf = r.performance;
    const perfHtml = perf && (perf.loadDurationMs || perf.domContentLoadedMs) ? `
      <div class="card">
        <div class="card-title">⚡ Web Vitals & Render Performance</div>
        <div class="metrics-row">
          <div class="metric-item"><div class="metric-label">Page Load</div><span style="color:#38bdf8">${perf.loadDurationMs ?? 0} ms</span></div>
          <div class="metric-item"><div class="metric-label">DOMContentLoaded</div><span style="color:#38bdf8">${perf.domContentLoadedMs ?? 0} ms</span></div>
          <div class="metric-item"><div class="metric-label">FCP</div><span style="color:#38bdf8">${perf.firstContentfulPaintMs ?? 0} ms</span></div>
          <div class="metric-item"><div class="metric-label">TTFB</div><span style="color:#38bdf8">${perf.ttfbMs ?? 0} ms</span></div>
          <div class="metric-item"><div class="metric-label">Resources</div><span>${perf.resourceCount ?? 0} (${perf.totalResourceSizeKb ?? 0} KB)</span></div>
        </div>
      </div>` : '';

    const recsHtml = r.recommendations.length > 0 ? `
      <div class="card">
        <div class="card-title">💡 Developer Recommendations</div>
        <ul style="list-style:none;padding:0">
          ${r.recommendations.map((rec) => `<li style="padding:6px 0;font-size:13px;color:#cbd5e1">🎯 ${this.esc(rec)}</li>`).join('')}
        </ul>
      </div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.esc(r.title)} | Test Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0f1c; color: #f8fafc; padding: 32px 24px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1e293b; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin: 16px 0; }
    .card-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 14px; font-family: 'JetBrains Mono', monospace; }
    .metrics-row { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 14px; }
    .metric-item { font-size: 13px; color: #cbd5e1; font-family: 'JetBrains Mono', monospace; }
    .metric-label { color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 10px 14px; border-bottom: 1px solid #334155; font-size: 11px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase">TEST REPORT</div>
        <h1 style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px">${this.esc(r.title)}</h1>
      </div>
      <span class="badge" style="background:${statusBg};color:${statusColor};border-color:${statusBorder}">${r.status}</span>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Run Telemetry</div>
    <div class="metrics-row">
      <div class="metric-item">
        <div class="metric-label">Target URL</div>
        <span style="color:#38bdf8">${this.esc(r.targetUrl)}</span>
      </div>
      <div class="metric-item">
        <div class="metric-label">Duration</div>
        <span>${(r.durationMs / 1000).toFixed(2)}s</span>
      </div>
      <div class="metric-item">
        <div class="metric-label">Steps Passed / Failed</div>
        <span style="color:#4ade80">${r.passedSteps}</span> / <span style="color:${r.failedSteps > 0 ? '#f87171' : '#64748b'}">${r.failedSteps}</span>
      </div>
      <div class="metric-item">
        <div class="metric-label">Issues Detected</div>
        <span style="color:${r.issues.length > 0 ? '#f87171' : '#4ade80'}">${r.issues.length}</span>
      </div>
    </div>
  </div>

  ${perfHtml}

  <div class="card">
    <div class="card-title">Execution Sequence</div>
    <table>
      <thead>
        <tr>
          <th>Step</th>
          <th>Action</th>
          <th>Target</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${actionsRows || '<tr><td colspan="4" style="padding:14px;color:#64748b;text-align:center">No execution steps recorded.</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="card-title">Issues & Exceptions</div>
    ${issuesBlocks || '<p style="font-size:13px;color:#4ade80;font-family:\'JetBrains Mono\',monospace">[PASS] Zero defects detected.</p>'}
  </div>

  ${recsHtml}
</div>
</body>
</html>`;
  }
}
