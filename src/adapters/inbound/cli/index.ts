#!/usr/bin/env node
import { Command } from 'commander';
import { SessionManager } from '../../../application/session-manager.js';
import { PlaywrightDriver } from '../../outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter, JUnitReporter, HtmlReporter } from '../../outbound/reporter/index.js';
import { SitemapCrawler } from '../../../application/crawler/sitemap-crawler.js';
import { ScenarioRunner } from '../../../application/scenario-runner/scenario-runner.js';
import { DashboardServer } from '../ui/dashboard-server.js';
import { runMcpServer } from '../mcp/server.js';
import { AgentInstaller, SupportedAgent } from './installer.js';
import { setLogLevel } from '../../../shared/logger/logger.js';
import type { SecurityConfig } from '../../../shared/config/security.js';

const program = new Command();

program
  .name('ai-test')
  .description('Autonomous AI Web Testing Engine & Multi-Agent Integration CLI')
  .version('0.3.0')
  .option('-v, --verbose', 'Enable debug logging', false)
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) setLogLevel('debug');
  });

function buildManager(): SessionManager {
  const driver = new PlaywrightDriver();
  const telemetry = new PlaywrightTelemetryObserver();
  const reporter = new MarkdownReporter();
  return new SessionManager(driver, telemetry, reporter);
}

function parseAllowedHosts(csv?: string): SecurityConfig | undefined {
  if (!csv) return undefined;
  return { allowedHosts: csv.split(',').map((s) => s.trim()).filter(Boolean) };
}

program
  .command('init')
  .alias('setup')
  .description('Interactive setup wizard to connect testing tools & skills to AI Agents')
  .option('-a, --agent <agents...>', 'Specify agents directly')
  .option('--local', 'Install to current workspace instead of global user configs', false)
  .action(async (options: { agent?: string[]; local?: boolean }) => {
    if (options.agent && options.agent.length > 0) {
      const installer = new AgentInstaller();
      const result = await installer.installForAgents(options.agent as SupportedAgent[], !options.local);
      for (const s of result.installed) console.log(`✅ ${s}`);
      for (const e of result.errors) console.log(`⚠️ ${e}`);
    } else {
      await AgentInstaller.promptInteractive();
    }
  });

program
  .command('uninstall')
  .alias('remove')
  .description('Uninstall MCP server configurations & skills from AI Agents')
  .option('-a, --agent <agents...>', 'Specify agents directly')
  .option('--local', 'Remove from current workspace', false)
  .action(async (options: { agent?: string[]; local?: boolean }) => {
    if (options.agent && options.agent.length > 0) {
      const installer = new AgentInstaller();
      const result = await installer.uninstallForAgents(options.agent as SupportedAgent[], !options.local);
      for (const s of result.uninstalled) console.log(`✅ ${s}`);
      for (const e of result.errors) console.log(`⚠️ ${e}`);
    } else {
      await AgentInstaller.promptInteractiveUninstall();
    }
  });

program
  .command('open <url>')
  .description('Open a URL and inspect its interactive elements')
  .option('--headed', 'Run browser in visible window mode', false)
  .option('-d, --device <device>', 'Mobile device preset')
  .option('-s, --storage-state <path>', 'Load auth storageState JSON')
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts (SSRF guard)')
  .action(async (url: string, options: { headed: boolean; device?: string; storageState?: string; allowedHosts?: string }) => {
    const manager = buildManager();
    manager.setSecurityConfig(parseAllowedHosts(options.allowedHosts));
    try {
      console.log(`🌐 Opening ${url}...`);
      const { state } = await manager.startSession({ url, headless: !options.headed, device: options.device, storageState: options.storageState });
      console.log('\n' + state.toLLMContext());
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await manager.closeSession();
    }
  });

program
  .command('test <url>')
  .description('Run automated health check on URL and generate reports')
  .option('-o, --output <path>', 'Custom output path for Markdown report')
  .option('-t, --title <title>', 'Title for the test report', 'Smoke Test')
  .option('-d, --device <device>', 'Mobile device preset')
  .option('-s, --storage-state <path>', 'Load auth storageState JSON')
  .option('--trace', 'Record Playwright trace', false)
  .option('--junit', 'Also emit JUnit XML report', false)
  .option('--html', 'Also emit HTML report', false)
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts')
  .action(async (url: string, options: { output?: string; title?: string; device?: string; storageState?: string; trace?: boolean; junit?: boolean; html?: boolean; allowedHosts?: string }) => {
    const manager = buildManager();
    manager.setSecurityConfig(parseAllowedHosts(options.allowedHosts));
    try {
      console.log(`🚀 Starting automated check on ${url}...`);
      await manager.startSession({ url, headless: true, device: options.device, storageState: options.storageState, recordTrace: options.trace });
      await manager.takeScreenshot('initial-state.png');

      const reportResult = await manager.generateReport({ title: options.title, outputPath: options.output });
      console.log(`\n✅ Test Complete!`);
      console.log(`📄 Report: ${reportResult.filepath}`);
      console.log(`📊 Status: ${reportResult.report.status} | Issues: ${reportResult.report.issues.length}`);

      if (options.junit) {
        const junit = new JUnitReporter();
        const { filepath } = await junit.generate(reportResult.report, options.output?.replace(/\.md$/, '.xml'));
        console.log(`🧪 JUnit: ${filepath}`);
      }
      if (options.html) {
        const html = new HtmlReporter();
        const { filepath } = await html.generate(reportResult.report, options.output?.replace(/\.md$/, '.html'));
        console.log(`🌐 HTML: ${filepath}`);
      }
      if (options.trace) {
        const trace = await manager.saveTrace();
        console.log(`🎥 Trace: ${trace.filepath}`);
      }
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await manager.closeSession();
    }
  });

program
  .command('run <scenarioPath>')
  .description('Run a YAML scenario file (data-driven via `data:` rows). Feature #4 + #14')
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts')
  .action(async (scenarioPath: string, options: { allowedHosts?: string }) => {
    const manager = buildManager();
    manager.setSecurityConfig(parseAllowedHosts(options.allowedHosts));
    const runner = new ScenarioRunner(manager);
    try {
      console.log(`🎬 Running scenario: ${scenarioPath}`);
      const result = await runner.runFromYaml(scenarioPath);
      console.log(`${result.passed ? '✅ PASSED' : '❌ FAILED'}: ${result.name} (steps: ${result.stepsExecuted})`);
      if (result.failures.length) {
        for (const f of result.failures) console.log(`  - ${f}`);
        process.exit(1);
      }
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('crawl <url>')
  .description('Autonomously crawl internal website links and detect broken links')
  .option('--depth <number>', 'Maximum crawl depth', '3')
  .option('--pages <number>', 'Maximum pages to explore', '20')
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts')
  .action(async (url: string, options: { depth: string; pages: string; allowedHosts?: string }) => {
    const driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    driver.setSecurityConfig?.(parseAllowedHosts(options.allowedHosts));
    const crawler = new SitemapCrawler(driver, telemetry);
    try {
      console.log(`🕷️ Crawling ${url}...`);
      const result = await crawler.crawl(url, { maxDepth: parseInt(options.depth, 10), maxPages: parseInt(options.pages, 10) });
      console.log('\n' + crawler.toMarkdownReport(result));
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await driver.close();
    }
  });

program
  .command('ui')
  .description('Start local web UI dashboard with live SSE feed')
  .option('-p, --port <port>', 'Port number', '3100')
  .action(async (options: { port: string }) => {
    const port = parseInt(options.port, 10);
    const dashboard = new DashboardServer();
    const { url } = await dashboard.start(port);
    console.log(`\n🌐 Dashboard: \x1b[36m${url}\x1b[0m`);
    console.log(`Press Ctrl+C to stop.\n`);
  });

program
  .command('serve-mcp')
  .description('Run Model Context Protocol (MCP) server over stdio')
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts')
  .action(async (options: { allowedHosts?: string }) => {
    await runMcpServer(undefined, parseAllowedHosts(options.allowedHosts));
  });

program.parse(process.argv);
