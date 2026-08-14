import { Issue } from '../entities/issue.entity.js';

export interface ITelemetryObserver {
  attach(page: unknown): void;
  getIssues(): Issue[];
  getRecentIssues(sinceTimestamp?: string): Issue[];
  clear(): void;
  detach(): void;
}
