/**
 * Represents an issue, error, or anomaly detected during web testing.
 */
export type IssueType = 'CONSOLE_ERROR' | 'PAGE_CRASH' | 'NETWORK_FAILURE' | 'ASSERTION_FAILURE' | 'WARNING' | 'SECURITY_WARNING' | 'SLOW_NETWORK_WARNING';

export interface IssueProps {
  id: string;
  type: IssueType;
  message: string;
  url: string;
  timestamp: string;
  stack?: string;
  details?: Record<string, unknown>;
}

export class Issue {
  readonly id: string;
  readonly type: IssueType;
  readonly message: string;
  readonly url: string;
  readonly timestamp: string;
  readonly stack?: string;
  readonly details?: Record<string, unknown>;

  constructor(props: IssueProps) {
    this.id = props.id;
    this.type = props.type;
    this.message = props.message;
    this.url = props.url;
    this.timestamp = props.timestamp;
    this.stack = props.stack;
    this.details = props.details;
  }

  static create(type: IssueType, message: string, url: string, extra?: { stack?: string; details?: Record<string, unknown> }): Issue {
    return new Issue({
      id: `iss-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      message,
      url,
      timestamp: new Date().toISOString(),
      stack: extra?.stack,
      details: extra?.details,
    });
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      message: this.message,
      url: this.url,
      timestamp: this.timestamp,
      stack: this.stack,
      details: this.details,
    };
  }
}
