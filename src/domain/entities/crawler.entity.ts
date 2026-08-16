export interface CrawlNode {
  url: string;
  pathname: string;
  title: string;
  status: number;
  depth: number;
  parentUrl?: string;
  links: string[];
  formsCount: number;
  errorCount: number;
}

export interface BrokenLink {
  url: string;
  status: number;
  foundOn: string;
  errorMsg?: string;
}

export interface CrawlResult {
  rootUrl: string;
  durationMs: number;
  totalVisited: number;
  nodes: CrawlNode[];
  brokenLinks: BrokenLink[];
}
