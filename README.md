<div align="center">

# 🌐 AI Web Tester
### *The Autonomous Eyes & Hands for AI Coding Agents in the Browser*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-green.svg?style=flat-square&logo=playwright)](https://playwright.dev/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![M8ven Verified](https://m8ven.ai/badge/mcp/siamalsobari-ai-web-tester-a1ng3r?variant=verified)](https://m8ven.ai/mcp/siamalsobari-ai-web-tester-a1ng3r)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.x-339933.svg?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=flat-square)](LICENSE)


<p align="center">
  <b>Give your AI coding assistant (OpenCode, Antigravity, Claude Code, Cursor, Windsurf) the power to interact with, explore, test, and fix real web applications like a Senior QA Engineer.</b>
</p>

</div>

> [!IMPORTANT]
> 📖 **Looking for step-by-step setup instructions or local development setup?** Check out the [**Complete Installation & Setup Guide (INSTALL.md)**](INSTALL.md) for 1-command installer wizards, agent-specific guides (OpenCode, Antigravity, Claude Code, Cursor, Windsurf), and troubleshooting tips.

---

## 💡 The Missing Piece in AI Coding

AI coding agents can write complex code, refactor components, and fix syntax errors. But there has always been a fundamental blind spot: **AI agents cannot see or experience the application running in a real browser.**

A login page might have clean code, yet:
* The submit button fails to trigger in specific browser states.
* An unhandled JavaScript exception silently crashes the React hydration root.
* Form validation passes invalid email formats or crashes on edge-case inputs.
* Dynamic modals or infinite scrolls break user navigation.

**`ai-web-tester` bridges this gap.** It acts as the high-speed sensory and motor system for AI agents, allowing them to autonomously open URLs (localhost or live), test multi-step user scenarios, catch runtime errors, take visual snapshots of bugs, and compile professional Markdown reports.

---

## ⚡ Key Highlights

### 1. 🧠 Senior QA Testing Matrices Built-in
Your AI agent doesn't just "click a button" — it executes comprehensive, multi-layer test matrices:
* **Empty / Required Field Validation**: Checks HTML5 & custom error states when mandatory fields are omitted.
* **Format Violations & Boundary Limits**: Tests invalid email syntax, password length boundaries, and type constraints.
* **Wrong Credentials & State Integrity**: Verifies 401 alert banners and error handling without application crashes.
* **Security & Injection Guardrails**: Evaluates handling of special characters, SQLi patterns (`' OR '1'='1`), and XSS strings.
* **Happy Path (End-to-End Success)**: Completes full user flows and validates state changes, cookies, and redirects.

### 2. 🪶 >90% Token Reduction (Semantic State Compression)
Raw HTML DOM dumps consume tens of thousands of LLM tokens and cause selector hallucinations. **`ai-web-tester` prunes the DOM and extracts a clean, numbered Accessibility (ARIA) Tree**:
```text
🌐 Current Page: "Customer Portal"
[1] textbox "Email" (required, placeholder="name@domain.com")
[2] textbox "Password" (type=password)
[3] button "Sign In"
[4] link "Forgot Password?"
```
The AI agent interacts simply by referencing deterministic IDs: `click(ref=3)` or `fill(ref=1, "admin@test.com")`.

### 3. 🚀 Lightweight & Headless by Default
Runs entirely in the background using headless Chromium. It consumes minimal RAM and CPU, ensuring your computer stays fast and quiet while your agent audits your application.

### 4. 📸 Smart Error-Triggered Screenshots
No wasted disk space or clutter. Screenshots are captured **automatically only when an anomaly occurs** (console error, network 500, unhandled exception, or broken selector) and saved directly into `./artifacts/` with direct clickable links in the report.

### 5. 🚨 360° Runtime Telemetry & Crash Watchdog
Silently observes browser lifecycle events:
* **`console.error` & `console.warn`** interceptor with precise stack traces.
* **Unhandled JavaScript runtime exceptions** (`pageerror`).
* **Failed HTTP network responses** (`4xx` / `5xx`) and broken asset requests.
* **Main-thread freeze & infinite loop detection** via watchdog timeout guards.

### 6. 📄 Automated Markdown (.md) Test Reports
Compiles test results into standardized, human-readable Markdown documents with YAML frontmatter at `./test-reports/report-[runId].md`:
* Overall status (`PASSED`, `FAILED`, `WARNING`) and duration metrics.
* Complete step-by-step audit log with `✅` and `❌` status indicators.
* Exact error traces and reproduction steps.
* Embedded links to screenshot artifacts.
* Actionable fix recommendations for the developer or AI agent.

---

## 🧙 1-Command Universal Setup Wizard

Easily configure `ai-web-tester` for any AI agent on your machine with one interactive command:

```bash
node dist/cli.js init
```

Or target a specific agent directly:

```bash
# For OpenCode
node dist/cli.js init -a opencode

# For Antigravity
node dist/cli.js init -a antigravity

# For Claude Code / Claude Desktop
node dist/cli.js init -a claude

# For Cursor
node dist/cli.js init -a cursor

# For Windsurf / Roo Code
node dist/cli.js init -a windsurf

# For ALL agents at once
node dist/cli.js init -a antigravity opencode claude cursor windsurf
```

---

## 🤖 Supported AI Agent Ecosystems

| Agent | Configuration Location | Integration Type |
| :--- | :--- | :--- |
| **OpenCode** | `~/.config/opencode/config.json` | Native MCP + Skills |
| **Antigravity** | `~/.gemini/config/mcp_config.json` | Native MCP + Global Skills |
| **Claude Code / Desktop** | `claude_desktop_config.json` | Stdio MCP Server |
| **Cursor** | `~/.cursor/mcp.json` | Project / Global MCP |
| **Windsurf / Roo Code** | `~/.codeium/windsurf/mcp_config.json` | Universal MCP |

---

## 🛠️ Model Context Protocol (MCP) Tools

When connected via MCP, your AI coding agent gains access to **10 specialized enterprise-grade tools**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AI Web Tester MCP Engine                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
    ┌───────────────────┬──────────────┴───────┬───────────────────┐
    ▼                   ▼                      ▼                   ▼
browser_open       browser_act            browser_inspect     browser_switch_tab
(Launch & scan)   (Click, fill, upload)  (State & telemetry)  (Multi-tab/popups)
    │                   │                      │                   │
    ▼                   ▼                      ▼                   ▼
browser_save_auth  browser_audit_a11y     browser_crawl       browser_report
(Save login state) (WCAG 2.1 AA audit)   (Sitemap & 404s)    (Export .md summary)
```

| Tool Name | Key Parameters | Description |
| :--- | :--- | :--- |
| `browser_open` | `url` *(required)*, `headless?`, `device?`, `storageState?`, `networkProfile?`, `recordTrace?` | Opens the target URL in Chromium, applies device presets, loads auth states, and returns initial ARIA state. |
| `browser_act` | `action` *(click, fill, hover, press, select, scroll, upload, download, switch_tab, screenshot)*, `ref?`, `value?`, `filePaths?` | Executes an interaction on a referenced element with retry logic, file I/O, or download interception. |
| `browser_inspect` | _(none)_ | Refreshes and returns the active page state, interactive refs, and captured runtime errors. |
| `browser_switch_tab` | `tabIndex?` | Switches active browser focus between multiple tabs or OAuth popups, or lists all open tabs. |
| `browser_save_auth` | `path?` | Saves active browser session cookies and localStorage to JSON for re-use in future tests. |
| `browser_audit_a11y` | _(none)_ | Runs an automated WCAG 2.1 AA accessibility audit via `axe-core` and returns findings. |
| `browser_crawl` | `url` *(required)*, `maxDepth?`, `maxPages?` | Autonomously explores all internal routes, maps sitemap hierarchy, and identifies 404 broken links. |
| `browser_screenshot` | `name?`, `fullPage?` | Manually captures a visual screenshot and saves it to `./artifacts/`. |
| `browser_report` | `title?`, `outputPath?` | Compiles test execution history, telemetry, and screenshots into a structured `.md` report. |
| `browser_close` | _(none)_ | Safely terminates the browser session and frees all system memory. |

---

## 🖥️ Standalone CLI Usage

You can also run automated browser tests directly from your terminal:

```bash
# 1. Quick inspection of interactive elements on any page (with optional device preset)
node dist/cli.js open http://localhost:3000 -d "iPhone 15"

# 2. Run automated health check & compile a Markdown report with Playwright trace
node dist/cli.js test http://localhost:3000 --title "Homepage Smoke Test" --trace

# 3. Autonomously crawl internal website routes & build sitemap
node dist/cli.js crawl http://localhost:3000 --depth 3 --pages 20

# 4. Start local interactive web dashboard
node dist/cli.js ui --port 3100

# 5. Start the MCP Server over stdio manually
node dist/cli.js serve-mcp
```


---

## 📋 Sample Markdown Test Report Output

When your test finishes, `ai-web-tester` generates a report like this:

```markdown
---
test_run_id: "rep-1723651234-a8f2"
title: "Authentication Flow - Senior QA Matrix"
target_url: "http://localhost:3000/login"
status: "PASSED"
duration_ms: 3420
total_steps: 5
passed_steps: 5
failed_steps: 0
issues_count: 0
timestamp: "2026-08-14T23:45:00.000Z"
---

# 📋 Laporan Hasil Pengujian: Authentication Flow - Senior QA Matrix

## 📊 Ringkasan Eksekusi
* **Target URL**: `http://localhost:3000/login`
* **Status Keseluruhan**: ✅ PASSED
* **Durasi Pengujian**: 3.42 detik (3420 ms)
* **Total Langkah**: 5 (✅ 5 Passed | ❌ 0 Failed)
* **Total Isu/Error**: 0

---

## 🚶 Urutan Langkah Pengujian (Execution Steps)
✅ **Step 1**: `CLICK` on [ref=3] (button "Sign In") — *Tested empty field validation*

✅ **Step 2**: `FILL` on [ref=1] with value `"invalid-email"` — *Tested invalid email format*

✅ **Step 3**: `FILL` on [ref=1] with value `"' OR '1'='1"` — *Tested security edge cases*

✅ **Step 4**: `FILL` on [ref=1] with value `"valid@company.com"`

✅ **Step 5**: `FILL` on [ref=2] with value `"secretpass123"`

---

## 🚨 Temuan Masalah & Error (Issues & Anomalies)
✅ *No runtime errors, console errors, or failed network responses detected.*

---

## 💡 Rekomendasi untuk AI Coding Agent / Developer
- Semua langkah pengujian berhasil dijalankan tanpa terdeteksi anomali.
```

---

## 🏗️ Architecture & Engineering Principles

Built with clean **Hexagonal Architecture (Ports and Adapters)**:
* **Domain Core**: Pure domain models (`Session`, `Action`, `PageState`, `Issue`, `TestReport`) free from third-party framework dependencies.
* **Outbound Infrastructure**: High-resilience Playwright driver with smart auto-waiting, auto-scrolling, telemetry observers, and a Handlebars Markdown report generator.
* **Inbound Interfaces**: First-class Model Context Protocol (MCP) server over standard input/output (`stdio`) and Commander CLI runner.
* **Anti-Zombie Browser Protection**: Signal traps on `SIGINT`, `SIGTERM`, `SIGHUP`, and uncaught exceptions guarantee that headless Chromium processes are never orphaned in system memory.

---

## 🧪 Development & Contribution

```bash
# Install dependencies
npm install

# Download Chromium browser
npx playwright install chromium

# Run full unit & E2E integration test suite
npm test

# Run strict TypeScript typechecking
npm run typecheck

# Build ESM & TypeScript declaration bundles
npm run build
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
