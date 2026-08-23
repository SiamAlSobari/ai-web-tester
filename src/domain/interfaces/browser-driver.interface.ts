import { ElementRef } from '../value-objects/element-ref.vo.js';
import { ITelemetryObserver } from './telemetry-observer.interface.js';
import { A11yAuditResult } from '../entities/a11y.entity.js';

export interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  storageState?: string;
  device?: string;
  networkProfile?: 'None' | 'Fast 3G' | 'Slow 3G' | 'Offline';
  recordTrace?: boolean;
}

export interface CrawlPageData {
  title: string;
  hrefs: string[];
  forms: number;
}

export interface MockRouteOptions {
  urlPattern: string;
  status?: number;
  body?: string | Record<string, unknown>;
  contentType?: string;
  method?: string;
}

export interface ScrollInfo {
  scrollY: number;
  scrollHeight: number;
  clientHeight: number;
  canScrollDown: boolean;
  scrollPercentage: number;
}

export interface InteractiveScanResult {
  url: string;
  title: string;
  ariaTreeSummary: string;
  elements: Map<number, ElementRef>;
  scrollInfo?: ScrollInfo;
}

export interface PagePerformanceMetrics {
  dnsMs?: number;
  connectMs?: number;
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadDurationMs?: number;
  firstContentfulPaintMs?: number;
  resourceCount?: number;
  totalResourceSizeKb?: number;
}

export interface IBrowserDriver {
  launch(options?: LaunchOptions): Promise<void>;
  navigate(url: string, timeoutMs?: number): Promise<void>;
  click(ref: number, timeoutMs?: number): Promise<void>;
  fill(ref: number, text: string, timeoutMs?: number): Promise<void>;
  hover(ref: number, timeoutMs?: number): Promise<void>;
  press(key: string): Promise<void>;
  selectOption(ref: number, value: string, timeoutMs?: number): Promise<void>;
  scroll(directionOrPixels?: string | number, ref?: number): Promise<void>;
  uploadFile(ref: number, filePaths: string[], timeoutMs?: number): Promise<void>;
  waitForDownload(triggerFn: () => Promise<void>, savePath?: string): Promise<string>;
  saveStorageState(filepath: string): Promise<string>;
  loadStorageState(filepath: string): Promise<void>;
  getPages(): Array<{ index: number; url: string; title: string; isActive: boolean }>;
  switchPage(index: number): Promise<void>;
  scanInteractiveElements(): Promise<InteractiveScanResult>;
  getPerformanceMetrics(): Promise<PagePerformanceMetrics>;
  captureScreenshot(filepath: string, fullPage?: boolean): Promise<string>;
  getUrl(): string;
  getTitle(): Promise<string>;
  close(): Promise<void>;
  isAlive(): boolean;

  // Hexagonal decoupling — telemetry & advanced features via interface, no instanceof needed
  attachTelemetry?(observer: ITelemetryObserver): Promise<void> | void;
  getRawPage?(): unknown;
  getViewport?(): { width: number; height: number } | null;
  routeMock?(options: MockRouteOptions): Promise<void>;
  routeUnmock?(urlPattern?: string): Promise<void>;
  auditA11y?(): Promise<A11yAuditResult>;
  getCrawlData?(): Promise<CrawlPageData>;
  compareScreenshot?(currentPath: string, baselinePath: string, threshold?: number): Promise<{ hasDiff: boolean; diffPercentage: number; message: string }>;
  isTracingActive?(): boolean;
  saveTrace?(tracePath: string): Promise<void>;
}


