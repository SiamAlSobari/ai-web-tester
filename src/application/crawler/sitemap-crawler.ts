import { IBrowserDriver } from '../../domain/interfaces/browser-driver.interface.js';
import { ITelemetryObserver } from '../../domain/interfaces/telemetry-observer.interface.js';
import { CrawlNode, BrokenLink, CrawlResult } from '../../domain/entities/crawler.entity.js';
import { PlaywrightDriver } from '../../adapters/outbound/playwright/playwright-driver.js';

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  timeoutMs?: number;
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

    if (this.driver instanceof PlaywrightDriver && this.telemetry) {
      const page = this.driver.getPage();
      if (page) {
        this.telemetry.attach(page);
      }
    }

    while (queue.length > 0 && visited.size < maxPages) {
      const current = queue.shift()!;
      const cleanUrl = this.normalizeUrl(current.url);

      if (visited.has(cleanUrl)) continue;
      visited.add(cleanUrl);

      try {
        await this.driver.navigate(cleanUrl, timeoutMs);

        let title = '';
        let pageLinks: string[] = [];
        let formsCount = 0;
        let statusCode = 200;

        if (this.driver instanceof PlaywrightDriver) {
          const page = this.driver.getPage();
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

        const node: CrawlNode = {
          url: cleanUrl,
          pathname: new URL(cleanUrl).pathname,
          title,
          status: statusCode,
          depth: current.depth,
          parentUrl: current.parentUrl,
          links: pageLinks,
          formsCount,
          errorCount: 0,
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
        brokenLinks.push({
          url: cleanUrl,
          status: errorMsg.includes('404') ? 404 : 500,
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
}
