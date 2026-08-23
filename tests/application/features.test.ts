import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { AssertionEngine } from '../../src/application/assertion-engine.js';
import { VisualDiffEngine } from '../../src/adapters/outbound/visual-diff/visual-diff.js';
import { assertUrlAllowed, isUrlAllowed } from '../../src/shared/config/security.js';
import { Session } from '../../src/domain/entities/session.entity.js';
import { ElementRef } from '../../src/domain/value-objects/element-ref.vo.js';
import { PageState } from '../../src/domain/entities/page-state.entity.js';
import type { IBrowserDriver } from '../../src/domain/interfaces/browser-driver.interface.js';

function fakeDriver(partials: Partial<IBrowserDriver> = {}): IBrowserDriver {
  return {
    launch: async () => {},
    navigate: async () => {},
    click: async () => {},
    fill: async () => {},
    hover: async () => {},
    press: async () => {},
    selectOption: async () => {},
    scroll: async () => {},
    uploadFile: async () => {},
    waitForDownload: async () => '',
    saveStorageState: async () => '',
    loadStorageState: async () => {},
    getPages: () => [],
    switchPage: async () => {},
    scanInteractiveElements: async () => ({ url: '', title: '', ariaTreeSummary: '', elements: new Map(), scrollInfo: undefined }),
    getPerformanceMetrics: async () => ({}),
    captureScreenshot: async () => '',
    getUrl: () => '',
    getTitle: async () => '',
    close: async () => {},
    isAlive: () => true,
    ...partials,
  } as IBrowserDriver;
}

function buildSession(): Session {
  const el = new ElementRef({ ref: 1, role: 'button', name: 'Sign In', tag: 'button' });
  const elements = new Map<number, ElementRef>([[1, el]]);
  const pageState = new PageState({
    url: 'http://localhost:3000',
    title: 'Login',
    elements,
    ariaTreeSummary: '[1] button "Sign In"',
    issues: [],
    timestamp: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
  });
  const session = Session.create('http://localhost:3000');
  session.updateState(pageState);
  return session;
}

describe('Assertion Engine (#1, #15)', () => {
  it('count assertion works without browser', async () => {
    const engine = new AssertionEngine(fakeDriver());
    const session = buildSession();
    const res = await engine.assert(session, { kind: 'count', expected: 1, operator: 'equals' });
    expect(res.passed).toBe(true);
  });

  it('exists assertion detects element by ref', async () => {
    const engine = new AssertionEngine(fakeDriver());
    const session = buildSession();
    const res = await engine.assert(session, { kind: 'exists', ref: 1 });
    expect(res.passed).toBe(true);
    const miss = await engine.assert(session, { kind: 'exists', ref: 99 });
    expect(miss.passed).toBe(false);
  });

  it('perf assertion fails when metric missing or over budget', async () => {
    const engine = new AssertionEngine(fakeDriver());
    const session = buildSession();
    const res = await engine.assertPerformance(session, 'fcp', 1000, 'lte');
    // no performance captured => actualMs -1 => not passed
    expect(res.passed).toBe(false);
    expect(res.actualMs).toBe(-1);
  });
});

describe('Host Whitelist Security (#13)', () => {
  it('blocks disallowed hosts', () => {
    const cfg = { allowedHosts: ['localhost', '*.myapp.com'] };
    expect(isUrlAllowed('http://evil.com', cfg).allowed).toBe(false);
    expect(isUrlAllowed('http://api.myapp.com', cfg).allowed).toBe(true);
    expect(isUrlAllowed('http://localhost:3000', cfg).allowed).toBe(true);
  });

  it('assertUrlAllowed throws SecurityViolationError', () => {
    const cfg = { allowedHosts: ['localhost'] };
    expect(() => assertUrlAllowed('http://1.2.3.4', cfg)).toThrow();
  });
});

describe('Visual Diff Engine (#5)', () => {
  it('initializes baseline when missing', async () => {
    const engine = new VisualDiffEngine();
    const current = fileURLToPath(new URL('../../tsconfig.json', import.meta.url));
    const res = await engine.compareScreenshots(current, `./__nonexistent_baseline_${Date.now()}.png`);
    expect(res.hasDiff).toBe(false);
    expect(res.message).toContain('Baseline');
  });
});
