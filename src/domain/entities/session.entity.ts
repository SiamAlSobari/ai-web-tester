import { Action } from './action.entity.js';
import { PageState } from './page-state.entity.js';
import { Issue } from './issue.entity.js';

export type SessionStatus = 'IDLE' | 'ACTIVE' | 'CLOSED';

export interface SessionProps {
  id: string;
  targetUrl: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  currentState?: PageState;
  actions: Action[];
  issues: Issue[];
  screenshotPaths: string[];
}

export class Session {
  readonly id: string;
  targetUrl: string;
  status: SessionStatus;
  readonly startedAt: string;
  endedAt?: string;
  currentState?: PageState;
  readonly actions: Action[];
  readonly issues: Issue[];
  readonly screenshotPaths: string[];

  constructor(props: SessionProps) {
    this.id = props.id;
    this.targetUrl = props.targetUrl;
    this.status = props.status;
    this.startedAt = props.startedAt;
    this.endedAt = props.endedAt;
    this.currentState = props.currentState;
    this.actions = props.actions;
    this.issues = props.issues;
    this.screenshotPaths = props.screenshotPaths;
  }

  static create(targetUrl: string): Session {
    return new Session({
      id: `ses-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      targetUrl,
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      actions: [],
      issues: [],
      screenshotPaths: [],
    });
  }

  recordAction(action: Action): void {
    this.actions.push(action);
  }

  recordIssue(issue: Issue): void {
    this.issues.push(issue);
  }

  recordScreenshot(path: string): void {
    this.screenshotPaths.push(path);
  }

  updateState(state: PageState): void {
    this.currentState = state;
    this.targetUrl = state.url;
  }

  close(): void {
    this.status = 'CLOSED';
    this.endedAt = new Date().toISOString();
  }

  getDurationMs(): number {
    const end = this.endedAt ? new Date(this.endedAt).getTime() : Date.now();
    return end - new Date(this.startedAt).getTime();
  }

  toJSON() {
    return {
      id: this.id,
      targetUrl: this.targetUrl,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.getDurationMs(),
      actionsCount: this.actions.length,
      issuesCount: this.issues.length,
      actions: this.actions.map((a) => a.toJSON()),
      issues: this.issues.map((i) => i.toJSON()),
      screenshotPaths: this.screenshotPaths,
    };
  }
}
