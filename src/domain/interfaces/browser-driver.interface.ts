import { ElementRef } from '../value-objects/element-ref.vo.js';

export interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  storageState?: string;
  device?: string;
  networkProfile?: 'None' | 'Fast 3G' | 'Slow 3G' | 'Offline';
  recordTrace?: boolean;
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
}


