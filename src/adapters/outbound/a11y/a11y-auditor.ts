import { AxeBuilder } from '@axe-core/playwright';
import { type Page } from 'playwright';
import { A11yAuditResult, A11yViolation } from '../../../domain/entities/a11y.entity.js';

export class A11yAuditor {
  async audit(page: Page): Promise<A11yAuditResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Builder = (AxeBuilder as any).default || AxeBuilder;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axeInstance = new (Builder as any)({ page });

    const axeResults = await axeInstance
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const violations: A11yViolation[] = (axeResults.violations || []).map((v: any) => ({
      id: v.id,
      impact: v.impact as A11yViolation['impact'],
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: (v.nodes || []).map((n: any) => ({
        html: (n.html || '').substring(0, 100),
        target: (n.target || []).map(String),
        failureSummary: n.failureSummary || '',
      })),
    }));

    return {
      url: page.url(),
      timestamp: new Date().toISOString(),
      violations,
      passesCount: (axeResults.passes || []).length,
      incompleteCount: (axeResults.incomplete || []).length,
    };
  }

  toMarkdownSummary(result: A11yAuditResult): string {
    const lines = [
      `## ♿ Accessibility (WCAG 2.1 AA) Audit`,
      `* **URL**: \`${result.url}\``,
      `* **Violations Detected**: ${result.violations.length}`,
      `* **Passed Rules**: ${result.passesCount}`,
      ``,
    ];

    if (result.violations.length === 0) {
      lines.push(`✅ *Zero accessibility violations detected! Application meets WCAG 2.1 AA compliance standards.*`);
      return lines.join('\n');
    }

    lines.push(`### ⚠️ Detected Accessibility Issues:`);
    for (const v of result.violations) {
      const impactBadge = v.impact ? `[${v.impact.toUpperCase()}]` : '[WARNING]';
      lines.push(`* **${impactBadge} ${v.help}** (\`${v.id}\`)`);
      lines.push(`  - *Description*: ${v.description}`);
      lines.push(`  - *Remediation Docs*: [WCAG Help Link](${v.helpUrl})`);
      if (v.nodes.length > 0 && v.nodes[0]) {
        lines.push(`  - *Affecting Element*: \`${v.nodes[0].html}\``);
      }
    }

    return lines.join('\n');
  }
}
