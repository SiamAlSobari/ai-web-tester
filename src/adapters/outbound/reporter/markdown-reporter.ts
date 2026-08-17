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
    const statusBadge = r.status === 'PASSED' ? '🟢 PASSED' : r.status === 'FAILED' ? '🔴 FAILED' : '🟡 WARNING';
    const durationSec = (r.durationMs / 1000).toFixed(2);

    const perf = r.performance;
    const loadTimeStr = perf?.loadDurationMs !== undefined ? `${perf.loadDurationMs} ms` : 'N/A';
    const dclTimeStr = perf?.domContentLoadedMs !== undefined ? `${perf.domContentLoadedMs} ms` : 'N/A';
    const ttfbTimeStr = perf?.ttfbMs !== undefined ? `${perf.ttfbMs} ms` : 'N/A';
    const fcpTimeStr = perf?.firstContentfulPaintMs !== undefined ? `${perf.firstContentfulPaintMs} ms` : 'N/A';
    const resourcesStr = perf?.resourceCount !== undefined ? `${perf.resourceCount} resources (${perf.totalResourceSizeKb || 0} KB)` : 'N/A';

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
      `page_render_ms: ${perf?.loadDurationMs ?? 0}`,
      `timestamp: "${r.startedAt}"`,
      '---',
    ].join('\n');

    // 1. Executive Summary Table
    const summaryTable = [
      '| Metric | Value | Keterangan |',
      '| :--- | :--- | :--- |',
      `| 🌐 **Target URL** | \`${r.targetUrl}\` | Alamat aplikasi yang diuji |`,
      `| 🚦 **Status Pengujian** | **${statusBadge}** | Status hasil eksekusi akhir |`,
      `| ⏱️ **Total Durasi** | \`${durationSec}s\` (${r.durationMs} ms) | Waktu total eksekusi skrip pengujian |`,
      `| 🚀 **Waktu Render Halaman** | \`${loadTimeStr}\` | DOMContentLoaded: \`${dclTimeStr}\` \\| FCP: \`${fcpTimeStr}\` |`,
      `| 🚶 **Langkah Pengujian** | \`${r.totalSteps} langkah\` | ✅ ${r.passedSteps} Berhasil \\| ❌ ${r.failedSteps} Gagal |`,
      `| 🚨 **Total Isu Terdeteksi** | \`${r.issues.length} isu\` | Console errors, fetch errors, crashes |`,
    ].join('\n');

    // 2. Performance Breakdown Section
    let perfSection = '';
    if (perf && (perf.loadDurationMs || perf.domContentLoadedMs || perf.ttfbMs)) {
      const loadRating = (perf.loadDurationMs || 0) < 1000 ? '🟢 Cepat (< 1.0s)' : (perf.loadDurationMs || 0) < 3000 ? '🟡 Sedang (< 3.0s)' : '🔴 Lambat (> 3.0s)';
      const ttfbRating = (perf.ttfbMs || 0) < 200 ? '🟢 Sangat Responsif (< 200ms)' : '🟡 Normal';

      perfSection = `## ⚡ Metrik Performa & Waktu Render Halaman

| Parameter Performa | Waktu Terukur | Evaluasi & Standar Web Vitals |
| :--- | :--- | :--- |
| **Full Page Load (Render Lengkap)** | \`${loadTimeStr}\` | ${loadRating} |
| **DOM Content Loaded** | \`${dclTimeStr}\` | Waktu parsing struktur HTML selesai |
| **First Contentful Paint (FCP)** | \`${fcpTimeStr}\` | Waktu elemen visual pertama muncul |
| **Time to First Byte (TTFB)** | \`${ttfbTimeStr}\` | ${ttfbRating} |
| **Total Aset & Sumber Daya** | \`${resourcesStr}\` | Jumlah HTTP asset yang di-load |

---
`;
    }

    // 3. Interactive Element Matrix Table
    let actionsTable = '';
    if (r.actions.length > 0) {
      const rows = r.actions.map((a) => {
        const icon = a.status === 'PASSED' ? '✅ Passed' : a.status === 'FAILED' ? '❌ Failed' : '⏳ Running';
        const target = a.targetRef !== undefined ? `\`[ref=${a.targetRef}]\` ${a.targetDescription || ''}` : '_Halaman / Browser_';
        const actionType = `\`${a.type.toUpperCase()}\``;
        const val = a.value ? `\`"${a.value}"\`` : '-';
        const errNote = a.error ? `<br><span style="color:red">🔴 <i>${a.error}</i></span>` : '';
        const shotLink = a.screenshotPath ? `<br>📸 [Lihat Screenshot Error](file:///${path.resolve(a.screenshotPath).replace(/\\/g, '/')})` : '';

        return `| **#${a.stepNumber}** | ${actionType} | ${target} | ${val} | ${icon} ${errNote} ${shotLink} |`;
      });

      actionsTable = [
        '| No | Aksi | Elemen Target (Ref & Deskripsi) | Nilai / Input | Hasil Eksekusi |',
        '| :---: | :--- | :--- | :--- | :--- |',
        ...rows,
      ].join('\n');
    } else {
      actionsTable = '_Tidak ada langkah interaksi yang dijalankan._';
    }

    // 4. Detailed Issues Section (Console Errors, Fetch Failures, Crashes)
    let issuesSection = '';
    if (r.issues.length > 0) {
      const consoleErrors = r.issues.filter((i) => i.type === 'CONSOLE_ERROR' || i.type === 'WARNING');
      const networkErrors = r.issues.filter((i) => i.type === 'NETWORK_FAILURE');
      const crashErrors = r.issues.filter((i) => i.type === 'PAGE_CRASH' || i.type === 'ASSERTION_FAILURE');

      const blocks: string[] = [];

      if (networkErrors.length > 0) {
        blocks.push('### 📡 Network / Fetch Failures & HTTP Errors (API & Endpoint)');
        networkErrors.forEach((issue, idx) => {
          const details = (issue.details || {}) as Record<string, unknown>;
          let card = `#### ${idx + 1}. \`${issue.message}\`\n`;
          card += `- **Target URL:** \`${issue.url}\`\n`;
          card += `- **Waktu Deteksi:** \`${issue.timestamp}\`\n`;
          if (details.method && details.url) {
            card += `- **Permintaan:** \`${details.method} ${details.url}\`\n`;
          }
          if (details.status) {
            card += `- **HTTP Status:** \`${details.status} ${details.statusText || ''}\`\n`;
          }
          if (details.responseBody) {
            card += `- **Response Body / Error Detail:**\n\`\`\`json\n${details.responseBody}\n\`\`\`\n`;
          }
          if (details.failureText) {
            card += `- **Keterangan Gagal:** \`${details.failureText}\`\n`;
          }
          blocks.push(card);
        });
      }

      if (consoleErrors.length > 0) {
        blocks.push('### 💻 Browser Console Errors & Exceptions');
        consoleErrors.forEach((issue, idx) => {
          let card = `#### ${idx + 1}. \`[${issue.type}] ${issue.message}\`\n`;
          card += `- **Lokasi URL:** \`${issue.url}\`\n`;
          if (issue.stack) {
            card += `- **Source / Stack Trace:**\n\`\`\`text\n${issue.stack}\n\`\`\`\n`;
          }
          blocks.push(card);
        });
      }

      if (crashErrors.length > 0) {
        blocks.push('### 💥 Fatal Page Crashes & Assertion Failures');
        crashErrors.forEach((issue, idx) => {
          let card = `#### ${idx + 1}. \`[${issue.type}] ${issue.message}\`\n`;
          card += `- **URL:** \`${issue.url}\`\n`;
          if (issue.stack) {
            card += `\`\`\`text\n${issue.stack}\n\`\`\`\n`;
          }
          blocks.push(card);
        });
      }

      issuesSection = blocks.join('\n\n');
    } else {
      issuesSection = '> ✅ **Status Bersih (Zero Defects)**: Tidak ditemukan console error, kegagalan fetch/network HTTP (4xx/5xx), maupun unhandled exception pada browser.';
    }

    // 5. Visual Evidence & Screenshots (Only on errors)
    let screenshotsSection = '';
    if (r.screenshots.length > 0) {
      const rows = r.screenshots.map((s, idx) => {
        const cleanPath = path.resolve(s).replace(/\\/g, '/');
        const filename = path.basename(s);
        return `| **#${idx + 1}** | 🔴 Bukti Anomali / Error | \`${filename}\` | [📸 Buka File Gambar](file:///${cleanPath}) |`;
      });

      screenshotsSection = [
        '| No | Konteks Tangkapan Layar | Nama File | Tautan Langsung |',
        '| :---: | :--- | :--- | :--- |',
        ...rows,
      ].join('\n');
    } else {
      screenshotsSection = '> ℹ️ **Tidak ada screenshot error**: Seluruh skenario pengujian berjalan lancar tanpa mengalami kendala visual atau kegagalan aksi UI.';
    }

    // 6. Actionable Developer Recommendations
    const recommendationsList =
      r.recommendations.length > 0
        ? r.recommendations.map((rec) => `- 🎯 ${rec}`).join('\n')
        : '- 🎯 Semua komponen dan API bekerja optimal. Tidak ada perbaikan mendesak yang diperlukan.';

    return `${frontmatter}

# 📋 Laporan Hasil Pengujian: ${r.title}

## 📊 Ringkasan Eksekutif
${summaryTable}

---

${perfSection}## 🎯 Matriks Pengujian Tombol & Elemen Interaktif (Execution Steps)
${actionsTable}

---

## 🚨 Temuan Isu, Console Error & Fetch Network Failure
${issuesSection}

---

## 📸 Bukti Visual Kesalahan (Error Screenshots)
${screenshotsSection}

---

## 💡 Rekomendasi Tindakan untuk Developer / AI Coding Agent
${recommendationsList}
`;
  }
}
