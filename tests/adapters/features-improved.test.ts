import { describe, it, expect, vi } from 'vitest';
import { ElementRef } from '../../src/domain/value-objects/element-ref.vo.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { ActionExecutor } from '../../src/application/action-executor.js';
import { ScenarioRunner } from '../../src/application/scenario-runner/scenario-runner.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { IBrowserDriver } from '../../src/domain/interfaces/browser-driver.interface.js';

describe('Feature Improvements & New Capabilities', () => {
  describe('ElementRef V2 Enhanced Badges & Tooltip', () => {
    it('formats [data-testid], [name], [in-viewport], [options] correctly in toPromptString()', () => {
      const el = new ElementRef({
        ref: 10,
        role: 'combobox',
        name: 'Country Selector',
        tag: 'select',
        inViewport: true,
        testId: 'country-select',
        nameAttr: 'country',
        options: ['US', 'ID', 'SG', 'JP'],
        tooltip: 'Select your country of origin',
      });

      const str = el.toPromptString();
      expect(str).toContain('[10]');
      expect(str).toContain('combobox');
      expect(str).toContain('"Country Selector"');
      expect(str).toContain('[in-viewport]');
      expect(str).toContain('options=["US", "ID", "SG", "JP"]');
      expect(str).toContain('tooltip="Select your country of origin"');
    });

    it('formats [below-fold] when inViewport is false', () => {
      const el = new ElementRef({
        ref: 11,
        role: 'button',
        name: 'Submit Order',
        tag: 'button',
        inViewport: false,
      });

      const str = el.toPromptString();
      expect(str).toContain('[below-fold]');
    });
  });

  describe('Telemetry Security & Latency Observer V2', () => {
    it('identifies CORS and CSP errors as SECURITY_WARNING', () => {
      const observer = new PlaywrightTelemetryObserver();
      const fakeMsg = {
        type: () => 'error',
        text: () => 'Access to fetch at "https://api.thirdparty.com" has been blocked by CORS policy',
        location: () => ({ url: 'https://example.com/app.js', lineNumber: 42, columnNumber: 10 }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (observer as any).onConsole(fakeMsg);
      const issues = observer.getIssues();
      expect(issues.length).toBe(1);
      expect(issues[0]?.type).toBe('SECURITY_WARNING');
      expect(issues[0]?.message).toContain('blocked by CORS');
    });
  });

  describe('ActionExecutor Self-Healing Selectors Hierarchy', () => {
    it('builds fallback selectors in priority order: data-testid > id > name > text', () => {
      const driverMock: Partial<IBrowserDriver> = {
        isAlive: () => true,
        click: vi.fn(),
        fill: vi.fn(),
      };
      const executor = new ActionExecutor(driverMock as IBrowserDriver);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectors = (executor as any).buildFallbackSelectors({
        testId: 'submit-btn',
        id: 'main-submit',
        nameAttr: 'submit_action',
        name: 'Checkout Now',
        role: 'button',
      });

      expect(selectors).toContain('[data-testid="submit-btn"]');
      expect(selectors).toContain('#main-submit');
      expect(selectors).toContain('[name="submit_action"]');
      expect(selectors).toContain('button:has-text("Checkout Now")');
      expect(selectors).toContain('text="Checkout Now"');
    });
  });

  describe('ScenarioRunner V2 Environment & Hook Support', () => {
    it('interpolates ${{ env.VAR_NAME }} from process.env', () => {
      process.env.TEST_API_HOST = 'https://api.mytestapp.io';
      const runner = new ScenarioRunner({} as SessionManager);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = (runner as any).interpolate('Navigating to ${{ env.TEST_API_HOST }}/v1/status');
      expect(out).toBe('Navigating to https://api.mytestapp.io/v1/status');
      delete process.env.TEST_API_HOST;
    });

    it('interpolates data row variables and faker strings together', () => {
      const runner = new ScenarioRunner({} as SessionManager);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = (runner as any).interpolate('User: {{username}} with email {{faker.email}}', { username: 'john_doe' });
      expect(out).toContain('User: john_doe with email test+');
    });
  });
});