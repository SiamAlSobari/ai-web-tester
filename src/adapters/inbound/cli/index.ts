#!/usr/bin/env node
import { Command } from 'commander';
import { SessionManager } from '../../../application/session-manager.js';
import { PlaywrightDriver } from '../../outbound/playwright/playwright-driver.js';
import { PlaywrightTelemetryObserver } from '../../outbound/telemetry/telemetry-observer.js';
import { MarkdownReporter } from '../../outbound/reporter/markdown-reporter.js';
import { runMcpServer } from '../mcp/server.js';
import { AgentInstaller, SupportedAgent } from './installer.js';

const program = new Command();

program
  .name('ai-test')
  .description('Autonomous AI Web Testing Engine & Multi-Agent Integration CLI')
  .version('0.1.0');

program
  .command('init')
  .alias('setup')
  .description('Interactive setup wizard to connect testing tools & skills to AI Agents (Antigravity, OpenCode, Claude, Cursor, Windsurf)')
  .option('-a, --agent <agents...>', 'Specify agents directly (antigravity, opencode, claude, cursor, windsurf)')
  .option('--local', 'Install to current workspace instead of global user configs', false)
  .action(async (options: { agent?: string[]; local?: boolean }) => {
    if (options.agent && options.agent.length > 0) {
      const installer = new AgentInstaller();
      const agents = options.agent as SupportedAgent[];
      const isGlobal = !options.local;
      console.log(`⚙️  Mengonfigurasi ${agents.join(', ')} (Scope: ${isGlobal ? 'Global' : 'Local'})...`);
      const result = await installer.installForAgents(agents, isGlobal);
      for (const s of result.installed) console.log(`✅ ${s}`);
      for (const e of result.errors) console.log(`⚠️ ${e}`);
    } else {
      await AgentInstaller.promptInteractive();
    }
  });

program
  .command('uninstall')
  .alias('remove')
  .description('Uninstall and remove MCP server configurations & skills from AI Agents')
  .option('-a, --agent <agents...>', 'Specify agents directly (antigravity, opencode, claude, cursor, windsurf)')
  .option('--local', 'Remove from current workspace instead of global user configs', false)
  .action(async (options: { agent?: string[]; local?: boolean }) => {
    if (options.agent && options.agent.length > 0) {
      const installer = new AgentInstaller();
      const agents = options.agent as SupportedAgent[];
      const isGlobal = !options.local;
      console.log(`🧹 Menghapus konfigurasi untuk ${agents.join(', ')} (Scope: ${isGlobal ? 'Global' : 'Local'})...`);
      const result = await installer.uninstallForAgents(agents, isGlobal);
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
  .action(async (url: string, options: { headed: boolean }) => {
    const driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    try {
      console.log(`🌐 Opening ${url}...`);
      const { state } = await manager.startSession({
        url,
        headless: !options.headed,
      });

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
  .description('Run automated health check on URL and generate .md report')
  .option('-o, --output <path>', 'Custom output path for Markdown report')
  .option('-t, --title <title>', 'Title for the test report', 'Smoke Test')
  .action(async (url: string, options: { output?: string; title?: string }) => {
    const driver = new PlaywrightDriver();
    const telemetry = new PlaywrightTelemetryObserver();
    const reporter = new MarkdownReporter();
    const manager = new SessionManager(driver, telemetry, reporter);

    try {
      console.log(`🚀 Starting automated check on ${url}...`);
      await manager.startSession({ url, headless: true });
      await manager.takeScreenshot('initial-state.png');

      const reportResult = await manager.generateReport({
        title: options.title,
        outputPath: options.output,
      });

      console.log(`\n✅ Test Complete!`);
      console.log(`📄 Report written to: ${reportResult.filepath}`);
      console.log(`📊 Status: ${reportResult.report.status}`);
      console.log(`🚨 Issues detected: ${reportResult.report.issues.length}`);
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await manager.closeSession();
    }
  });

program
  .command('serve-mcp')
  .description('Run Model Context Protocol (MCP) server over stdio')
  .action(async () => {
    await runMcpServer();
  });

program.parse(process.argv);
