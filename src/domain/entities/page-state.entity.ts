import { ElementRef } from '../value-objects/element-ref.vo.js';
import { Issue } from './issue.entity.js';

export interface PageStateProps {
  url: string;
  title: string;
  elements: Map<number, ElementRef>;
  ariaTreeSummary: string;
  issues: Issue[];
  timestamp: string;
  viewport: { width: number; height: number };
}

export class PageState {
  readonly url: string;
  readonly title: string;
  readonly elements: Map<number, ElementRef>;
  readonly ariaTreeSummary: string;
  readonly issues: Issue[];
  readonly timestamp: string;
  readonly viewport: { width: number; height: number };

  constructor(props: PageStateProps) {
    this.url = props.url;
    this.title = props.title;
    this.elements = props.elements;
    this.ariaTreeSummary = props.ariaTreeSummary;
    this.issues = props.issues;
    this.timestamp = props.timestamp;
    this.viewport = props.viewport;
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
      '',
      '--- 🎯 Interactive Elements ---',
    ];

    if (this.elements.size === 0) {
      lines.push('No interactive elements detected on page.');
    } else {
      for (const el of this.elements.values()) {
        lines.push(el.toPromptString());
      }
    }

    if (this.issues.length > 0) {
      lines.push('');
      lines.push('--- 🚨 Detected Issues / Errors ---');
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
      elementsCount: this.elements.size,
      elements: Array.from(this.elements.values()).map((e) => e.toJSON()),
      issues: this.issues.map((i) => i.toJSON()),
    };
  }
}
