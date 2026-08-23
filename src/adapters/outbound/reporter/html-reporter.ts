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
    const statusColor = r.status === 'PASSED' ? '#22c55e' : r.status === 'FAILED' ? '#ef4444' : '#f59e0b';
    const actionsRows = r.actions
      .map((a) => {
        const color = a.status === 'PASSED' ? '#22c55e' : a.status === 'FAILED' ? '#ef4444' : '#94a3b8';
        return `<tr style="border-bottom:1px solid #334155">
          <td style="padding:8px">${a.stepNumber}</td>
          <td style="padding:8px">${this.esc(a.type.toUpperCase())}</td>
          <td style="padding:8px">${this.esc(a.targetDescription ?? (a.targetRef !== undefined ? `[ref=${a.targetRef}]` : 'Page'))}</td>
          <td style="padding:8px;color:${color};font-weight:bold">${a.status}</td>
        </tr>`;
      })
      .join('');

    const issuesBlocks = r.issues
      .map((i) => `<div style="margin:8px 0;padding:10px;background:#1e293b;border-left:4px solid #ef4444;border-radius:4px">
        <strong>[${this.esc(i.type)}]</strong> ${this.esc(i.message)}
      </div>`)
      .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${this.esc(r.title)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;padding:24px}
h1{color:#38bdf8}.badge{padding:4px 10px;border-radius:6px;font-weight:bold}.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:12px 0}
table{width:100%;border-collapse:collapse}.metric{display:inline-block;margin:8px 16px}</style></head>
<body>
<h1>📋 ${this.esc(r.title)}</h1>
<div class="card">
  <span class="badge" style="background:${statusColor};color:#000">${r.status}</span>
  <div class="metric">🌐 ${this.esc(r.targetUrl)}</div>
  <div class="metric">⏱️ ${(r.durationMs / 1000).toFixed(2)}s</div>
  <div class="metric">✅ ${r.passedSteps} / ❌ ${r.failedSteps}</div>
  <div class="metric">🚨 ${r.issues.length}</div>
</div>
<div class="card"><h3>🎯 Execution Steps</h3>
<table><tr style="border-bottom:2px solid #334155"><th style="padding:8px;text-align:left">#</th><th style="padding:8px;text-align:left">Action</th><th style="padding:8px;text-align:left">Target</th><th style="padding:8px;text-align:left">Status</th></tr>
${actionsRows || '<tr><td colspan="4" style="padding:8px">No steps</td></tr>'}
</table></div>
<div class="card"><h3>🚨 Issues</h3>${issuesBlocks || '<p>✅ No issues detected.</p>'}</div>
</body></html>`;
  }
}
