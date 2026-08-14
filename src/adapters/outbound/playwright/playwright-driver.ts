import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import { IBrowserDriver, LaunchOptions, InteractiveScanResult } from '../../../domain/interfaces/browser-driver.interface.js';
import { ElementRef } from '../../../domain/value-objects/element-ref.vo.js';
import { ElementNotFoundError, NavigationTimeoutError, ActionExecutionError } from '../../../shared/errors/domain-errors.js';
import { ProcessGuard } from '../../../shared/guards/process-guard.js';

export class PlaywrightDriver implements IBrowserDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private unregisterGuard: (() => void) | null = null;

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

    this.context = await this.browser.newContext({
      viewport: options?.viewport ?? { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });

    this.page = await this.context.newPage();
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
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
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

    return {
      url,
      title,
      ariaTreeSummary: ariaSummary,
      elements: new Map(this.elementRefCache),
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

  async captureScreenshot(filepath: string, fullPage = false): Promise<string> {
    this.ensureReady();
    try {
      await this.page!.screenshot({ path: filepath, fullPage });
      return filepath;
    } catch (err: unknown) {
      throw new ActionExecutionError('screenshot', err instanceof Error ? err.message : String(err), { filepath });
    }
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
