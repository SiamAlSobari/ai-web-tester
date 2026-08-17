import { IReporter } from '../domain/interfaces/reporter.interface.js';
import { Session } from '../domain/entities/session.entity.js';
import { TestReport } from '../domain/entities/test-report.entity.js';

export interface BuildReportOptions {
  title?: string;
  outputPath?: string;
}

export interface BuildReportResult {
  report: TestReport;
  filepath: string;
  content: string;
}

export class ReportBuilder {
  constructor(private readonly reporter: IReporter) {}

  async buildFromSession(session: Session, options?: BuildReportOptions): Promise<BuildReportResult> {
    const title = options?.title || `Test Run for ${session.targetUrl}`;

    const report = TestReport.fromSession(
      title,
      session.actions,
      session.issues,
      session.screenshotPaths,
      session.targetUrl,
      session.startedAt,
      session.currentState?.performance
    );

    const { filepath, content } = await this.reporter.generate(report, options?.outputPath);

    return {
      report,
      filepath,
      content,
    };
  }
}
