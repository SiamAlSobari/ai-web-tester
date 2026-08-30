/**
 * Represents an action executed on the browser during a test run.
 */
export type ActionType = 'navigate' | 'click' | 'fill' | 'fill_form' | 'hover' | 'press' | 'select' | 'scroll' | 'upload' | 'download' | 'switch_tab' | 'screenshot';
export type ActionStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface ActionProps {
  id: string;
  stepNumber: number;
  type: ActionType;
  targetRef?: number;
  targetDescription?: string;
  value?: string;
  filePaths?: string[];
  status: ActionStatus;

  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  error?: string;
  screenshotPath?: string;
}

export class Action {
  readonly id: string;
  readonly stepNumber: number;
  readonly type: ActionType;
  readonly targetRef?: number;
  readonly targetDescription?: string;
  readonly value?: string;
  readonly filePaths?: string[];
  status: ActionStatus;
  readonly startedAt: string;
  endedAt?: string;
  durationMs?: number;
  error?: string;
  screenshotPath?: string;

  constructor(props: ActionProps) {
    this.id = props.id;
    this.stepNumber = props.stepNumber;
    this.type = props.type;
    this.targetRef = props.targetRef;
    this.targetDescription = props.targetDescription;
    this.value = props.value;
    this.filePaths = props.filePaths;
    this.status = props.status;
    this.startedAt = props.startedAt;
    this.endedAt = props.endedAt;
    this.durationMs = props.durationMs;
    this.error = props.error;
    this.screenshotPath = props.screenshotPath;
  }

  static create(stepNumber: number, type: ActionType, options?: { targetRef?: number; targetDescription?: string; value?: string; filePaths?: string[] }): Action {
    return new Action({
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      stepNumber,
      type,
      targetRef: options?.targetRef,
      targetDescription: options?.targetDescription,
      value: options?.value,
      filePaths: options?.filePaths,
      status: 'PENDING',
      startedAt: new Date().toISOString(),
    });
  }


  complete(screenshotPath?: string): void {
    this.status = 'PASSED';
    this.endedAt = new Date().toISOString();
    this.durationMs = new Date(this.endedAt).getTime() - new Date(this.startedAt).getTime();
    this.screenshotPath = screenshotPath;
  }

  fail(errorMessage: string, screenshotPath?: string): void {
    this.status = 'FAILED';
    this.endedAt = new Date().toISOString();
    this.durationMs = new Date(this.endedAt).getTime() - new Date(this.startedAt).getTime();
    this.error = errorMessage;
    this.screenshotPath = screenshotPath;
  }

  toSummaryString(): string {
    const icon = this.status === 'PASSED' ? '✅' : this.status === 'FAILED' ? '❌' : '⏳';
    let target = '';
    if (this.targetRef !== undefined) {
      target = ` on [ref=${this.targetRef}]`;
    }
    if (this.targetDescription) {
      target += ` (${this.targetDescription})`;
    }
    const val = this.value ? ` with value "${this.value}"` : '';
    const err = this.error ? ` — Error: ${this.error}` : '';
    return `${icon} Step ${this.stepNumber}: ${this.type.toUpperCase()}${target}${val}${err}`;
  }

  toJSON() {
    const isPassword = this.targetDescription?.toLowerCase().includes('password') || this.type === 'fill' && this.targetDescription?.includes('type=password');
    const maskedValue = isPassword && this.value ? '••••••••' : this.value;
    return {
      id: this.id,
      stepNumber: this.stepNumber,
      type: this.type,
      targetRef: this.targetRef,
      targetDescription: this.targetDescription,
      value: maskedValue,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.durationMs,
      error: this.error,
      screenshotPath: this.screenshotPath,
    };
  }
}
