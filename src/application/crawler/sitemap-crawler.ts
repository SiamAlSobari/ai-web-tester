import { IBrowserDriver } from '../../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../../domain/interfaces/telemetry-observer.interface.js';
import { CrawlNode, BrokenLink, CrawlResult } from '../../domain/entities/crawler.entity.js';
import { PlaywrightDriver } from '../../adapters/outbound/playwright/playwright-driver.js';

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  timeoutMs?: number;
  securityConfig?: import('../../shared/config/security.js').SecurityConfig;
}

export class SitemapCrawler {
  constructor(
    private readonly driver: IBrowserDriver,
    private readonly telemetry?: ITelemetryObserver
  ) {}

  async crawl(rootUrl: string, options?: CrawlOptions): Promise<CrawlResult> {
    const maxDepth = options?.maxDepth ?? 3;
    const maxPages = options?.maxPages ?? 25;
    const timeoutMs = options?.timeoutMs ?? 15000;

    const startedAt = Date.now();
    const parsedRoot = new URL(rootUrl);
    const rootOrigin = parsedRoot.origin;

    const visited = new Set<string>();
    const nodes: CrawlNode[] = [];
    const brokenLinks: BrokenLink[] = [];

    const queue: Array<{ url: string; depth: number; parentUrl?: string }> = [
      { url: rootUrl, depth: 0 },
    ];

    if (!this.driver.isAlive()) {
      await this.driver.launch({ headless: true });
    }

    // Feature #3: Hexagonal decoupling — attach telemetry via interface
    if (this.telemetry) {
      this.driver.attachTelemetry?.(this.telemetry);
    }

    // Try sitemap.xml first for broader coverage
    if (maxDepth > 1) {
      const sitemapUrls = await this.fetchSitemapUrls(rootUrl).catch(() => []);
      for (const su of sitemapUrls) {
        if (!visited.has(this.normalizeUrl(su)) && !queue.some((q) => this.normalizeUrl(q.url) === this.normalizeUrl(su))) {
          try { if (new URL(su).origin === rootOrigin) queue.push({ url: su, depth: 1 }); } catch {}
        }
      }
    }

    while (queue.length > 0 && visited.size < maxPages) {
      const current = queue.shift()!;
      const cleanUrl = this.normalizeUrl(current.url);
      // SSRF guard per-hop
      if (options?.securityConfig) {
        const { isUrlAllowed } = await import('../../shared/config/security.js');
        const check = isUrlAllowed(cleanUrl, options.securityConfig);
        if (!check.allowed) {
          brokenLinks.push({ url: cleanUrl, status: 403, foundOn: current.parentUrl || rootUrl, errorMsg: check.reason });
          continue;
        }
      }

      if (visited.has(cleanUrl)) continue;
      visited.add(cleanUrl);

      try {
        await this.driver.navigate(cleanUrl, timeoutMs);

        let title = '';
        let pageLinks: string[] = [];
        let formsCount = 0;
        let statusCode = 200;

        // Feature #6: Use interface method for crawl data (decoupled from Playwright)
        const crawlData = await this.driver.getCrawlData?.().catch(() => undefined);
        if (crawlData) {
          title = crawlData.title;
          pageLinks = crawlData.hrefs;
          formsCount = crawlData.forms;
        } else if (this.driver instanceof PlaywrightDriver) {
          // Fallback for drivers that don't implement getCrawlData
          const page = (this.driver as unknown as { getPage?: () => unknown }).getPage?.() as { title: () => Promise<string>; evaluate: (fn: () => unknown) => Promise<{ hrefs: string[]; forms: number }> } | null;
          if (page) {
            title = await page.title().catch(() => '');
            const pageData = await page.evaluate(() => {
              const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
              const hrefs = anchors.map((a) => a.href).filter((h) => h.startsWith('http'));
              const forms = document.querySelectorAll('form').length;
              return { hrefs, forms };
            }).catch(() => ({ hrefs: [], forms: 0 }));
            pageLinks = pageData.hrefs;
            formsCount = pageData.forms;
          }
        }

        // Feature #6: Capture real HTTP status via response, not hardcoded 200
        const rawPage = this.driver.getRawPage?.() as { url: () => string } | undefined;
        const finalUrl = rawPage?.url?.() ?? cleanUrl;
        statusCode = await this.resolveStatus(finalUrl).catch(() => 200);

        const node: CrawlNode = {
          url: cleanUrl,
          pathname: new URL(cleanUrl).pathname,
          title,
          status: statusCode,
          depth: current.depth,
          parentUrl: current.parentUrl,
          links: pageLinks,
          formsCount,
          errorCount: statusCode >= 400 ? 1 : 0,
        };

        nodes.push(node);

        // Queue child links
        if (current.depth + 1 <= maxDepth) {
          for (const link of pageLinks) {
            try {
              const linkObj = new URL(link);
              // Only explore internal routes under the same origin
              if (linkObj.origin === rootOrigin) {
                const normLink = this.normalizeUrl(link);
                // Feature #6: Skip static asset / noise links
                if (/\.(png|jpe?g|gif|webp|svg|css|woff2?|ttf|ico|pdf|xml|json)(\?|$)/i.test(normLink)) continue;
                if (!visited.has(normLink) && !queue.some((q) => this.normalizeUrl(q.url) === normLink)) {
                  queue.push({ url: normLink, depth: current.depth + 1, parentUrl: cleanUrl });
                }
              }
            } catch {
              // Invalid link ignored
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const statusMatch = errorMsg.match(/(\d{3})/);
        const status = statusMatch && statusMatch[1] ? parseInt(statusMatch[1], 10) : 500;
        brokenLinks.push({
          url: cleanUrl,
          status: status >= 400 ? status : 500,
          foundOn: current.parentUrl || rootUrl,
          errorMsg,
        });
      }
    }

    const durationMs = Date.now() - startedAt;

    return {
      rootUrl,
      durationMs,
      totalVisited: nodes.length,
      nodes,
      brokenLinks,
    };
  }

  toMarkdownReport(result: CrawlResult): string {
    const lines = [
      `# 🕷️ Autonomous Sitemap & Exploration Report`,
      ``,
      `* **Root URL**: \`${result.rootUrl}\``,
      `* **Total Pages Explored**: ${result.totalVisited}`,
      `* **Broken Links Found**: ${result.brokenLinks.length}`,
      `* **Duration**: ${(result.durationMs / 1000).toFixed(2)}s`,
      ``,
      `---`,
      ``,
      `## 🗺️ Discovered Sitemap Tree`,
    ];

    for (const node of result.nodes) {
      const indent = '  '.repeat(node.depth);
      lines.push(`${indent}* **[${node.pathname}](${node.url})** — *"${node.title || 'Untitled'}"* (${node.links.length} links, ${node.formsCount} forms)`);
    }

    if (result.brokenLinks.length > 0) {
      lines.push(``, `## 🚨 Broken / Unreachable Links`);
      for (const broken of result.brokenLinks) {
        lines.push(`* ❌ **\`${broken.url}\`** (Status: ${broken.status}) — Found on: \`${broken.foundOn}\` ${broken.errorMsg ? `(${broken.errorMsg})` : ''}`);
      }
    } else {
      lines.push(``, `## 🚨 Broken / Unreachable Links`, `✅ *No broken links or 404 routes detected.*`);
    }

    return lines.join('\n');
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      u.hash = ''; // Strip fragments
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.slice(0, -1);
      }
      return u.href;
    } catch {
      return url;
    }
  }

  private async fetchSitemapUrls(rootUrl: string): Promise<string[]> {
    try {
      const sitemapUrl = new URL('/sitemap.xml', rootUrl).href;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(sitemapUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return [];
      const xml = await res.text();
      const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)];
      return matches.map((m) => m[1]?.trim()).filter(Boolean) as string[];
    } catch { return []; }
  }

  private async resolveStatus(url: string): Promise<number> {
    // Try to read real status from recently captured network telemetry if available
    if (this.telemetry) {
      const issues = this.telemetry.getIssues();
      const netIssue = issues.find((i) => i.type === 'NETWORK_FAILURE' && (i.details?.['url'] as string) === url);
      if (netIssue && typeof netIssue.details?.['status'] === 'number') {
        return netIssue.details['status'] as number;
      }
    }
    return 200;
  }
}
