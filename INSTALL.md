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
npx ai-web-tester init
```
*(or `npx ai-test init`)*

The wizard will prompt you to select your AI coding agent and installation scope (Global vs Workspace):
```text
🚀 AI Web Testing — Universal Agent Setup Wizard
==================================================
Select the AI Agent(s) you wish to configure:
  1. Antigravity (MCP Server & Global Skills)
  2. OpenCode (MCP Config & Global Skills)
  3. Claude Code / Claude Desktop (MCP Config & Skills)
  4. Cursor (MCP Config & Rules)
  5. Windsurf / Roo Code (MCP Config & Skills)
  A. All Agents (Default)

Your choice [1-5 or A] (Default: A): A
Install to Global System Config? [Y/n] (Default: Y): Y
```


### Method 2: Target-Specific Agent CLI

You can bypass interactive prompts by passing the agent flag:

```bash
# Setup for OpenCode
npx ai-web-tester init -a opencode

# Setup for Antigravity
npx ai-web-tester init -a antigravity

# Setup for Claude Code
npx ai-web-tester init -a claude

# Setup for Cursor
npx ai-web-tester init -a cursor

# Setup for Windsurf
npx ai-web-tester init -a windsurf

# Setup for ALL agents at once
npx ai-web-tester init -a antigravity opencode claude cursor windsurf
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

If you ever need to completely remove `ai-web-tester` MCP server configurations and autonomous skills from your AI coding agents, choose the method matching your environment:

### 👤 Method 1: For End-Users (via NPX — No Repository Clone Required)

You do **not** need the repository source code. Simply run from any terminal:

#### A. Interactive Wizard
```bash
npx ai-web-tester uninstall
```
*(or `npx ai-test uninstall`)*

Select the agents you wish to clean up:
```text
🗑️  AI Web Testing — Uninstaller Wizard
==========================================
Select the AI Agent(s) you wish to uninstall (Remove MCP & Skills):
  1. Antigravity
  2. OpenCode
  3. Claude Code / Claude Desktop
  4. Cursor
  5. Windsurf / Roo Code
  A. All Agents
```

#### B. Direct Flag Execution (Non-interactive)
```bash
# Remove from ALL agents at once (Global)
npx ai-web-tester uninstall -a antigravity opencode claude cursor windsurf

# Remove from a specific agent
npx ai-web-tester uninstall -a antigravity
npx ai-web-tester uninstall -a opencode
npx ai-web-tester uninstall -a claude
npx ai-web-tester uninstall -a cursor
npx ai-web-tester uninstall -a windsurf

# If installed in a local workspace project instead of global config:
npx ai-web-tester uninstall -a antigravity --local
```

---

### 📦 Method 2: For Globally-Installed NPM Package

If you previously installed `ai-web-tester` globally via `npm install -g ai-web-tester`:

```bash
# Step 1: Remove MCP server configurations and skills from agents
ai-test uninstall -a antigravity opencode claude cursor windsurf

# Step 2: Remove the global npm package from your computer
npm uninstall -g ai-web-tester
```

---

### 💻 Method 3: For Local Developers (Inside Cloned Repository)

If you are inside the cloned `ai-web-tester` project directory:

```bash
# Unlink local binary (if linked via npm link)
npm unlink -g ai-web-tester

# Run uninstaller from source build
node dist/cli.js uninstall -a antigravity opencode claude cursor windsurf
```

---

### 🛠️ Method 4: Complete Manual Cleanup (No Node.js Required)

If you prefer to remove configs and skills manually:

| Agent | 1. Remove MCP Server Config (delete key `"ai-browser-testing"`) | 2. Remove Skills (delete `web-test*` folders) |
| :--- | :--- | :--- |
| **Google Antigravity** | `~/.gemini/config/mcp_config.json` | `~/.gemini/config/skills/` |
| **OpenCode** | `~/.config/opencode/config.json` *(or `%APPDATA%\opencode\config.json`)* | `~/.config/opencode/skills/` |
| **Claude Code / Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` *(Win)* / `~/Library/Application Support/Claude/...` *(Mac)* | `~/.claude/skills/` |
| **Cursor** | `~/.cursor/mcp.json` | `~/.cursor/rules/` |
| **Windsurf / Roo Code** | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/skills/` |

This completely restores your AI agent configurations to their original state without affecting other tools or skills.

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
