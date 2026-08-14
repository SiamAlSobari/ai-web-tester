import fs from 'node:fs/promises';
import path from 'node:path';
import { IReporter } from '../../../domain/interfaces/reporter.interface.js';
import { TestReport } from '../../../domain/entities/test-report.entity.js';
import { ReportGenerationError } from '../../../shared/errors/domain-errors.js';

export class MarkdownReporter implements IReporter {
  async generate(report: TestReport, outputPath?: string): Promise<{ filepath: string; content: string }> {
    try {
      const content = this.renderMarkdown(report);
      const targetDir = outputPath ? path.dirname(outputPath) : path.resolve(process.cwd(), 'test-reports');
      const filename = outputPath ? path.basename(outputPath) : `report-${report.id}.md`;
      const finalPath = path.join(targetDir, filename);

      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(finalPath, content, 'utf-8');

      return { filepath: finalPath, content };
    } catch (err: unknown) {
      throw new ReportGenerationError(err instanceof Error ? err.message : String(err), { reportId: report.id });
    }
  }

  private renderMarkdown(r: TestReport): string {
    const statusEmoji = r.status === 'PASSED' ? '✅ PASSED' : r.status === 'FAILED' ? '❌ FAILED' : '⚠️ WARNING';
    const durationSec = (r.durationMs / 1000).toFixed(2);

    const frontmatter = [
      '---',
      `test_run_id: "${r.id}"`,
      `title: "${r.title}"`,
      `target_url: "${r.targetUrl}"`,
      `status: "${r.status}"`,
      `duration_ms: ${r.durationMs}`,
      `total_steps: ${r.totalSteps}`,
      `passed_steps: ${r.passedSteps}`,
      `failed_steps: ${r.failedSteps}`,
      `issues_count: ${r.issues.length}`,
      `timestamp: "${r.startedAt}"`,
      '---',
    ].join('\n');

    const stepsList =
      r.actions.length > 0
        ? r.actions
            .map((a) => {
              const icon = a.status === 'PASSED' ? '✅' : a.status === 'FAILED' ? '❌' : '⏳';
              let desc = `${icon} **Step ${a.stepNumber}**: \`${a.type.toUpperCase()}\``;
              if (a.targetRef !== undefined) desc += ` on [ref=${a.targetRef}]`;
              if (a.targetDescription) desc += ` (${a.targetDescription})`;
              if (a.value) desc += ` with value \`"${a.value}"\``;
              if (a.error) desc += `\n   > 🔴 *Error:* ${a.error}`;
              if (a.screenshotPath) desc += `\n   > 📸 *Screenshot:* [View Image](file:///${path.resolve(a.screenshotPath).replace(/\\/g, '/')})`;
              return desc;
            })
            .join('\n\n')
        : '_No steps executed._';

    const issuesSection =
      r.issues.length > 0
        ? r.issues
            .map((issue, idx) => {
              let res = `### ${idx + 1}. [${issue.type}] on \`${issue.url || r.targetUrl}\`\n> ${issue.message}`;
              if (issue.stack) {
                res += `\n\`\`\`text\n${issue.stack}\n\`\`\``;
              }
              return res;
            })
            .join('\n\n')
        : '✅ _No runtime errors, console errors, or failed network responses detected._';

    const recommendationsList =
      r.recommendations.length > 0
        ? r.recommendations.map((rec) => `- ${rec}`).join('\n')
        : '- Tidak ada tindakan perbaikan khusus yang diperlukan.';

    const screenshotsSection =
      r.screenshots.length > 0
        ? r.screenshots
            .map((s, idx) => {
              const cleanPath = path.resolve(s).replace(/\\/g, '/');
              return `- Artefak ${idx + 1}: [${path.basename(s)}](file:///${cleanPath})`;
            })
            .join('\n')
        : '_Tidak ada screenshot yang tersimpan._';

    return `${frontmatter}

# 📋 Laporan Hasil Pengujian: ${r.title}

## 📊 Ringkasan Eksekusi
* **Target URL**: \`${r.targetUrl}\`
* **Status Keseluruhan**: ${statusEmoji}
* **Durasi Pengujian**: ${durationSec} detik (${r.durationMs} ms)
* **Total Langkah**: ${r.totalSteps} (✅ ${r.passedSteps} Passed | ❌ ${r.failedSteps} Failed)
* **Total Isu/Error**: ${r.issues.length}

---

## 🚶 Urutan Langkah Pengujian (Execution Steps)
${stepsList}

---

## 🚨 Temuan Masalah & Error (Issues & Anomalies)
${issuesSection}

---

## 📸 Bukti Pengujian (Screenshots & Artifacts)
${screenshotsSection}

---

## 💡 Rekomendasi untuk AI Coding Agent / Developer
${recommendationsList}
`;
  }
}
