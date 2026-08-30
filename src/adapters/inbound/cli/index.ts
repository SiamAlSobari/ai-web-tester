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
  .version('0.3.2')
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
  .option('--browser <browser>', 'Browser engine: chromium|firefox|webkit', 'chromium')
  .option('-s, --storage-state <path>', 'Load auth storageState JSON')
  .option('--replay-har <path>', 'Replay network from HAR fixture')
  .option('--trace', 'Record Playwright trace', false)
  .option('--video', 'Record video', false)
  .option('--har', 'Record HAR', false)
  .option('--junit', 'Also emit JUnit XML report', false)
  .option('--html', 'Also emit HTML report', false)
  .option('--github-summary', 'Write Markdown to GITHUB_STEP_SUMMARY if present', false)
  .option('--perf-budget <path>', 'Path to perf budget JSON { metric: threshold }')
  .option('--allowed-hosts <hosts>', 'Comma-separated allowed hosts')
  .action(async (url: string, options: { output?: string; title?: string; device?: string; browser?: string; storageState?: string; replayHar?: string; trace?: boolean; video?: boolean; har?: boolean; junit?: boolean; html?: boolean; githubSummary?: boolean; perfBudget?: string; allowedHosts?: string }) => {
    const manager = buildManager();
    manager.setSecurityConfig(parseAllowedHosts(options.allowedHosts));
    try {
      console.log(`🚀 Starting automated check on ${url}...`);
      await manager.startSession({ url, headless: true, device: options.device, browser: options.browser as never, storageState: options.storageState, replayHar: options.replayHar, recordTrace: options.trace, recordVideo: options.video ? {} : undefined, recordHar: options.har ? {} : undefined });
      await manager.takeScreenshot('initial-state.png');

      // Perf budget check
      if (options.perfBudget) {
        try {
          const raw = await (await import('node:fs/promises')).readFile(options.perfBudget, 'utf-8');
          const budget = JSON.parse(raw) as Record<string, number>;
          for (const [metric, threshold] of Object.entries(budget)) {
            const res = await manager.assertPerformance(metric as never, threshold);
            console.log(`${res.result.passed ? '✅' : '❌'} Perf ${metric}: ${res.result.message}`);
            if (!res.result.passed) process.exitCode = 1;
          }
        } catch (e) { console.warn('Perf budget check failed:', e); }
      }

      const reportResult = await manager.generateReport({ title: options.title, outputPath: options.output });
      console.log(`\n✅ Test Complete!`);
      console.log(`📄 Report: ${reportResult.filepath}`);
      console.log(`📊 Status: ${reportResult.report.status} | Issues: ${reportResult.report.issues.length}`);

      if (options.githubSummary && process.env.GITHUB_STEP_SUMMARY) {
        await (await import('node:fs/promises')).appendFile(process.env.GITHUB_STEP_SUMMARY, '\n' + reportResult.content, 'utf-8');
        console.log(`🚀 Appended summary to $GITHUB_STEP_SUMMARY`);
      }

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
  .command('doctor')
  .description('Diagnose environment, agent configs, Playwright browser binaries, and tool readiness')
  .action(async () => {
    const fsMod = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const osMod = await import('node:os');

    console.log('\n🩺 AI Web Tester System Diagnostics');
    console.log('====================================');
    const nodeMajor = parseInt(process.versions.node.split('.')[0]!, 10);
    console.log(`${nodeMajor >= 20 ? '✅' : '❌'} Node.js: v${process.version} (Required >= 20.0.0)`);

    // Test Playwright driver launch
    try {
      const driver = new PlaywrightDriver();
      await driver.launch({ headless: true });
      const health = await driver.healthCheck();
      console.log(`✅ Playwright Engine: ${health.browser} (v${health.version}) [Ready]`);
      await driver.close();
    } catch (e) {
      console.log(`❌ Playwright Engine: Failed to launch browser (${e instanceof Error ? e.message : String(e)})`);
    }

    // Check agent configs
    const home = osMod.homedir();
    const configs = [
      { name: 'Antigravity MCP', path: pathMod.join(home, '.gemini', 'config', 'mcp_config.json') },
      { name: 'Claude Desktop MCP', path: pathMod.join(process.platform === 'win32' ? (process.env.APPDATA || pathMod.join(home, 'AppData', 'Roaming')) : home, 'Claude', 'claude_desktop_config.json') },
      { name: 'OpenCode Config', path: pathMod.join(home, '.config', 'opencode', 'config.json') },
      { name: 'Cursor MCP', path: pathMod.join(home, '.cursor', 'mcp.json') },
      { name: 'Windsurf MCP', path: pathMod.join(home, '.codeium', 'windsurf', 'mcp_config.json') },
    ];

    console.log('\n🤖 Agent Integrations Check:');
    for (const c of configs) {
      const exists = await fsMod.access(c.path).then(() => true).catch(() => false);
      let hasTool = false;
      if (exists) {
        try {
          const raw = await fsMod.readFile(c.path, 'utf-8');
          hasTool = raw.includes('ai-browser-testing') || raw.includes('mcp.js');
        } catch {}
      }
      if (hasTool) {
        console.log(`  ✅ ${c.name}: Configured & Active (\`${c.path}\`)`);
      } else if (exists) {
        console.log(`  ℹ️  ${c.name}: Config file exists (run \`ai-test init\` to register MCP)`);
      } else {
        console.log(`  ⚪ ${c.name}: Not installed / not detected`);
      }
    }

    console.log('\n🎉 Diagnostics complete! System is operational.\n');
  });

program
  .command('generate <url>')
  .description('Auto-generate a replayable YAML test scenario from a live web page')
  .option('-o, --output <path>', 'Output YAML scenario path', 'scenarios/auto-generated.yaml')
  .action(async (url: string, options: { output: string }) => {
    const manager = buildManager();
    try {
      console.log(`🔍 Inspecting ${url} to generate test scenario...`);
      const { state } = await manager.startSession({ url, headless: true });
      const steps: Array<Record<string, unknown>> = [{ navigate: url }];

      for (const el of state.elements.values()) {
        if (el.tag === 'input' && el.type !== 'submit' && el.type !== 'button') {
          steps.push({ fill: { ref: el.ref, value: `{{faker.${el.type === 'email' ? 'email' : 'name'}}}` } });
        } else if (el.role === 'button' || el.tag === 'button') {
          steps.push({ assert: { ref: el.ref, kind: 'visible' } });
        }
      }

      const scenario = {
        name: `Automated Test for ${state.title || url}`,
        baseUrl: url,
        headless: true,
        steps,
      };

      const yamlMod = await import('js-yaml');
      const fsMod = await import('node:fs/promises');
      const pathMod = await import('node:path');
      const yamlStr = yamlMod.dump(scenario);
      await fsMod.mkdir(pathMod.dirname(pathMod.resolve(options.output)), { recursive: true });
      await fsMod.writeFile(pathMod.resolve(options.output), yamlStr, 'utf-8');
      console.log(`\n✨ Scenario Generated Successfully!`);
      console.log(`📄 Saved to: ${options.output}`);
      console.log(`Run with: ai-test run ${options.output}`);
    } catch (err: unknown) {
      console.error('❌ Error generating scenario:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await manager.closeSession();
    }
  });

program
  .command('repl')
  .description('Start interactive QA terminal shell (REPL) for real-time testing')
  .action(async () => {
    const readlineMod = await import('node:readline');
    const manager = buildManager();
    const rl = readlineMod.createInterface({ input: process.stdin, output: process.stdout, prompt: '🌐 ai-test-repl > ' });

    console.log('\n🚀 AI Web Tester Interactive REPL');
    console.log('Type "help" for available commands, "exit" to quit.\n');
    rl.prompt();

    rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg1 = parts[1];
      const arg2 = parts.slice(2).join(' ');

      try {
        if (cmd === 'exit' || cmd === 'quit') {
          await manager.closeAll().catch(() => {});
          rl.close();
          process.exit(0);
        } else if (cmd === 'help') {
          console.log('Commands:');
          console.log('  open <url>              - Open URL');
          console.log('  click <ref>             - Click element');
          console.log('  fill <ref> <text>       - Fill text into input');
          console.log('  fill_form [valid|fuzz]  - Smart auto-fill form');
          console.log('  inspect                 - Refresh and display elements');
          console.log('  assert visible <ref>    - Assert element visibility');
          console.log('  report                  - Generate markdown report');
          console.log('  exit                    - Quit REPL');
        } else if (cmd === 'open' && arg1) {
          console.log(`Opening ${arg1}...`);
          const { state } = await manager.startSession({ url: arg1, headless: false });
          console.log(state.toLLMContext());
        } else if (cmd === 'click' && arg1) {
          const res = await manager.executeAction({ type: 'click', ref: parseInt(arg1, 10) });
          console.log(res.llmSummary);
        } else if (cmd === 'fill' && arg1) {
          const res = await manager.executeAction({ type: 'fill', ref: parseInt(arg1, 10), value: arg2 });
          console.log(res.llmSummary);
        } else if (cmd === 'fill_form') {
          const mode = (arg1 === 'fuzz' ? 'fuzz' : 'valid') as 'valid' | 'fuzz';
          const res = await manager.fillForm({ mode });
          console.log(res.llmContext);
        } else if (cmd === 'inspect') {
          const res = await manager.inspect();
          console.log(res.llmContext);
        } else if (cmd === 'report') {
          const res = await manager.generateReport();
          console.log(`📄 Report saved: ${res.filepath}`);
        } else if (cmd) {
          console.log(`Unknown command: "${cmd}". Type "help" for command list.`);
        }
      } catch (err: unknown) {
        console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      }
      rl.prompt();
    });
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
