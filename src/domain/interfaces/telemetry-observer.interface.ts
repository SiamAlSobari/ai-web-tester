import { Issue } from '../entities/issue.entity.js';

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: string;
  location?: string;
}

export interface NetworkLogEntry {
  method: string;
  url: string;
  status?: number;
  resourceType: string;
  timestamp: string;
  durationMs?: number;
}

export interface ITelemetryObserver {
  attach(page: unknown): void;
  getIssues(): Issue[];
  getRecentIssues(sinceTimestamp?: string): Issue[];
  getConsoleLogs?(limit?: number): ConsoleLogEntry[];
  getNetworkLogs?(limit?: number): NetworkLogEntry[];
  clear(): void;
  detach(): void;
}
