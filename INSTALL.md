# 📦 Comprehensive Installation & Setup Guide

This guide covers everything you need to know to install, configure, and develop with **`ai-web-tester`**.

---

## 📑 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Quick Installation (For Users & AI Agents)](#-quick-installation-for-users--ai-agents)
   - [Method 1: Interactive 1-Command Wizard (Recommended)](#method-1-interactive-1-command-wizard-recommended)
   - [Method 2: Target-Specific Agent CLI](#method-2-target-specific-agent-cli)
   - [Method 3: Global NPM Installation](#method-3-global-npm-installation)
3. [Agent-Specific Setup & Verification](#-agent-specific-setup--verification)
   - [OpenCode](#1-opencode)
   - [Antigravity](#2-antigravity)
   - [Claude Code & Claude Desktop](#3-claude-code--claude-desktop)
   - [Cursor](#4-cursor)
   - [Windsurf & Roo Code](#5-windsurf--roo-code)
4. [Local Development Installation](#-local-development-installation)
   - [Cloning & Setup](#1-clone-the-repository)
   - [Installing Playwright Chromium](#2-install-playwright-browsers)
   - [Building the Project](#3-build-the-project)
   - [Running the Test Suites](#4-run-tests--verification)
   - [Linking the CLI Locally (`npm link`)](#5-link-the-cli-locally)
5. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## ⚙️ Prerequisites

Before installing, ensure your environment meets the following requirements:
* **Node.js**: `>= 20.0.0` (LTS recommended, e.g., Node 20 or Node 22).
* **NPM**: `>= 10.0.0`
* **Operating System**: Windows, macOS, or Linux.
* **Internet Connection**: For initial Chromium binary download.

Verify your installed versions:
```bash
node -v   # Should output v20.x.x or v22.x.x
npm -v    # Should output 10.x.x or newer
```

---

## 🚀 Quick Installation (For Users & AI Agents)

### Method 1: Interactive 1-Command Wizard (Recommended)

Run the universal setup wizard directly using `npx`:

```bash
npx ai-test init
```

The wizard will prompt you to select your AI coding agent and installation scope (Global vs Workspace):
```text
🚀 AI Web Testing — Universal Agent Setup Wizard
==================================================
Pilih AI Agent yang ingin dikonfigurasi:
  1. Antigravity (MCP Server & Global Skills)
  2. OpenCode (MCP Config & Global Skills)
  3. Claude Code / Claude Desktop (MCP Config & Skills)
  4. Cursor (MCP Config & Rules)
  5. Windsurf / Roo Code (MCP Config & Skills)
  A. Semua Agent di atas (All)

Pilihan Anda [1-5 atau A] (Default: A): A
Pasang ke Global System? [Y/n] (Default: Y): Y
```

### Method 2: Target-Specific Agent CLI

You can bypass interactive prompts by passing the agent flag:

```bash
# Setup for OpenCode
npx ai-test init -a opencode

# Setup for Antigravity
npx ai-test init -a antigravity

# Setup for Claude Code
npx ai-test init -a claude

# Setup for Cursor
npx ai-test init -a cursor

# Setup for Windsurf
npx ai-test init -a windsurf

# Setup for ALL agents at once
npx ai-test init -a antigravity opencode claude cursor windsurf
```

### Method 3: Global NPM Installation

If you prefer having the `ai-test` binary permanently available in your terminal:

```bash
npm install -g ai-web-tester
```

Once installed globally, initialize your agents anytime:
```bash
ai-test init
```

---

## 🤖 Agent-Specific Setup & Verification

### 1. OpenCode
When you run `npx ai-test init -a opencode`, the installer automatically writes:
* **MCP Configuration**: `~/.config/opencode/config.json`
* **Autonomous Skills**: `~/.config/opencode/skills/web-test/SKILL.md`, `web-test-all`, `web-test-fix`

**How to verify:**
1. Open or restart OpenCode.
2. In the chat, type `/skills` or `/web-test`.
3. Ask OpenCode: *"Test my website at http://localhost:3000 and check if the login form works."*

---

### 2. Antigravity
When you run `npx ai-test init -a antigravity`, the installer automatically writes:
* **MCP Configuration**: `~/.gemini/config/mcp_config.json`
* **Global Skills**: `~/.gemini/config/skills/web-test/SKILL.md`

**How to verify:**
1. Open Antigravity CLI or IDE.
2. In the prompt, type `/web-test http://localhost:3000` or `/web-test-all http://localhost:3000`.

---

### 3. Claude Code & Claude Desktop
The installer writes the Stdio MCP configuration to:
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Config structure generated:**
```json
{
  "mcpServers": {
    "ai-browser-testing": {
      "command": "npx",
      "args": ["-y", "ai-web-tester", "serve-mcp"]
    }
  }
}
```

---

### 4. Cursor
The installer writes to:
* **Global MCP**: `~/.cursor/mcp.json`
* **Project Rules**: `.cursor/rules/web-test.mdc`

**How to verify:**
1. Open Cursor Settings $\rightarrow$ Features $\rightarrow$ MCP Servers.
2. Ensure `ai-browser-testing` is active with a green indicator.

---

### 5. Windsurf & Roo Code
The installer writes to `~/.codeium/windsurf/mcp_config.json`.

---

## 🛠️ Local Development Installation

If you want to contribute, modify source code, or run custom test flows locally:

### 1. Clone the Repository
```bash
git clone https://github.com/SiamAlSobari/ai-web-tester.git
cd ai-web-tester
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Install Playwright Browsers
Install the required headless Chromium browser binary:
```bash
npx playwright install --with-deps chromium
```

### 4. Build the Project
Compile the TypeScript code to ESM and type declaration bundles in `dist/`:
```bash
npm run build
```
*(For auto-recompilation on code change during development, run: `npm run dev`)*

### 5. Run Tests & Verification
Verify that everything is working properly:

```bash
# 1. Run strict TypeScript type check (0 errors)
npm run typecheck

# 2. Run all unit and integration test suites
npm test
```

### 6. Link the CLI Locally
To test the `ai-test` command locally without publishing:
```bash
npm link
```
Now you can execute `ai-test` anywhere in your terminal pointing to your local source build!

---

## 🗑️ Clean Uninstallation (Removing MCP & Skills)

If you ever need to remove `ai-web-tester` MCP server and skills from your AI coding agents:

### 1. Interactive Uninstaller Wizard
```bash
npx ai-test uninstall
```
Select the agent you want to clean up:
```text
🗑️  AI Web Testing — Uninstaller Wizard
==========================================
Pilih AI Agent yang ingin di-uninstall (Hapus MCP & Skills):
  1. Antigravity
  2. OpenCode
  3. Claude Code / Claude Desktop
  4. Cursor
  5. Windsurf / Roo Code
  A. Semua Agent di atas (All)
```

### 2. Direct Uninstaller via Flags
```bash
# Remove from specific agent
npx ai-test uninstall -a opencode

# Remove from ALL agents at once
npx ai-test uninstall -a antigravity opencode claude cursor windsurf
```
This cleanly deletes the generated skill directories (`web-test`, `web-test-all`, `web-test-fix`) and removes `ai-browser-testing` entries from the agent configuration files without affecting other tools.

---

## ❓ Troubleshooting & FAQs

### Q: Playwright browser fails to launch or says "Executable doesn't exist"
**Solution:** Run the Playwright browser installer:
```bash
npx playwright install chromium
```

### Q: How do I make the browser visible on screen instead of headless?
**Solution:** By default, tests run in lightweight headless background mode. If you want to see the browser pop up and watch the AI interact live, pass `--headless false` or tell your agent:
> *"Run the test in visible/headed mode."*

### Q: Where are test reports and screenshots saved?
* **Markdown Reports**: Saved automatically in `./test-reports/report-[runId].md`.
* **Error Screenshots**: Saved automatically in `./artifacts/error-step-[step]-[timestamp].png`.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
