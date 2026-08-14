import { TestReport } from '../entities/test-report.entity.js';

export interface IReporter {
  generate(report: TestReport, outputPath?: string): Promise<{ filepath: string; content: string }>;
}
