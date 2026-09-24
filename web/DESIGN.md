# AI Web Tester Design Direction (DESIGN.md)

This document defines the visual design system, identity, and liveliness dials for the `ai-web-tester` web documentation and landing page.

---

## 1. Identity & Personality

- **Product**: Autonomous browser execution engine & 24 MCP tools for AI coding agents.
- **Target Audience**: AI engineers, autonomous coding agent users (Antigravity, OpenCode, Claude Code, Cursor, Windsurf), QA automation engineers.
- **Core Personality**: High-precision Developer Infrastructure Tooling. Think Unix CLI tools, Cloudflare Workers docs, Rust / Zig documentation.
- **Atmosphere**: Technical, calm, high information density, crisp contrast, zero generic SaaS fluff, zero marketing exaggeration.

---

## 2. Color Palette & Surfaces

All color combinations strictly comply with WCAG AA (minimum 4.5:1 for body copy, 3:1 for large display text).

| Role | Color Token | Hex Code | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `surface-0` | `#09090b` | Deep dark obsidian canvas |
| **Card / Panel Surface** | `surface-1` | `#121215` | Elevated container and feature panels |
| **Code / Recessed Surface** | `surface-2` | `#18181b` | Terminal blocks, code inputs, table headers |
| **Hairline Border** | `border-subtle`| `#27272a` | Sharp, crisp structural dividers |
| **Border Active / Focus** | `border-focus` | `#52525b` | Hover and focus-visible outlines |
| **Text Primary** | `text-primary` | `#fafafa` | Headlines, code values, primary labels (14.2:1 contrast) |
| **Text Secondary** | `text-secondary`| `#a1a1aa` | Explanatory prose and descriptions (6.8:1 contrast) |
| **Text Muted** | `text-muted` | `#71717a` | Meta labels, timestamps, line numbers (4.6:1 contrast) |
| **Primary Accent** | `accent-amber` | `#f59e0b` | Interactive anchors, primary CTA, terminal gold |
| **Terminal Success** | `status-ok` | `#10b981` | Passing checks, active sessions, valid exit codes |
| **Terminal Alert** | `status-err` | `#ef4444` | Failure indicators, broken links, HTTP errors |
| **Terminal Info** | `status-info` | `#06b6d4` | ARIA tree tags, protocol badges |

---

## 3. Typography System

- **Primary Body / UI**: `IBM Plex Sans`, `-apple-system`, `sans-serif`
  - High legibility, structural warmth, clean neutral forms without quirky rounded corners.
- **Technical / Code**: `JetBrains Mono`, `Fragment Mono`, `ui-monospace`, `monospace`
  - Used for terminal commands, MCP tool signatures, ARIA tree snapshots, keyboard shortcuts, and version strings.
- **Weights**: 400 (regular prose), 500 (medium labels), 600 (semi-bold titles and commands).

---

## 4. Layout & Craftsmanship Rules

1. **Geometry**:
   - Radii are intentional and tight: `rounded-md` (6px) for buttons/inputs, `rounded-lg` (8px) for cards, `rounded-xl` (12px) for major outer frames.
   - Avoid pill-shaped capsule badge overload (`rounded-full` everywhere).
2. **Copywriting Integrity**:
   - Zero em dash (`—`) characters. Use colon, comma, or parentheses.
   - Zero marketing buzzwords ("revolutionary", "cutting edge", "seamless AI magic").
   - Explicit technical descriptions: "ARIA tree compression", "deterministic [ref=N] selectors", "24 MCP tools", "WCAG 2.1 AA audits".
3. **Evidence Over Claims**:
   - Zero fake statistics ("10,000+ happy companies").
   - Only real verifiable numbers: 24 MCP tools, 5 supported coding ecosystems, 40 automated test suites, Playwright 1.49 engine.
   - Zero fictional testimonials or AI avatar reviews.
4. **Functional Completeness**:
   - Every interactive element must perform an action (e.g. 1-click clipboard copy with visual feedback, real links, interactive tabs).
   - Navigation links must lead to real existing pages.
