import type { Page, ConsoleMessage, Response, Request } from 'playwright';
import { ITelemetryObserver } from '../../../domain/interfaces/telemetry-observer.interface.js';
import { Issue, IssueType } from '../../../domain/entities/issue.entity.js';

export class PlaywrightTelemetryObserver implements ITelemetryObserver {
  private readonly issues: Issue[] = [];
  private attachedPage: Page | null = null;

  private readonly onConsole = (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      const issueType: IssueType = type === 'error' ? 'CONSOLE_ERROR' : 'WARNING';
      this.issues.push(
        Issue.create(issueType, `[Browser Console ${type.toUpperCase()}] ${msg.text()}`, this.attachedPage?.url() ?? '', {
          stack: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}:${msg.location().columnNumber}` : undefined,
        })
      );
    }
  };

  private readonly onPageError = (err: Error) => {
    this.issues.push(
      Issue.create('PAGE_CRASH', `[Uncaught Exception] ${err.message}`, this.attachedPage?.url() ?? '', {
        stack: err.stack,
      })
    );
  };

  private readonly onResponse = (res: Response) => {
    const status = res.status();
    if (status >= 400) {
      this.issues.push(
        Issue.create('NETWORK_FAILURE', `[HTTP ${status}] ${res.request().method()} ${res.url()}`, this.attachedPage?.url() ?? '', {
          details: {
            status,
            statusText: res.statusText(),
            headers: res.headers(),
          },
        })
      );
    }
  };

  private readonly onRequestFailed = (req: Request) => {
    const failure = req.failure();
    const errorText = failure?.errorText ?? 'Request failed';
    this.issues.push(
      Issue.create('NETWORK_FAILURE', `[Network Failure] ${req.method()} ${req.url()} (${errorText})`, this.attachedPage?.url() ?? '', {
        details: { failureText: errorText },
      })
    );
  };

  private readonly onPageCrash = () => {
    this.issues.push(
      Issue.create('PAGE_CRASH', '[Fatal Browser Process Crash] The browser web page crashed or ran out of memory (OOM / Infinite Loop).', this.attachedPage?.url() ?? '')
    );
  };

  attach(page: unknown): void {
    this.detach();
    const pwPage = page as Page;
    this.attachedPage = pwPage;

    pwPage.on('console', this.onConsole);
    pwPage.on('pageerror', this.onPageError);
    pwPage.on('crash', this.onPageCrash);
    pwPage.on('response', this.onResponse);
    pwPage.on('requestfailed', this.onRequestFailed);
  }

  getIssues(): Issue[] {
    return [...this.issues];
  }

  getRecentIssues(sinceTimestamp?: string): Issue[] {
    if (!sinceTimestamp) return this.getIssues();
    const since = new Date(sinceTimestamp).getTime();
    return this.issues.filter((i) => new Date(i.timestamp).getTime() >= since);
  }

  clear(): void {
    this.issues.length = 0;
  }

  detach(): void {
    if (this.attachedPage) {
      this.attachedPage.off('console', this.onConsole);
      this.attachedPage.off('pageerror', this.onPageError);
      this.attachedPage.off('crash', this.onPageCrash);
      this.attachedPage.off('response', this.onResponse);
      this.attachedPage.off('requestfailed', this.onRequestFailed);
      this.attachedPage = null;
    }
  }
}
