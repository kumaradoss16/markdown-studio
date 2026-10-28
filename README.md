# MarkForge: Markdown Studio

[![Release](https://img.shields.io/badge/release-v1.0.1-blue.svg)](https://github.com/kumaradoss16/markdown-studio/releases/tag/v1.0.1)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011%20(x64)-brightgreen.svg)](https://github.com/kumaradoss16/markdown-studio/releases)
[![Toolchain](https://img.shields.io/badge/toolchain-MSVC%20%7C%20Visual%20Studio%202026-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A professional, lightweight, local-first Markdown documentation workspace and native desktop studio.

MarkForge Markdown Studio combines a sleek studio layout, file and workspace explorer, tabbed document editor, CodeMirror 6 editing, live GitHub Flavored Markdown (GFM) preview, atomic file persistence, a native Visual Studio C++ / WebView2 runtime, and a secure Tauri 2 desktop boundary.

---

## Downloads (Windows 10 / 11 x64)

Grab the latest production binaries from the [**GitHub Releases page**](https://github.com/kumaradoss16/markdown-studio/releases/tag/v1.0.1):

| Download | Type | Description |
|:---|:---:|:---|
| [**`markdown-studio-v1.0.1-windows-x64-setup.exe`**](https://github.com/kumaradoss16/markdown-studio/releases/download/v1.0.1/markdown-studio-v1.0.1-windows-x64-setup.exe) | **Installer** | Modern Inno Setup 6 installer. Installs per-user to `{localappdata}\Programs` without requiring UAC elevation. Adds Start Menu shortcuts, optional desktop icon, optional `.md` file associations, and an uninstaller. |
| [**`markdown-studio-v1.0.1-windows-x64-portable.exe`**](https://github.com/kumaradoss16/markdown-studio/releases/download/v1.0.1/markdown-studio-v1.0.1-windows-x64-portable.exe) | **Portable** | Single-file executable. All web assets are embedded directly inside the binary. Runs standalone with zero installation, zero registry writes, and zero external CRT dependencies (`/MT`). |
| [**`SHA256SUMS.txt`**](https://github.com/kumaradoss16/markdown-studio/releases/download/v1.0.1/SHA256SUMS.txt) | **Checksums** | Official SHA-256 integrity manifest. |

---

## Key Features

- **Native Windows C++ Desktop Host (v1.0.1):** High-performance Win32 application (`src-win32/`) built with Visual Studio C++ (`cl.exe` / `msbuild`) with DPI awareness, Windows 11 immersive dark-mode title bar, static CRT linking (`/MT`), and Microsoft Edge WebView2 integration.
- **Single-File Portable Executable (v1.0.1):** All web assets (HTML, CSS, JavaScript, icons) are embedded as PE resources and served via `SetVirtualHostNameToFolderMapping`. Runs offline anywhere without requiring installation or sibling files.
- **Clean PDF Export Engine (v1.0.1):** 
  - Consistent **20mm top and bottom margins** across every page via CSS `@page` paged media rules, eliminating margin doubling and edge clipping.
  - Full **color fidelity** (`print-color-adjust: exact`) preserving custom user highlight colors, colored table cells, code block styles, and SVGs.
  - Automatic suppression of browser print header/footer text (URLs, dates, page titles).
  - Page-break protection (`break-inside: avoid`) on tables, lists, images, and code blocks.
- **Security & UX Hardening (v1.0.1):**
  - Interactive modal dialog for masking GitHub Personal Access Tokens (eliminating insecure `prompt()` inputs).
  - Strict Content Security Policy (CSP) with `wasm-unsafe-eval` restriction.
  - Sanitized WikiLink navigation (`[[Target]]`) preventing path traversal.
  - Instant theme application script preventing Flash of Unstyled Content (FOUC).
- **Advanced Documentation QA & CI Verification:** Workspace-wide link verification, cross-document anchor checking (`doc.md#heading`), documentation coverage analysis, navigation tree validation (`SUMMARY.md`), and headless CI runner with GitHub Actions annotations.
- **Document Revision History & Restore Previews:** Content-addressed revision tracking, chronological checkpoints, side-by-side dual-pane line diffs, and preview-first restoration with dirty conflict protection.
- **Durable Audit Trail:** Append-only audit logging of all document actions (`OPEN`, `SAVE`, `RESTORE`, `EXPORT`, `PUBLISH_ATTEMPT`) with strict secret and token redaction.
- **Safe GitHub Publishing:** Two-phase review modal, working-branch isolation, base SHA freshness verification, conflict review, and atomic ticket boundaries.
- **Professional Studio Workspace:** Dual-split editor and preview layout with custom cyberpunk aesthetic matching workstation reference designs.
- **Multi-Theme Switcher:** Instant runtime switching between Cyberpunk Dark, Paper Clean Light, Monokai Pro Charcoal, and Matrix Emerald themes with persistent storage.
- **CodeMirror 6 Core:** Native Markdown syntax highlighting, line numbers gutter, active line tracking, find & replace (`@codemirror/search`), and formatting toolbar.
- **Live GFM Preview:** GitHub Flavored Markdown rendering with strict DOMPurify sanitization preventing script execution, XSS, and dangerous URI schemes.
- **Interactive Local Graph View:** Embedded SVG knowledge-graph visualization of note relationships.
- **Draft Crash Recovery Journal:** Write-ahead snapshot journaling in local storage for crash protection.
- **Live Status Bar:** Dynamic word count, character count, estimated reading time, file encoding (`UTF-8`), and cursor position (`Ln, Col`).

---

## Project Structure

```text
markforge-markdown-studio/
├── src/                              # Frontend application layer
│   ├── app/                          # Bootstrap, commands, typed event bus
│   ├── components/                   # UI presentation layer
│   │   ├── app-shell/                # Header toolbar, window controls, view toggles
│   │   ├── sidebar/                  # Vault explorer, tags cloud, interactive graph view
│   │   ├── document-tabs/            # Tab bar, dirty indicators, safe close dialogs
│   │   ├── editor/                   # CodeMirror 6 instance, formatting tools, search
│   │   ├── preview/                  # Live rendered document, metric cards
│   │   ├── status-bar/               # Real-time document stats and cursor tracking
│   │   └── dialogs/                  # Unsaved changes modal, command palette, toasts
│   ├── core/                         # Core models (DOM-independent)
│   │   ├── document-state-manager.js # Revision tracking and dirty states
│   │   ├── save-coordinator.js       # Atomic write coordinator & collision detector
│   │   ├── workspace-manager.js      # Vault structure, tags, and graph nodes
│   │   └── recovery-manager.js       # Draft crash recovery journaling
│   ├── services/                     # Application services
│   │   ├── filesystem-adapter.js     # Native bridge + virtual storage fallback
│   │   ├── markdown-service.js       # GFM parser + DOMPurify sanitization
│   │   ├── export-engine.js          # HTML, PDF, Markdown export coordinator
│   │   └── credential-store.js       # Encrypted token storage
│   ├── styles/                       # CSS design system (tokens, layout, themes)
│   └── main.js                       # Frontend entry point
├── src-win32/                        # Visual Studio C++ Native Windows Host
│   ├── main.cpp                      # Win32 entry, WebView2 controller, asset unpacker
│   ├── version.h                     # Version metadata (single source of truth)
│   ├── resource.rc                   # Version info and embedded PE resources
│   ├── app.manifest                  # DPI awareness (PerMonitorV2) & OS compatibility
│   ├── app.ico                       # Multi-resolution application icon
│   └── MarkdownStudio.vcxproj        # MSVC project definition (/MT, C++17)
├── installer/                        # Windows Installer Package
│   └── markdown-studio.iss           # Inno Setup 6 installer definition
├── src-tauri/                        # Rust desktop backend (Tauri 2)
│   ├── src/                          # Tauri native bridge commands
│   ├── Cargo.toml                    # Rust dependencies
│   └── tauri.conf.json               # Window configuration & permissions
├── scripts/                          # Build automation and verification utilities
│   ├── generate-win32-resources.js   # Generates resource.rc & embedded assets header
│   ├── verify-pdf-runner.js          # Headless PDF page margin & color audit runner
│   ├── build-windows.js              # Windows executable build coordinator
│   ├── lint-check.js                 # Static code analysis
│   └── run-docs-qa.js                # Documentation QA runner
├── tests/                            # Automated test suite (Vitest)
│   ├── unit/                         # Unit tests (editor, state, security, parser)
│   ├── integration/                  # File lifecycle, export engine, history
│   └── security/                     # XSS prevention, path traversal regression tests
├── MarkdownStudio.sln                # Visual Studio 2026 Solution
├── package.json                      # Node.js dependencies and scripts
└── vite.config.js                    # Vite bundler configuration
```

---

## Getting Started

### Prerequisites
- **Node.js:** v22.19+ (tested on v24.20)
- **Visual Studio 2022 or 2026:** with the "Desktop development with C++" workload (for native Win32 builds)
- **Microsoft Edge WebView2 Runtime:** (pre-installed on Windows 11 and modern Windows 10)
- **Rust Toolchain (optional):** 1.77+ (if building the Tauri 2 target)
- **Inno Setup 6 (optional):** for compiling the Windows installer (`winget install JRSoftware.InnoSetup`)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/kumaradoss16/markdown-studio.git
cd markdown-studio
npm install
```

### Development
Start the local Vite development server:
```bash
npm run dev
```

---

## Building Desktop Executables

### 1. Build Single-File Portable EXE (Visual Studio C++)
Compiles the web frontend, embeds assets as PE resources, and links statically with `/MT`:
```powershell
# Step 1: Compile web assets
npm run build

# Step 2: Generate Win32 resource headers
node scripts/generate-win32-resources.js

# Step 3: Build native C++ executable via MSBuild (x64 Release)
msbuild MarkdownStudio.sln /p:Configuration=Release /p:Platform=x64 /m /v:m
```
The resulting executable is generated in:
`dist\markdown-studio-v1.0.1-windows-x64-portable.exe`

### 2. Build Inno Setup Installer
After generating the portable executable, package it into a setup wizard:
```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\markdown-studio.iss
# or if installed in LocalAppData:
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" installer\markdown-studio.iss
```
The installer is generated in:
`dist\markdown-studio-v1.0.1-windows-x64-setup.exe`

---

## Automated Tests & Documentation QA

Run the full automated test suite (56 test files, 385 tests):
```bash
npm run test
```

Run static analysis lint checks:
```bash
npm run lint
```

Run Documentation QA on workspace links and navigation:
```bash
npm run qa
```

Run Documentation QA in CI blocking mode:
```bash
npm run qa:ci
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+S` | Save active document |
| `Ctrl+Shift+S` | Save As (choose new destination) |
| `Ctrl+N` | New Markdown document |
| `Ctrl+P` | Open Command Palette / Quick Search |
| `Ctrl+B` | Toggle Workspace Sidebar |
| `Ctrl+F` | Find & Replace in Editor / Focus Mode |
| `Ctrl+W` | Safely close active document tab |

---

## License

This project is licensed under the [MIT License](LICENSE).
