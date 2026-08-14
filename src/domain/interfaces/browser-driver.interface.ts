import { ElementRef } from '../value-objects/element-ref.vo.js';

export interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
}

export interface InteractiveScanResult {
  url: string;
  title: string;
  ariaTreeSummary: string;
  elements: Map<number, ElementRef>;
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
  scanInteractiveElements(): Promise<InteractiveScanResult>;
  captureScreenshot(filepath: string, fullPage?: boolean): Promise<string>;
  getUrl(): string;
  getTitle(): Promise<string>;
  close(): Promise<void>;
  isAlive(): boolean;
}
