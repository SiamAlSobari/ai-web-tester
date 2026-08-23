import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, devices, type Browser, type BrowserContext, type Page, type Locator, type CDPSession } from 'playwright';
import {
  IBrowserDriver,
  LaunchOptions,
  InteractiveScanResult,
  PagePerformanceMetrics,
  MockRouteOptions,
  CrawlPageData,
} from '../../../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../../../domain/interfaces/telemetry-observer.interface.js';
import { A11yAuditResult } from '../../../domain/entities/a11y.entity.js';
import { ElementRef } from '../../../domain/value-objects/element-ref.vo.js';
import { ElementNotFoundError, NavigationTimeoutError, ActionExecutionError } from '../../../shared/errors/domain-errors.js';
import { ProcessGuard } from '../../../shared/guards/process-guard.js';
import { A11yAuditor } from '../a11y/a11y-auditor.js';
import { VisualDiffEngine } from '../visual-diff/visual-diff.js';
import type { SecurityConfig } from '../../../shared/config/security.js';

export class PlaywrightDriver implements IBrowserDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null;
  private unregisterGuard: (() => void) | null = null;
  private tracingActive = false;
  private currentViewport: { width: number; height: number } | null = null;
  private readonly a11yAuditor = new A11yAuditor();
  private readonly visualDiff = new VisualDiffEngine();


  // In-memory mapping of active refId to Playwright Locator
  private readonly locatorCache: Map<number, Locator> = new Map();
  private readonly elementRefCache: Map<number, ElementRef> = new Map();

  async launch(options?: LaunchOptions): Promise<void> {
    if (this.browser && this.page) return;

    const isHeadless = options?.headless ?? true;
    this.browser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 50,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    let contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: options?.viewport ?? { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    };

    if (options?.device && devices[options.device]) {
      contextOptions = {
        ...contextOptions,
        ...devices[options.device],
      };
    }

    if (options?.storageState) {
      contextOptions.storageState = options.storageState;
    }

    this.context = await this.browser.newContext(contextOptions);

    const deviceEntry = options?.device ? devices[options.device] : undefined;
    const deviceViewport = deviceEntry?.viewport ? (deviceEntry.viewport as { width: number; height: number }) : undefined;
    this.currentViewport = contextOptions.viewport
      ? { width: (contextOptions.viewport as { width: number }).width, height: (contextOptions.viewport as { height: number }).height }
      : (deviceViewport as { width: number; height: number } | undefined) ?? { width: 1280, height: 720 };

    if (options?.recordTrace) {
      await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      this.tracingActive = true;
    }

    // Network Throttling simulation via CDP
    if (options?.networkProfile && options.networkProfile !== 'None') {
      const page = await this.context.newPage();
      this.page = page;
      await this.applyNetworkProfile(options.networkProfile);
    } else {
      this.page = await this.context.newPage();
    }

    // Auto-track popups / multi-tabs
    this.context.on('page', (newPage) => {
      newPage.on('close', () => {
        if (this.page === newPage) {
          const pages = this.context?.pages() || [];
          this.page = pages[0] || null;
          this.locatorCache.clear();
          this.elementRefCache.clear();
        }
      });
    });


    if (options?.timeoutMs) {
      this.page.setDefaultTimeout(options.timeoutMs);
    }

    // Register cleanup hook
    this.unregisterGuard = ProcessGuard.register(async () => {
      await this.close();
    });
  }


  getPage(): Page | null {
    return this.page;
  }

  async navigate(url: string, timeoutMs = 30000): Promise<void> {
    this.ensureReady();
    try {
      await this.page!.goto(url, {
        waitUntil: 'load',
        timeout: timeoutMs,
      }).catch(async () => {
        await this.page!.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      });

      // Allow network requests and SPA component hydration to settle
      await this.page!.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

      // Short stabilization delay for DOM rendering
      await this.page!.waitForTimeout(200);

      this.locatorCache.clear();
      this.elementRefCache.clear();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('Timeout')) {
        throw new NavigationTimeoutError(url, timeoutMs);
      }
      throw new ActionExecutionError('navigate', errorMsg, { url });
    }
  }

  async getPerformanceMetrics(): Promise<PagePerformanceMetrics> {
    this.ensureReady();
    try {
      return await this.page!.evaluate(() => {
        const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[];
        const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

        let ttfbMs = 0;
        let domContentLoadedMs = 0;
        let loadDurationMs = 0;
        let dnsMs = 0;
        let connectMs = 0;

        if (navEntries.length > 0 && navEntries[0]) {
          const nav = navEntries[0];
          dnsMs = Math.max(0, Math.round(nav.domainLookupEnd - nav.domainLookupStart));
          connectMs = Math.max(0, Math.round(nav.connectEnd - nav.connectStart));
          ttfbMs = Math.max(0, Math.round(nav.responseStart - nav.requestStart));
          domContentLoadedMs = Math.max(0, Math.round(nav.domContentLoadedEventEnd - nav.startTime));
          loadDurationMs = Math.max(0, Math.round(nav.loadEventEnd - nav.startTime));
        } else if (performance.timing) {
          const t = performance.timing;
          const start = t.navigationStart;
          dnsMs = Math.max(0, t.domainLookupEnd - t.domainLookupStart);
          connectMs = Math.max(0, t.connectEnd - t.connectStart);
          ttfbMs = Math.max(0, t.responseStart - t.requestStart);
          domContentLoadedMs = Math.max(0, t.domContentLoadedEventEnd - start);
          loadDurationMs = Math.max(0, t.loadEventEnd - start);
        }

        let fcpMs: number | undefined;
        const fcp = paintEntries.find((p) => p.name === 'first-contentful-paint');
        if (fcp) {
          fcpMs = Math.round(fcp.startTime);
        }

        const resourceCount = resourceEntries.length;
        let totalSize = 0;
        for (const r of resourceEntries) {
          totalSize += r.transferSize || 0;
        }

        return {
          dnsMs,
          connectMs,
          ttfbMs,
          domContentLoadedMs,
          loadDurationMs: loadDurationMs > 0 ? loadDurationMs : domContentLoadedMs,
          firstContentfulPaintMs: fcpMs,
          resourceCount,
          totalResourceSizeKb: Math.round(totalSize / 1024),
        };
      });
    } catch {
      return {};
    }
  }


  async scanInteractiveElements(): Promise<InteractiveScanResult> {
    this.ensureReady();
    this.locatorCache.clear();
    this.elementRefCache.clear();

    const page = this.page!;
    const url = page.url();
    const title = await page.title();

    // Query interactive elements on page
    const selectorQuery = 'button, input, textarea, select, a[href], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"]';
    const locators = page.locator(selectorQuery);
    const count = await locators.count();

    let refId = 1;
    for (let i = 0; i < count; i++) {
      const loc = locators.nth(i);
      try {
        const isVisible = await loc.isVisible({ timeout: 500 }).catch(() => false);
        if (!isVisible) continue;

        const info = await loc.evaluate((el) => {
          const htmlEl = el as HTMLElement;
          const inputEl = el as HTMLInputElement;

          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const name =
            el.getAttribute('aria-label') ||
            htmlEl.innerText?.trim() ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            el.getAttribute('title') ||
            '';

          return {
            tag: el.tagName.toLowerCase(),
            role,
            name: name.substring(0, 80),
            type: inputEl.type || undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            value: inputEl.value !== undefined && inputEl.type !== 'password' ? inputEl.value.substring(0, 50) : undefined,
            disabled: htmlEl.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
            required: htmlEl.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
            checked: inputEl.checked !== undefined ? inputEl.checked : undefined,
          };
        }).catch(() => null);

        if (!info) continue;

        const elementRef = new ElementRef({
          ref: refId,
          role: info.role,
          name: info.name,
          tag: info.tag,
          type: info.type,
          placeholder: info.placeholder,
          value: info.value,
          disabled: info.disabled,
          required: info.required,
          checked: info.checked,
        });

        this.locatorCache.set(refId, loc);
        this.elementRefCache.set(refId, elementRef);
        refId++;
      } catch {
        // Skip stale elements during scan
      }
    }

    const ariaSummary = Array.from(this.elementRefCache.values())
      .map((el) => el.toPromptString())
      .join('\n');

    const scrollInfo = await page
      .evaluate(() => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        const canScrollDown = scrollY < maxScroll - 10;
        const scrollPercentage = maxScroll > 0 ? Math.round((scrollY / maxScroll) * 100) : 100;

        return {
          scrollY: Math.round(scrollY),
          scrollHeight: Math.round(scrollHeight),
          clientHeight: Math.round(clientHeight),
          canScrollDown,
          scrollPercentage,
        };
      })
      .catch(() => undefined);

    return {
      url,
      title,
      ariaTreeSummary: ariaSummary,
      elements: new Map(this.elementRefCache),
      scrollInfo,
    };
  }

  async click(ref: number, timeoutMs = 10000): Promise<void> {
    const loc = this.getLocator(ref);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: timeoutMs }).catch(() => {});
      await loc.click({ timeout: timeoutMs });
    } catch (err: unknown) {
      throw new ActionExecutionError('click', err instanceof Error ? err.message : String(err), { ref });
    }
  }

  async fill(ref: number, text: string, timeoutMs = 10000): Promise<void> {
    const loc = this.getLocator(ref);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: timeoutMs }).catch(() => {});
      await loc.fill(text, { timeout: timeoutMs });
    } catch (err: unknown) {
      throw new ActionExecutionError('fill', err instanceof Error ? err.message : String(err), { ref, text });
    }
  }

  async hover(ref: number, timeoutMs = 10000): Promise<void> {
    const loc = this.getLocator(ref);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: timeoutMs }).catch(() => {});
      await loc.hover({ timeout: timeoutMs });
    } catch (err: unknown) {
      throw new ActionExecutionError('hover', err instanceof Error ? err.message : String(err), { ref });
    }
  }

  async press(key: string): Promise<void> {
    this.ensureReady();
    try {
      await this.page!.keyboard.press(key);
    } catch (err: unknown) {
      throw new ActionExecutionError('press', err instanceof Error ? err.message : String(err), { key });
    }
  }

  async selectOption(ref: number, value: string, timeoutMs = 10000): Promise<void> {
    const loc = this.getLocator(ref);
    try {
      await loc.selectOption(value, { timeout: timeoutMs });
    } catch (err: unknown) {
      throw new ActionExecutionError('selectOption', err instanceof Error ? err.message : String(err), { ref, value });
    }
  }

  async scroll(directionOrPixels?: string | number, ref?: number): Promise<void> {
    this.ensureReady();
    try {
      if (ref !== undefined) {
        const loc = this.getLocator(ref);
        await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
        return;
      }

      if (typeof directionOrPixels === 'number') {
        await this.page!.evaluate((y) => window.scrollBy(0, y), directionOrPixels);
        return;
      }

      const dir = (directionOrPixels || 'down').toLowerCase();
      switch (dir) {
        case 'up':
          await this.page!.evaluate(() => window.scrollBy(0, -600));
          break;
        case 'top':
          await this.page!.evaluate(() => window.scrollTo(0, 0));
          break;
        case 'bottom':
          await this.page!.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          break;
        case 'down':
        default:
          await this.page!.evaluate(() => window.scrollBy(0, 600));
          break;
      }
    } catch (err: unknown) {
      throw new ActionExecutionError('scroll', err instanceof Error ? err.message : String(err), { directionOrPixels, ref });
    }
  }

  async uploadFile(ref: number, filePaths: string[], timeoutMs = 10000): Promise<void> {
    const loc = this.getLocator(ref);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: timeoutMs }).catch(() => {});
      await loc.setInputFiles(filePaths, { timeout: timeoutMs });
    } catch (err: unknown) {
      throw new ActionExecutionError('upload', err instanceof Error ? err.message : String(err), { ref, filePaths });
    }
  }

  async waitForDownload(triggerFn: () => Promise<void>, savePath?: string): Promise<string> {
    this.ensureReady();
    try {
      const downloadPromise = this.page!.waitForEvent('download', { timeout: 30000 });
      await triggerFn();
      const download = await downloadPromise;
      const targetDir = savePath ? path.dirname(savePath) : path.resolve(process.cwd(), 'artifacts', 'downloads');
      await fs.mkdir(targetDir, { recursive: true });
      const targetFile = savePath || path.join(targetDir, download.suggestedFilename());
      await download.saveAs(targetFile);
      return targetFile;
    } catch (err: unknown) {
      throw new ActionExecutionError('download', err instanceof Error ? err.message : String(err), { savePath });
    }
  }

  async saveStorageState(filepath: string): Promise<string> {
    this.ensureReady();
    try {
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await this.context!.storageState({ path: filepath });
      return filepath;
    } catch (err: unknown) {
      throw new ActionExecutionError('saveStorageState', err instanceof Error ? err.message : String(err), { filepath });
    }
  }

  async loadStorageState(filepath: string): Promise<void> {
    this.ensureReady();
    try {
      const raw = await fs.readFile(filepath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.cookies && Array.isArray(data.cookies)) {
        await this.context!.addCookies(data.cookies);
      }
    } catch (err: unknown) {
      throw new ActionExecutionError('loadStorageState', err instanceof Error ? err.message : String(err), { filepath });
    }
  }

  getPages(): Array<{ index: number; url: string; title: string; isActive: boolean }> {
    if (!this.context) return [];
    const pages = this.context.pages();
    return pages.map((p, idx) => ({
      index: idx,
      url: p.url(),
      title: '',
      isActive: p === this.page,
    }));
  }

  async switchPage(index: number): Promise<void> {
    if (!this.context) {
      throw new ActionExecutionError('switchPage', 'No active browser context.');
    }
    const pages = this.context.pages();
    if (index < 0 || index >= pages.length) {
      throw new ActionExecutionError('switchPage', `Tab index ${index} out of range (total tabs: ${pages.length})`);
    }
    const targetPage = pages[index];
    if (!targetPage) {
      throw new ActionExecutionError('switchPage', `Page at index ${index} not found.`);
    }
    this.page = targetPage;
    this.locatorCache.clear();
    this.elementRefCache.clear();
    await this.page.bringToFront().catch(() => {});
  }



  async stopTracing(tracePath: string): Promise<void> {
    if (this.context && this.tracingActive) {
      await fs.mkdir(path.dirname(tracePath), { recursive: true });
      await this.context.tracing.stop({ path: tracePath });
      this.tracingActive = false;
    }
  }

  // --- Hexagonal decoupling: advanced features via interface methods ---

  attachTelemetry(observer: ITelemetryObserver): void {
    if (this.page) {
      observer.attach(this.page);
    }
  }

  getRawPage(): unknown {
    return this.page;
  }

  getViewport(): { width: number; height: number } | null {
    if (this.page) {
      const vp = this.page.viewportSize();
      if (vp) return vp;
    }
    return this.currentViewport;
  }

  async routeMock(options: MockRouteOptions): Promise<void> {
    this.ensureReady();
    const status = options.status ?? 200;
    const contentType = options.contentType ?? (typeof options.body === 'object' ? 'application/json' : 'text/plain');
    const body = typeof options.body === 'object' ? JSON.stringify(options.body) : (options.body ?? '');
    const methodFilter = options.method?.toUpperCase();

    await this.page!.route(options.urlPattern, async (route) => {
      const req = route.request();
      if (methodFilter && req.method().toUpperCase() !== methodFilter) {
        await route.fallback();
        return;
      }
      await route.fulfill({ status, contentType, body });
    });
  }

  async routeUnmock(urlPattern?: string): Promise<void> {
    this.ensureReady();
    if (urlPattern) {
      await this.page!.unroute(urlPattern);
    } else {
      await this.page!.unrouteAll();
    }
  }

  async auditA11y(): Promise<A11yAuditResult> {
    this.ensureReady();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.a11yAuditor.audit(this.page!);
  }

  async getCrawlData(): Promise<CrawlPageData> {
    this.ensureReady();
    return this.page!.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const hrefs = anchors.map((a) => a.href).filter((h) => h.startsWith('http'));
      const forms = document.querySelectorAll('form').length;
      return { title: document.title, hrefs, forms };
    });
  }

  async compareScreenshot(currentPath: string, baselinePath: string, threshold?: number): Promise<{ hasDiff: boolean; diffPercentage: number; message: string }> {
    const result = await this.visualDiff.compareScreenshots(currentPath, baselinePath, threshold);
    return { hasDiff: result.hasDiff, diffPercentage: result.diffPercentage, message: result.message };
  }

  isTracingActive(): boolean {
    return this.tracingActive;
  }

  async saveTrace(tracePath: string): Promise<void> {
    await this.stopTracing(tracePath);
  }

  private async applyNetworkProfile(profile: 'Fast 3G' | 'Slow 3G' | 'Offline'): Promise<void> {
    if (!this.page) return;
    try {
      if (this.cdpSession) {
        await this.cdpSession.detach().catch(() => {});
        this.cdpSession = null;
      }
      this.cdpSession = await this.page.context().newCDPSession(this.page);
      if (profile === 'Offline') {
        await this.cdpSession.send('Network.emulateNetworkConditions', {
          offline: true,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        });
      } else if (profile === 'Slow 3G') {
        await this.cdpSession.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 400,
          downloadThroughput: (500 * 1024) / 8,
          uploadThroughput: (500 * 1024) / 8,
        });
      } else if (profile === 'Fast 3G') {
        await this.cdpSession.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 150,
          downloadThroughput: (1.6 * 1024 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
      }
    } catch {
      // Ignore if CDP not supported
    }
  }

  async captureScreenshot(filepath: string, fullPage = false): Promise<string> {

    this.ensureReady();
    try {
      await this.page!.screenshot({ path: filepath, fullPage });
      return filepath;
    } catch (err: unknown) {
      throw new ActionExecutionError('screenshot', err instanceof Error ? err.message : String(err), { filepath });
    }
  }

  setSecurityConfig(_config?: SecurityConfig): void {
    // PlaywrightDriver may optionally enforce host whitelist via launch navigation guard.
    // Currently enforced at SessionManager level; kept for interface symmetry.
  }

  getUrl(): string {
    return this.page?.url() ?? '';
  }

  async getTitle(): Promise<string> {
    return this.page?.title() ?? '';
  }

  async close(): Promise<void> {
    this.locatorCache.clear();
    this.elementRefCache.clear();

    if (this.unregisterGuard) {
      this.unregisterGuard();
      this.unregisterGuard = null;
    }

    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {});
      this.cdpSession = null;
    }

    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }


  isAlive(): boolean {
    return this.browser !== null && this.page !== null && !this.page.isClosed();
  }

  private getLocator(ref: number): Locator {
    this.ensureReady();
    const loc = this.locatorCache.get(ref);
    if (!loc) {
      const elRef = this.elementRefCache.get(ref);
      throw new ElementNotFoundError(ref, elRef ? elRef.toPromptString() : undefined);
    }
    return loc;
  }

  private ensureReady(): void {
    if (!this.page || this.page.isClosed()) {
      throw new ActionExecutionError('session', 'Browser page is not opened or active.');
    }
  }
}
