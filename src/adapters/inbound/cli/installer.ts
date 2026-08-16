import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

export type SupportedAgent = 'antigravity' | 'opencode' | 'claude' | 'cursor' | 'windsurf';

export interface InstallOptions {
  agents?: SupportedAgent[];
  global?: boolean;
}

// Embedded Skill Templates generated dynamically upon installer execution
const SKILL_TEMPLATES = {
  'web-test': `---
name: web-test
description: Run automated browser test on a web application for specific features or test scenarios and generate a structured Markdown report.
---

# 🕵️ Senior QA Web Testing Skill (\`/web-test\`)

Use this skill to perform deep, multi-scenario browser testing like a Senior QA Engineer on specific web features (Authentication, Registration, Checkout, Forms, CRUD, Navigation, etc.).
Tests run fast and lightweight in the background (headless). Error screenshots and telemetry are captured automatically whenever an issue occurs.

## Test Matrices:
1. **Empty / Required Field Validation** (Negative Testing)
2. **Invalid Format & Boundary Limits** (Negative Testing)
3. **Wrong Credentials / Invalid State Handling** (Negative Testing)
4. **Security & Special Characters / SQL Injection / XSS strings** (Edge Case Testing)
5. **Happy Path** (Positive End-to-End Flow)

## Workflow:
1. Open the target URL via MCP tool \`browser_open({ url })\` (runs lightweight in headless background).
2. Inspect elements and interact via \`browser_act({ action, ref, value })\`.
3. If errors or unexpected behaviors occur, visual screenshots and runtime logs are captured automatically.
4. Compile a structured Markdown test report via \`browser_report({ title })\` in \`./test-reports/\`.
`,

  'web-test-all': `---
name: web-test-all
description: Autonomous deep crawler and full-site browser testing across all links, forms, and pages.
---

# 🌐 Autonomous Full-Site QA Crawler (\`/web-test-all\`)

Use this skill for comprehensive autonomous quality auditing across the entire website or web application in the background (headless).

## Audit Methodology:
1. **Phase 1: Site Map & Route Discovery**: Crawls all internal links and navigation routes.
2. **Phase 2: Page-by-Page Audit**: Detects console errors, 404 broken links, and validates form accessibility.
3. **Phase 3: Generate Markdown Audit Report**: Compiles full sitemap tree and broken link reports via \`browser_report({ title: "Full Site Quality Audit" })\`.
`,

  'web-test-fix': `---
name: web-test-fix
description: Autonomous Test-Fix-Retest loop: test application, identify bugs and console errors, fix source code, and re-verify until passing.
---

# 🔄 Autonomous QA Test-Fix-Retest Loop (\`/web-test-fix\`)

Use this skill for autonomous remediation: **Test in Browser $\\rightarrow$ Identify Bug & Root Cause $\\rightarrow$ Edit & Fix Source Code $\\rightarrow$ Retest until 100% Passing**.

## Workflow:
1. Open the web app via \`browser_open\` and locate errors/exceptions in telemetry.
2. Open and edit the corresponding project source code files to fix the issue.
3. Retest and re-verify the fix in the browser.
4. Generate a Before vs After verification report via \`browser_report\`.
`,
};


export class AgentInstaller {
  private readonly projectRoot: string;
  private readonly homeDir: string;
  private readonly mcpExecutablePath: string;

  constructor(projectRoot = process.cwd(), homeDir = os.homedir()) {
    this.projectRoot = path.resolve(projectRoot);
    this.homeDir = homeDir;
    this.mcpExecutablePath = path.join(this.projectRoot, 'dist', 'mcp.js').replace(/\\/g, '/');
  }

  async installForAgents(agents: SupportedAgent[], isGlobal = true): Promise<{ installed: string[]; errors: string[] }> {
    const installed: string[] = [];
    const errors: string[] = [];

    for (const agent of agents) {
      try {
        switch (agent) {
          case 'antigravity':
            await this.configureAntigravity(isGlobal);
            installed.push(`Antigravity (MCP Server & ${isGlobal ? 'Global' : 'Local'} Skills)`);
            break;
          case 'opencode':
            await this.configureOpenCode(isGlobal);
            installed.push(`OpenCode (MCP Config & ${isGlobal ? 'Global' : 'Local'} Skills)`);
            break;
          case 'claude':
            await this.configureClaude(isGlobal);
            installed.push(`Claude Code / Desktop (MCP Config & ${isGlobal ? 'Global' : 'Local'} Skills)`);
            break;
          case 'cursor':
            await this.configureCursor(isGlobal);
            installed.push(`Cursor (MCP Config & ${isGlobal ? 'Global' : 'Local'} Rules)`);
            break;
          case 'windsurf':
            await this.configureWindsurf(isGlobal);
            installed.push(`Windsurf / Roo Code (MCP Config & ${isGlobal ? 'Global' : 'Local'} Skills)`);
            break;
        }
      } catch (err: unknown) {
        errors.push(`${agent}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { installed, errors };
  }

  async uninstallForAgents(agents: SupportedAgent[], isGlobal = true): Promise<{ uninstalled: string[]; errors: string[] }> {
    const uninstalled: string[] = [];
    const errors: string[] = [];

    for (const agent of agents) {
      try {
        switch (agent) {
          case 'antigravity':
            await this.unconfigureAntigravity(isGlobal);
            uninstalled.push(`Antigravity (Removed MCP & Skills)`);
            break;
          case 'opencode':
            await this.unconfigureOpenCode(isGlobal);
            uninstalled.push(`OpenCode (Removed MCP & Skills)`);
            break;
          case 'claude':
            await this.unconfigureClaude(isGlobal);
            uninstalled.push(`Claude Code / Desktop (Removed MCP & Skills)`);
            break;
          case 'cursor':
            await this.unconfigureCursor(isGlobal);
            uninstalled.push(`Cursor (Removed MCP & Rules)`);
            break;
          case 'windsurf':
            await this.unconfigureWindsurf(isGlobal);
            uninstalled.push(`Windsurf / Roo Code (Removed MCP & Skills)`);
            break;
        }
      } catch (err: unknown) {
        errors.push(`${agent}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { uninstalled, errors };
  }

  async configureAntigravity(isGlobal: boolean): Promise<void> {
    const mcpConfig = {
      name: 'ai-browser-testing',
      command: 'node',
      args: [this.mcpExecutablePath],
    };

    // 1. Configure MCP Server
    const targetMcpFile = isGlobal
      ? path.join(this.homeDir, '.gemini', 'config', 'mcp_config.json')
      : path.join(this.projectRoot, 'mcp_config.json');

    await this.mergeJsonConfig(targetMcpFile, (current) => {
      current.mcpServers = current.mcpServers || {};
      current.mcpServers['ai-browser-testing'] = mcpConfig;
      return current;
    });

    // 2. Dynamically write skills to target directory chosen by user during install
    const skillsTargetDir = isGlobal
      ? path.join(this.homeDir, '.gemini', 'config', 'skills')
      : path.join(this.projectRoot, '.agents', 'skills');

    await this.writeSkillTemplates(skillsTargetDir);
  }

  async unconfigureAntigravity(isGlobal: boolean): Promise<void> {
    const targetMcpFile = isGlobal
      ? path.join(this.homeDir, '.gemini', 'config', 'mcp_config.json')
      : path.join(this.projectRoot, 'mcp_config.json');

    await this.mergeJsonConfig(targetMcpFile, (current) => {
      if (current.mcpServers) {
        delete current.mcpServers['ai-browser-testing'];
      }
      return current;
    });

    const skillsTargetDir = isGlobal
      ? path.join(this.homeDir, '.gemini', 'config', 'skills')
      : path.join(this.projectRoot, '.agents', 'skills');

    await this.removeSkillTemplates(skillsTargetDir);
  }

  async configureOpenCode(isGlobal: boolean): Promise<void> {
    const targetFiles: string[] = [];
    if (isGlobal) {
      targetFiles.push(path.join(this.homeDir, '.config', 'opencode', 'config.json'));
      if (process.platform === 'win32' && process.env.APPDATA) {
        targetFiles.push(path.join(process.env.APPDATA, 'opencode', 'config.json'));
      }
    } else {
      targetFiles.push(path.join(this.projectRoot, 'opencode.json'));
    }

    for (const targetFile of targetFiles) {
      await this.mergeJsonConfig(targetFile, (current) => {
        current.$schema = current.$schema || 'https://opencode.ai/config.json';
        current.mcp = current.mcp || {};
        current.mcp['ai-browser-testing'] = {
          type: 'local',
          command: ['node', this.mcpExecutablePath],
        };
        current.mcpServers = current.mcpServers || {};
        current.mcpServers['ai-browser-testing'] = {
          command: 'node',
          args: [this.mcpExecutablePath],
        };
        return current;
      });
    }

    // Write skills for OpenCode
    const skillsTargetDirs: string[] = [];
    if (isGlobal) {
      skillsTargetDirs.push(path.join(this.homeDir, '.config', 'opencode', 'skills'));
      if (process.platform === 'win32' && process.env.APPDATA) {
        skillsTargetDirs.push(path.join(process.env.APPDATA, 'opencode', 'skills'));
      }
    } else {
      skillsTargetDirs.push(path.join(this.projectRoot, '.opencode', 'skills'));
    }

    for (const dir of skillsTargetDirs) {
      await this.writeSkillTemplates(dir);
    }
  }

  async unconfigureOpenCode(isGlobal: boolean): Promise<void> {
    const targetFiles: string[] = [];
    if (isGlobal) {
      targetFiles.push(path.join(this.homeDir, '.config', 'opencode', 'config.json'));
      if (process.platform === 'win32' && process.env.APPDATA) {
        targetFiles.push(path.join(process.env.APPDATA, 'opencode', 'config.json'));
      }
    } else {
      targetFiles.push(path.join(this.projectRoot, 'opencode.json'));
    }

    for (const targetFile of targetFiles) {
      await this.mergeJsonConfig(targetFile, (current) => {
        if (current.mcp) delete current.mcp['ai-browser-testing'];
        if (current.mcpServers) delete current.mcpServers['ai-browser-testing'];
        return current;
      });
    }

    const skillsTargetDirs: string[] = [];
    if (isGlobal) {
      skillsTargetDirs.push(path.join(this.homeDir, '.config', 'opencode', 'skills'));
      if (process.platform === 'win32' && process.env.APPDATA) {
        skillsTargetDirs.push(path.join(process.env.APPDATA, 'opencode', 'skills'));
      }
    } else {
      skillsTargetDirs.push(path.join(this.projectRoot, '.opencode', 'skills'));
    }

    for (const dir of skillsTargetDirs) {
      await this.removeSkillTemplates(dir);
    }
  }

  async configureClaude(isGlobal: boolean): Promise<void> {
    let targetFile: string;
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(this.homeDir, 'AppData', 'Roaming');
      targetFile = path.join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      targetFile = path.join(this.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      targetFile = path.join(this.homeDir, '.config', 'Claude', 'claude_desktop_config.json');
    }

    if (!isGlobal) {
      targetFile = path.join(this.projectRoot, '.claude.json');
    }

    await this.mergeJsonConfig(targetFile, (current) => {
      current.mcpServers = current.mcpServers || {};
      current.mcpServers['ai-browser-testing'] = {
        command: 'node',
        args: [this.mcpExecutablePath],
      };
      return current;
    });

    // Write skills for Claude Code
    const claudeSkillsDir = isGlobal
      ? path.join(this.homeDir, '.claude', 'skills')
      : path.join(this.projectRoot, '.claude', 'skills');
    await this.writeSkillTemplates(claudeSkillsDir);
  }

  async unconfigureClaude(isGlobal: boolean): Promise<void> {
    let targetFile: string;
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(this.homeDir, 'AppData', 'Roaming');
      targetFile = path.join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      targetFile = path.join(this.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      targetFile = path.join(this.homeDir, '.config', 'Claude', 'claude_desktop_config.json');
    }

    if (!isGlobal) {
      targetFile = path.join(this.projectRoot, '.claude.json');
    }

    await this.mergeJsonConfig(targetFile, (current) => {
      if (current.mcpServers) delete current.mcpServers['ai-browser-testing'];
      return current;
    });

    const claudeSkillsDir = isGlobal
      ? path.join(this.homeDir, '.claude', 'skills')
      : path.join(this.projectRoot, '.claude', 'skills');
    await this.removeSkillTemplates(claudeSkillsDir);
  }

  async configureCursor(isGlobal: boolean): Promise<void> {
    const targetFile = isGlobal
      ? path.join(this.homeDir, '.cursor', 'mcp.json')
      : path.join(this.projectRoot, '.cursor', 'mcp.json');

    await this.mergeJsonConfig(targetFile, (current) => {
      current.mcpServers = current.mcpServers || {};
      current.mcpServers['ai-browser-testing'] = {
        command: 'node',
        args: [this.mcpExecutablePath],
      };
      return current;
    });

    // Write rules for Cursor
    const cursorRulesDir = isGlobal
      ? path.join(this.homeDir, '.cursor', 'rules')
      : path.join(this.projectRoot, '.cursor', 'rules');
    await this.writeSkillTemplates(cursorRulesDir);
  }

  async unconfigureCursor(isGlobal: boolean): Promise<void> {
    const targetFile = isGlobal
      ? path.join(this.homeDir, '.cursor', 'mcp.json')
      : path.join(this.projectRoot, '.cursor', 'mcp.json');

    await this.mergeJsonConfig(targetFile, (current) => {
      if (current.mcpServers) delete current.mcpServers['ai-browser-testing'];
      return current;
    });

    const cursorRulesDir = isGlobal
      ? path.join(this.homeDir, '.cursor', 'rules')
      : path.join(this.projectRoot, '.cursor', 'rules');
    await this.removeSkillTemplates(cursorRulesDir);
  }

  async configureWindsurf(isGlobal: boolean): Promise<void> {
    const targetFile = isGlobal
      ? path.join(this.homeDir, '.codeium', 'windsurf', 'mcp_config.json')
      : path.join(this.projectRoot, '.windsurf', 'mcp.json');

    await this.mergeJsonConfig(targetFile, (current) => {
      current.mcpServers = current.mcpServers || {};
      current.mcpServers['ai-browser-testing'] = {
        command: 'node',
        args: [this.mcpExecutablePath],
      };
      return current;
    });

    // Write skills for Windsurf
    const windsurfSkillsDir = isGlobal
      ? path.join(this.homeDir, '.codeium', 'windsurf', 'skills')
      : path.join(this.projectRoot, '.windsurf', 'skills');
    await this.writeSkillTemplates(windsurfSkillsDir);
  }

  async unconfigureWindsurf(isGlobal: boolean): Promise<void> {
    const targetFile = isGlobal
      ? path.join(this.homeDir, '.codeium', 'windsurf', 'mcp_config.json')
      : path.join(this.projectRoot, '.windsurf', 'mcp.json');

    await this.mergeJsonConfig(targetFile, (current) => {
      if (current.mcpServers) delete current.mcpServers['ai-browser-testing'];
      return current;
    });

    const windsurfSkillsDir = isGlobal
      ? path.join(this.homeDir, '.codeium', 'windsurf', 'skills')
      : path.join(this.projectRoot, '.windsurf', 'skills');
    await this.removeSkillTemplates(windsurfSkillsDir);
  }

  private async writeSkillTemplates(targetBaseDir: string): Promise<void> {
    for (const [skillName, content] of Object.entries(SKILL_TEMPLATES)) {
      const skillDir = path.join(targetBaseDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, 'SKILL.md');
      await fs.writeFile(skillFile, content, 'utf-8');
    }
  }

  private async removeSkillTemplates(targetBaseDir: string): Promise<void> {
    for (const skillName of Object.keys(SKILL_TEMPLATES)) {
      const skillDir = path.join(targetBaseDir, skillName);
      await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async mergeJsonConfig(filePath: string, updater: (json: Record<string, any>) => Record<string, any>): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    let data: Record<string, any> = {};
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    const updated = updater(data);
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  static async promptInteractive(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string): Promise<string> =>
      new Promise((resolve) => rl.question(query, resolve));

    console.log('\n🚀 AI Web Testing — Universal Agent Setup Wizard');
    console.log('==================================================');
    console.log('Select the AI Agent(s) you wish to configure:');
    console.log('  1. Antigravity (MCP Server & Global Skills)');
    console.log('  2. OpenCode (MCP Config & Global Skills)');
    console.log('  3. Claude Code / Claude Desktop (MCP Config & Skills)');
    console.log('  4. Cursor (MCP Config & Rules)');
    console.log('  5. Windsurf / Roo Code (MCP Config & Skills)');
    console.log('  A. All Agents (Default)');

    const answer = (await question('\nYour choice [1-5 or A] (Default: A): ')).trim().toLowerCase();
    const scopeAnswer = (await question('Install to Global System Config? [Y/n] (Default: Y): ')).trim().toLowerCase();
    rl.close();

    const isGlobal = scopeAnswer !== 'n';
    let selectedAgents: SupportedAgent[] = [];

    if (answer === '1') selectedAgents = ['antigravity'];
    else if (answer === '2') selectedAgents = ['opencode'];
    else if (answer === '3') selectedAgents = ['claude'];
    else if (answer === '4') selectedAgents = ['cursor'];
    else if (answer === '5') selectedAgents = ['windsurf'];
    else selectedAgents = ['antigravity', 'opencode', 'claude', 'cursor', 'windsurf'];

    console.log(`\n⚙️  Configuring for: ${selectedAgents.join(', ')} (Scope: ${isGlobal ? 'Global' : 'Local Workspace'})...\n`);

    const installer = new AgentInstaller();
    const result = await installer.installForAgents(selectedAgents, isGlobal);

    for (const s of result.installed) {
      console.log(`✅ Successfully configured: ${s}`);
    }
    for (const e of result.errors) {
      console.log(`⚠️ Failed: ${e}`);
    }

    console.log('\n🎉 Setup Complete! Your AI Agent is ready for automated browser testing.');
  }

  static async promptInteractiveUninstall(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string): Promise<string> =>
      new Promise((resolve) => rl.question(query, resolve));

    console.log('\n🗑️  AI Web Testing — Uninstaller Wizard');
    console.log('==========================================');
    console.log('Select the AI Agent(s) you wish to uninstall (Remove MCP & Skills):');
    console.log('  1. Antigravity');
    console.log('  2. OpenCode');
    console.log('  3. Claude Code / Claude Desktop');
    console.log('  4. Cursor');
    console.log('  5. Windsurf / Roo Code');
    console.log('  A. All Agents');

    const answer = (await question('\nYour choice [1-5 or A] (Default: A): ')).trim().toLowerCase();
    const scopeAnswer = (await question('Remove from Global System Config? [Y/n] (Default: Y): ')).trim().toLowerCase();
    rl.close();

    const isGlobal = scopeAnswer !== 'n';
    let selectedAgents: SupportedAgent[] = [];

    if (answer === '1') selectedAgents = ['antigravity'];
    else if (answer === '2') selectedAgents = ['opencode'];
    else if (answer === '3') selectedAgents = ['claude'];
    else if (answer === '4') selectedAgents = ['cursor'];
    else if (answer === '5') selectedAgents = ['windsurf'];
    else selectedAgents = ['antigravity', 'opencode', 'claude', 'cursor', 'windsurf'];

    console.log(`\n🧹 Removing MCP & Skills for: ${selectedAgents.join(', ')}...\n`);

    const installer = new AgentInstaller();
    const result = await installer.uninstallForAgents(selectedAgents, isGlobal);

    for (const s of result.uninstalled) {
      console.log(`✅ Successfully removed: ${s}`);
    }
    for (const e of result.errors) {
      console.log(`⚠️ Failed: ${e}`);
    }

    console.log('\n✨ Uninstall Complete. Your AI Agent environment has been cleanly restored.');
  }
}

