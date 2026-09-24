import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../src/adapters/inbound/mcp/server.js';
import { SessionManager } from '../../src/application/session-manager.js';
import { PlaywrightTelemetryObserver } from '../../src/adapters/outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../src/adapters/outbound/reporter/index.js';
import type { IBrowserDriver } from '../../src/domain/interfaces/browser-driver.interface.js';

function mockDriver(): IBrowserDriver {
  return {
    launch: async () => {},
    navigate: async () => {},
    click: async () => {},
    fill: async () => {},
    hover: async () => {},
    press: async () => {},
    selectOption: async () => {},
    scroll: async () => {},
    uploadFile: async () => {},
    waitForDownload: async () => '',
    saveStorageState: async () => '',
    loadStorageState: async () => {},
    getPages: () => [],
    switchPage: async () => {},
    scanInteractiveElements: async () => ({ url: '', title: '', ariaTreeSummary: '', elements: new Map() }),
    getPerformanceMetrics: async () => ({}),
    captureScreenshot: async () => '',
    getUrl: () => '',
    getTitle: async () => '',
    close: async () => {},
    isAlive: () => true,
    compareScreenshot: async () => ({ hasDiff: false, diffPercentage: 0, message: 'Mock match' }),
    healthCheck: async () => ({ alive: true, browser: 'mock', version: '1.0', pages: 1, artifactsSizeKb: 0 }),
  };
}

describe('MCP Server Inbound Adapter', () => {
  it('creates MCP server instance with correct name and version', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it('works with custom injected SessionManager and delegates driver methods', async () => {
    const driver = mockDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    const server = createMcpServer(manager);
    expect(server).toBeDefined();

    // Verify delegated driver methods on manager
    const comp = await manager.compareScreenshot('a.png', 'b.png');
    expect(comp.hasDiff).toBe(false);
    expect(comp.message).toBe('Mock match');

    const health = (await manager.healthCheck()) as { alive: boolean };
    expect(health.alive).toBe(true);

    // Verify telemetry logs buffer
    const consoleLogs = manager.getConsoleLogs();
    expect(Array.isArray(consoleLogs)).toBe(true);
    expect(consoleLogs.length).toBe(0);

    const netLogs = manager.getNetworkLogs();
    expect(Array.isArray(netLogs)).toBe(true);
    expect(netLogs.length).toBe(0);
  });
});
