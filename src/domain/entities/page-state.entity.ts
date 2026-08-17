import { ElementRef } from '../value-objects/element-ref.vo.js';
import { Issue } from './issue.entity.js';
import { PagePerformanceMetrics, ScrollInfo } from '../interfaces/browser-driver.interface.js';

export interface PageStateProps {
  url: string;
  title: string;
  elements: Map<number, ElementRef>;
  ariaTreeSummary: string;
  issues: Issue[];
  timestamp: string;
  viewport: { width: number; height: number };
  performance?: PagePerformanceMetrics;
  scrollInfo?: ScrollInfo;
}

export class PageState {
  readonly url: string;
  readonly title: string;
  readonly elements: Map<number, ElementRef>;
  readonly ariaTreeSummary: string;
  readonly issues: Issue[];
  readonly timestamp: string;
  readonly viewport: { width: number; height: number };
  readonly performance?: PagePerformanceMetrics;
  readonly scrollInfo?: ScrollInfo;

  constructor(props: PageStateProps) {
    this.url = props.url;
    this.title = props.title;
    this.elements = props.elements;
    this.ariaTreeSummary = props.ariaTreeSummary;
    this.issues = props.issues;
    this.timestamp = props.timestamp;
    this.viewport = props.viewport;
    this.performance = props.performance;
    this.scrollInfo = props.scrollInfo;
  }

  getElement(ref: number): ElementRef | undefined {
    return this.elements.get(ref);
  }

  /**
   * Generates a concise representation of the page state for LLM tool output.
   */
  toLLMContext(): string {
    const lines: string[] = [
      `🌐 Current Page: "${this.title}"`,
      `🔗 URL: ${this.url}`,
      `📐 Viewport: ${this.viewport.width}x${this.viewport.height}`,
    ];

    if (this.performance && (this.performance.loadDurationMs || this.performance.domContentLoadedMs)) {
      const load = this.performance.loadDurationMs ? `${this.performance.loadDurationMs}ms` : 'N/A';
      const dcl = this.performance.domContentLoadedMs ? `${this.performance.domContentLoadedMs}ms` : 'N/A';
      const fcp = this.performance.firstContentfulPaintMs ? `${this.performance.firstContentfulPaintMs}ms` : 'N/A';
      lines.push(`⏱️ Render / Load Performance: Total Load: ${load} | DOM Ready: ${dcl} | FCP: ${fcp}`);
    }

    if (this.scrollInfo && this.scrollInfo.scrollHeight > this.scrollInfo.clientHeight) {
      const { scrollY, scrollHeight, canScrollDown, scrollPercentage } = this.scrollInfo;
      if (canScrollDown) {
        lines.push(`📜 Page Scroll Position: ${scrollY}px (${scrollPercentage}%) of Total ${scrollHeight}px Height — ⬇️ [CAN SCROLL DOWN]: Page has content below the fold. Execute scroll action to test lower elements & buttons.`);
      } else {
        lines.push(`📜 Page Scroll Position: ${scrollY}px (${scrollPercentage}%) of Total ${scrollHeight}px Height — [BOTTOM REACHED]`);
      }
    }

    lines.push('');
    lines.push(`--- 🎯 Interactive Elements (${this.elements.size} found) ---`);

    if (this.elements.size === 0) {
      lines.push('No interactive elements detected on page.');
    } else {
      for (const el of this.elements.values()) {
        lines.push(el.toPromptString());
      }
    }

    if (this.issues.length > 0) {
      lines.push('');
      lines.push(`--- 🚨 Detected Issues / Errors (${this.issues.length} detected) ---`);
      for (const issue of this.issues) {
        lines.push(`• [${issue.type}] ${issue.message}`);
      }
    }

    return lines.join('\n');
  }

  toJSON() {
    return {
      url: this.url,
      title: this.title,
      viewport: this.viewport,
      timestamp: this.timestamp,
      performance: this.performance,
      elementsCount: this.elements.size,
      elements: Array.from(this.elements.values()).map((e) => e.toJSON()),
      issues: this.issues.map((i) => i.toJSON()),
    };
  }
}
