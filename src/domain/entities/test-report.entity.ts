import { Action } from './action.entity.js';
import { Issue } from './issue.entity.js';

export type ReportStatus = 'PASSED' | 'FAILED' | 'WARNING';

export interface TestReportProps {
  id: string;
  title: string;
  targetUrl: string;
  status: ReportStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  actions: Action[];
  issues: Issue[];
  screenshots: string[];
  recommendations: string[];
}

export class TestReport {
  readonly id: string;
  readonly title: string;
  readonly targetUrl: string;
  readonly status: ReportStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly totalSteps: number;
  readonly passedSteps: number;
  readonly failedSteps: number;
  readonly actions: Action[];
  readonly issues: Issue[];
  readonly screenshots: string[];
  readonly recommendations: string[];

  constructor(props: TestReportProps) {
    this.id = props.id;
    this.title = props.title;
    this.targetUrl = props.targetUrl;
    this.status = props.status;
    this.startedAt = props.startedAt;
    this.endedAt = props.endedAt;
    this.durationMs = props.durationMs;
    this.totalSteps = props.totalSteps;
    this.passedSteps = props.passedSteps;
    this.failedSteps = props.failedSteps;
    this.actions = props.actions;
    this.issues = props.issues;
    this.screenshots = props.screenshots;
    this.recommendations = props.recommendations;
  }

  static fromSession(title: string, actions: Action[], issues: Issue[], screenshots: string[], targetUrl: string, startedAt: string): TestReport {
    const endedAt = new Date().toISOString();
    const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const totalSteps = actions.length;
    const passedSteps = actions.filter((a) => a.status === 'PASSED').length;
    const failedSteps = actions.filter((a) => a.status === 'FAILED').length;

    let status: ReportStatus = 'PASSED';
    if (failedSteps > 0 || issues.some((i) => i.type === 'PAGE_CRASH' || i.type === 'CONSOLE_ERROR')) {
      status = 'FAILED';
    } else if (issues.length > 0) {
      status = 'WARNING';
    }

    const recommendations: string[] = [];
    if (issues.some((i) => i.type === 'CONSOLE_ERROR')) {
      recommendations.push('Periksa console error JavaScript yang tertangkap selama interaksi halaman.');
    }
    if (issues.some((i) => i.type === 'NETWORK_FAILURE')) {
      recommendations.push('Periksa endpoint API atau network request yang mengembalikan status HTTP error (4xx/5xx).');
    }
    if (failedSteps > 0) {
      recommendations.push('Periksa elemen UI yang gagal diinteraksikan (kemungkinan selector berubah atau validasi form gagal).');
    }
    if (recommendations.length === 0) {
      recommendations.push('Semua langkah pengujian berhasil dijalankan tanpa terdeteksi anomali.');
    }

    return new TestReport({
      id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      targetUrl,
      status,
      startedAt,
      endedAt,
      durationMs,
      totalSteps,
      passedSteps,
      failedSteps,
      actions,
      issues,
      screenshots,
      recommendations,
    });
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      targetUrl: this.targetUrl,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.durationMs,
      totalSteps: this.totalSteps,
      passedSteps: this.passedSteps,
      failedSteps: this.failedSteps,
      actions: this.actions.map((a) => a.toJSON()),
      issues: this.issues.map((i) => i.toJSON()),
      screenshots: this.screenshots,
      recommendations: this.recommendations,
    };
  }
}
