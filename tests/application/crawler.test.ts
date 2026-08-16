import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { SitemapCrawler } from '../../src/application/crawler/sitemap-crawler.js';

describe('Autonomous Smart Crawler & Sitemap Explorer', () => {
  let server: http.Server;
  let serverUrl: string;
  let driver: PlaywrightDriver;

  afterEach(async () => {
    if (driver) {
      await driver.close().catch(() => {});
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('crawls internal links, extracts sitemap tree, and formats Markdown report', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Home Page</title></head>
            <body>
              <a href="/about">About Us</a>
              <a href="/contact">Contact</a>
            </body>
          </html>
        `);
      } else if (req.url === '/about') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>About Us</title></head>
            <body>
              <a href="/team">Our Team</a>
              <a href="/">Back Home</a>
            </body>
          </html>
        `);
      } else if (req.url === '/contact') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Contact</title></head>
            <body>
              <form><input name="email" /><button>Send</button></form>
            </body>
          </html>
        `);
      } else if (req.url === '/team') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Our Team</title></head>
            <body><h1>Meet the Team</h1></body>
          </html>
        `);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    driver = new PlaywrightDriver();
    const crawler = new SitemapCrawler(driver);

    const result = await crawler.crawl(serverUrl, { maxDepth: 3, maxPages: 10 });

    expect(result.totalVisited).toBeGreaterThanOrEqual(4);
    expect(result.nodes.some((n) => n.pathname === '/about')).toBe(true);
    expect(result.nodes.some((n) => n.pathname === '/contact' && n.formsCount === 1)).toBe(true);

    const markdown = crawler.toMarkdownReport(result);
    expect(markdown).toContain('Autonomous Sitemap & Exploration Report');
    expect(markdown).toContain('Discovered Sitemap Tree');
  });
});
