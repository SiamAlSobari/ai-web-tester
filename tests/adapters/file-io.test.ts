import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PlaywrightDriver } from '../../src/adapters/outbound/playwright/playwright-driver.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/markdown-reporter.js';

describe('File Upload & Download Support', () => {
  let server: http.Server;
  let serverUrl: string;
  let driver: PlaywrightDriver;
  let sessionManager: SessionManager;

  afterEach(async () => {
    if (sessionManager) {
      await sessionManager.closeSession().catch(() => {});
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('handles file upload and file download flows seamlessly in headless mode', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>File Test Page</h1>
              <input type="file" id="file-input" name="avatar" />
              <button id="download-btn" onclick="triggerDownload()">Download Report</button>
              <div id="upload-status"></div>
              <script>
                document.getElementById('file-input').addEventListener('change', (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    document.getElementById('upload-status').innerText = 'Uploaded: ' + file.name;
                  }
                });
                function triggerDownload() {
                  const blob = new Blob(['sample-test-report-content'], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'generated-sample.txt';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              </script>
            </body>
          </html>
        `);
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
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    sessionManager = new SessionManager(driver, telemetry, reporter);

    // 1. Start session
    const { state } = await sessionManager.startSession({
      url: serverUrl,
      headless: true,
    });

    // 2. Create temporary file to upload
    const tempUploadPath = path.resolve(process.cwd(), 'artifacts', 'temp-test-upload.txt');
    await fs.mkdir(path.dirname(tempUploadPath), { recursive: true });
    await fs.writeFile(tempUploadPath, 'test avatar content', 'utf-8');

    // Find file input ref and download button ref
    let fileInputRef: number | undefined;
    let downloadBtnRef: number | undefined;

    for (const [ref, el] of state.elements.entries()) {
      if (el.tag === 'input' && el.type === 'file') {
        fileInputRef = ref;
      }
      if (el.tag === 'button' || el.name.includes('Download Report')) {
        downloadBtnRef = ref;
      }
    }

    expect(fileInputRef).toBeDefined();
    expect(downloadBtnRef).toBeDefined();

    // 3. Test Upload Action
    const uploadResult = await sessionManager.executeAction({
      type: 'upload',
      ref: fileInputRef,
      filePaths: [tempUploadPath],
    });
    expect(uploadResult.action.status).toBe('PASSED');

    // 4. Test Download Action
    const targetDownload = path.resolve(process.cwd(), 'artifacts', 'downloads', 'downloaded-output.txt');
    const downloadResult = await sessionManager.executeAction({
      type: 'download',
      ref: downloadBtnRef,
      value: targetDownload,
    });
    expect(downloadResult.action.status).toBe('PASSED');

    // Verify downloaded file content
    const downloadedContent = await fs.readFile(targetDownload, 'utf-8');
    expect(downloadedContent).toBe('sample-test-report-content');

    // Clean up temporary files
    await fs.unlink(tempUploadPath).catch(() => {});
    await fs.unlink(targetDownload).catch(() => {});
  });
});
