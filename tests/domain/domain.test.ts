import { describe, it, expect } from 'vitest';
import { ElementRef } from '../../src/domain/value-objects/element-ref.vo.js';
import { Action } from '../../src/domain/entities/action.entity.js';
import { Issue } from '../../src/domain/entities/issue.entity.js';
import { Session } from '../../src/domain/entities/session.entity.js';
import { PageState } from '../../src/domain/entities/page-state.entity.js';
import { TestReport } from '../../src/domain/entities/test-report.entity.js';
import { ElementNotFoundError, SessionNotInitializedError } from '../../src/shared/errors/domain-errors.js';

describe('Domain Entities & Value Objects', () => {
  it('ElementRef formats prompt string correctly for LLM', () => {
    const el = new ElementRef({
      ref: 1,
      role: 'textbox',
      name: 'Email',
      type: 'email',
      required: true,
      placeholder: 'name@example.com',
    });

    const str = el.toPromptString();
    expect(str).toContain('[1] textbox "Email"');
    expect(str).toContain('type=email');
    expect(str).toContain('required');
    expect(str).toContain('placeholder="name@example.com"');
  });

  it('Action entity tracks lifecycle and duration', () => {
    const act = Action.create(1, 'click', { targetRef: 3, targetDescription: 'button "Submit"' });
    expect(act.status).toBe('PENDING');
    expect(act.stepNumber).toBe(1);

    act.complete('./artifacts/step-1.png');
    expect(act.status).toBe('PASSED');
    expect(act.durationMs).toBeGreaterThanOrEqual(0);
    expect(act.screenshotPath).toBe('./artifacts/step-1.png');
    expect(act.toSummaryString()).toContain('✅ Step 1: CLICK on [ref=3] (button "Submit")');
  });

  it('Issue entity records console and network errors', () => {
    const issue = Issue.create('CONSOLE_ERROR', 'TypeError: undefined is not a function', 'http://localhost:3000');
    expect(issue.type).toBe('CONSOLE_ERROR');
    expect(issue.message).toContain('TypeError');
    expect(issue.url).toBe('http://localhost:3000');
  });

  it('Session entity tracks state and actions', () => {
    const session = Session.create('http://localhost:3000');
    expect(session.status).toBe('ACTIVE');

    const act = Action.create(1, 'navigate', { value: 'http://localhost:3000' });
    act.complete();
    session.recordAction(act);

    expect(session.actions.length).toBe(1);
    expect(session.getDurationMs()).toBeGreaterThanOrEqual(0);

    session.close();
    expect(session.status).toBe('CLOSED');
  });

  it('TestReport compiles stats and generates recommendations', () => {
    const act1 = Action.create(1, 'navigate', { value: 'http://localhost:3000' });
    act1.complete();
    const act2 = Action.create(2, 'click', { targetRef: 1 });
    act2.fail('Element not found');

    const issue = Issue.create('CONSOLE_ERROR', 'Uncaught SyntaxError', 'http://localhost:3000');

    const report = TestReport.fromSession(
      'Login Flow Test',
      [act1, act2],
      [issue],
      ['./artifacts/shot.png'],
      'http://localhost:3000',
      new Date().toISOString()
    );

    expect(report.status).toBe('FAILED');
    expect(report.totalSteps).toBe(2);
    expect(report.passedSteps).toBe(1);
    expect(report.failedSteps).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('Domain errors provide proper JSON structure', () => {
    const err = new ElementNotFoundError(5, 'button "Login"');
    expect(err.code).toBe('ELEMENT_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('[5]');

    const sessionErr = new SessionNotInitializedError();
    expect(sessionErr.code).toBe('SESSION_NOT_INITIALIZED');
    expect(sessionErr.statusCode).toBe(400);
  });
});
