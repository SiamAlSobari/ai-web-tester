import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { A11yAuditor } from '../../src/adapters/outbound/a11y/a11y-auditor.js';
import { VisualDiffEngine } from '../../src/adapters/outbound/visual-diff/visual-diff.js';

describe('Accessibility & Visual Regression Engine', () => {
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

  it('runs axe-core accessibility audit and catches missing alt text and contrast issues', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
          <head><title>A11y Test Page</title></head>
          <body>
            <!-- Violates image alt rule -->
            <img src="test.jpg" />
            <!-- Violates button name rule -->
            <button></button>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    driver = new PlaywrightDriver();
    await driver.launch({ headless: true });
    await driver.navigate(serverUrl);

    const page = driver.getPage()!;
    const auditor = new A11yAuditor();
    const result = await auditor.audit(page);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.id === 'image-alt' || v.id === 'button-name')).toBe(true);

    const markdown = auditor.toMarkdownSummary(result);
    expect(markdown).toContain('Accessibility (WCAG 2.1 AA) Audit');
  });

  it('compares baseline and current screenshot using VisualDiffEngine', async () => {
    const diffEngine = new VisualDiffEngine();
    const tempDir = path.resolve(process.cwd(), 'artifacts', 'test-diff');
    await fs.mkdir(tempDir, { recursive: true });

    const baselineFile = path.join(tempDir, 'baseline.png');
    const currentFile = path.join(tempDir, 'current.png');
    const changedFile = path.join(tempDir, 'changed.png');

    await fs.writeFile(baselineFile, Buffer.from('exact-png-data-12345'));
    await fs.writeFile(currentFile, Buffer.from('exact-png-data-12345'));
    await fs.writeFile(changedFile, Buffer.from('different-png-data-67890-modified'));

    // Matching comparison
    const matchResult = await diffEngine.compareScreenshots(currentFile, baselineFile);
    expect(matchResult.hasDiff).toBe(false);
    expect(matchResult.diffPercentage).toBe(0);

    // Differing comparison
    const diffResult = await diffEngine.compareScreenshots(changedFile, baselineFile);
    expect(diffResult.hasDiff).toBe(true);
    expect(diffResult.diffPercentage).toBeGreaterThan(0);

    // Cleanup
    await fs.unlink(baselineFile).catch(() => {});
    await fs.unlink(currentFile).catch(() => {});
    await fs.unlink(changedFile).catch(() => {});
  });
});
