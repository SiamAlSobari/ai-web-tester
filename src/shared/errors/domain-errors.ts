/**
 * Custom domain and application errors for AI Browser Testing tool.
 */

export abstract class BaseDomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class SessionNotInitializedError extends BaseDomainError {
  readonly code = 'SESSION_NOT_INITIALIZED';
  readonly statusCode = 400;

  constructor(message = 'No active browser session found. Call browser_open first.', details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ElementNotFoundError extends BaseDomainError {
  readonly code = 'ELEMENT_NOT_FOUND';
  readonly statusCode = 404;

  constructor(refId: number | string, selectorDescription?: string, details?: Record<string, unknown>) {
    const msg = selectorDescription
      ? `Element with ref [${refId}] (${selectorDescription}) could not be located on the page.`
      : `Element with ref [${refId}] not found in active page state.`;
    super(msg, { refId, selectorDescription, ...details });
  }
}

export class NavigationTimeoutError extends BaseDomainError {
  readonly code = 'NAVIGATION_TIMEOUT';
  readonly statusCode = 408;

  constructor(url: string, timeoutMs: number, details?: Record<string, unknown>) {
    super(`Navigation to ${url} timed out after ${timeoutMs}ms.`, { url, timeoutMs, ...details });
  }
}

export class ActionExecutionError extends BaseDomainError {
  readonly code = 'ACTION_EXECUTION_FAILED';
  readonly statusCode = 500;

  constructor(actionType: string, reason: string, details?: Record<string, unknown>) {
    super(`Failed to execute action "${actionType}": ${reason}`, { actionType, reason, ...details });
  }
}

export class SecurityViolationError extends BaseDomainError {
  readonly code = 'SECURITY_VIOLATION';
  readonly statusCode = 403;

  constructor(message: string, details?: Record<string, unknown>) {
    super(`Security policy blocked operation: ${message}`, details);
  }
}

export class ReportGenerationError extends BaseDomainError {
  readonly code = 'REPORT_GENERATION_FAILED';
  readonly statusCode = 500;

  constructor(message: string, details?: Record<string, unknown>) {
    super(`Failed to build test report: ${message}`, details);
  }
}
