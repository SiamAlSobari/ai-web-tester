import fs from 'node:fs/promises';
import path from 'node:path';
import { IReporter } from '../../../domain/interfaces/reporter.interface.js';
import { TestReport } from '../../../domain/entities/test-report.entity.js';
import { ReportGenerationError } from '../../../shared/errors/domain-errors.js';

export class JUnitReporter implements IReporter {
  async generate(report: TestReport, outputPath?: string): Promise<{ filepath: string; content: string }> {
    try {
      const content = this.renderXml(report);
      const targetDir = outputPath ? path.dirname(outputPath) : path.resolve(process.cwd(), 'test-reports');
      const filename = outputPath ? path.basename(outputPath) : `junit-${report.id}.xml`;
      const finalPath = path.join(targetDir, filename.endsWith('.xml') ? filename : `${filename}.xml`);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(finalPath, content, 'utf-8');
      return { filepath: finalPath, content };
    } catch (err: unknown) {
      throw new ReportGenerationError(err instanceof Error ? err.message : String(err), { reportId: report.id });
    }
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private renderXml(r: TestReport): string {
    const failures = r.issues.length + r.failedSteps;
    const testcases = r.actions
      .map((a) => {
        const failureBlock =
          a.status === 'FAILED'
            ? `    <failure message="${this.escapeXml(a.error ?? 'Action failed')}">${this.escapeXml(a.error ?? '')}</failure>`
            : '';
        return `  <testcase classname="${this.escapeXml(r.title)}" name="${this.escapeXml(`Step ${a.stepNumber}: ${a.type}`)}" time="${(a.durationMs ?? 0) / 1000}">
${failureBlock}
  </testcase>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${this.escapeXml(r.title)}" tests="${r.totalSteps}" failures="${failures}" errors="0" time="${(r.durationMs / 1000).toFixed(2)}">
${testcases}
</testsuite>`;
  }
}
