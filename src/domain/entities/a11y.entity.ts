export interface A11yNode {
  html: string;
  target: string[];
  failureSummary: string;
}

export interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: A11yNode[];
}

export interface A11yAuditResult {
  url: string;
  timestamp: string;
  violations: A11yViolation[];
  passesCount: number;
  incompleteCount: number;
}
