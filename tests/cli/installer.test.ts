import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AgentInstaller } from '../../src/adapters/inbound/cli/installer.js';

describe('AgentInstaller Dynamic Multi-Agent Configuration & Uninstallation', () => {
  it('installs configs and skills for Antigravity, OpenCode, and Cursor dynamically', async () => {
    const tempProject = path.join(os.tmpdir(), `ai-test-proj-${Date.now()}`);
    const tempHome = path.join(os.tmpdir(), `ai-test-home-${Date.now()}`);
    await fs.mkdir(tempProject, { recursive: true });
    await fs.mkdir(tempHome, { recursive: true });

    const installer = new AgentInstaller(tempProject, tempHome);
    const result = await installer.installForAgents(['antigravity', 'opencode', 'cursor'], true);

    expect(result.installed.length).toBe(3);
    expect(result.errors.length).toBe(0);

    // 1. Verify Antigravity Global MCP config
    const agyMcpFile = path.join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const agyRaw = await fs.readFile(agyMcpFile, 'utf-8');
    const agyConfig = JSON.parse(agyRaw);
    expect(agyConfig.mcpServers['ai-browser-testing']).toBeDefined();

    // 2. Verify Antigravity Global Skills dynamically generated
    const agySkillWebTest = path.join(tempHome, '.gemini', 'config', 'skills', 'web-test', 'SKILL.md');
    const skillContent = await fs.readFile(agySkillWebTest, 'utf-8');
    expect(skillContent).toContain('Senior QA Web Testing Skill');

    // 3. Verify OpenCode Global config
    const opencodeJsonPath = path.join(tempHome, '.config', 'opencode', 'config.json');
    const opencodeRaw = await fs.readFile(opencodeJsonPath, 'utf-8');
    const opencodeConfig = JSON.parse(opencodeRaw);
    expect(opencodeConfig.mcpServers['ai-browser-testing']).toBeDefined();

    // 4. Verify Cursor Global config
    const cursorJsonPath = path.join(tempHome, '.cursor', 'mcp.json');
    const cursorRaw = await fs.readFile(cursorJsonPath, 'utf-8');
    const cursorConfig = JSON.parse(cursorRaw);
    expect(cursorConfig.mcpServers['ai-browser-testing']).toBeDefined();

    // Clean up temporary test directories
    await fs.rm(tempProject, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
  });

  it('uninstalls and cleans up MCP configs and skills cleanly', async () => {
    const tempProject = path.join(os.tmpdir(), `ai-test-proj-un-${Date.now()}`);
    const tempHome = path.join(os.tmpdir(), `ai-test-home-un-${Date.now()}`);
    await fs.mkdir(tempProject, { recursive: true });
    await fs.mkdir(tempHome, { recursive: true });

    const installer = new AgentInstaller(tempProject, tempHome);

    // 1. Install first
    await installer.installForAgents(['antigravity', 'opencode'], true);

    // 2. Then uninstall
    const unResult = await installer.uninstallForAgents(['antigravity', 'opencode'], true);
    expect(unResult.uninstalled.length).toBe(2);
    expect(unResult.errors.length).toBe(0);

    // Verify Antigravity config removed
    const agyMcpFile = path.join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const agyConfig = JSON.parse(await fs.readFile(agyMcpFile, 'utf-8'));
    expect(agyConfig.mcpServers['ai-browser-testing']).toBeUndefined();

    // Verify Antigravity skill folder deleted
    const agySkillWebTest = path.join(tempHome, '.gemini', 'config', 'skills', 'web-test');
    const skillExists = await fs.access(agySkillWebTest).then(() => true).catch(() => false);
    expect(skillExists).toBe(false);

    // Verify OpenCode config removed
    const opencodeJsonPath = path.join(tempHome, '.config', 'opencode', 'config.json');
    const opencodeConfig = JSON.parse(await fs.readFile(opencodeJsonPath, 'utf-8'));
    expect(opencodeConfig.mcpServers?.['ai-browser-testing']).toBeUndefined();
    expect(opencodeConfig.mcp?.['ai-browser-testing']).toBeUndefined();

    // Clean up
    await fs.rm(tempProject, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
  });
});
