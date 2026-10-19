# MarkForge: Markdown Studio

> A professional, lightweight, local-first Markdown documentation workspace for desktop.

MarkForge Markdown Studio combines a sleek studio layout, file and workspace explorer, tabbed document editor, CodeMirror 6 editing, live GitHub Flavored Markdown (GFM) preview, atomic file persistence, and a secure Tauri 2 / Rust native desktop boundary.

---

## Key Features

- **Advanced Documentation QA & CI Verification (Release 0.7):** Workspace-wide link verification, cross-document anchor checking (`doc.md#heading`), documentation coverage analysis, navigation tree validation (`SUMMARY.md`), reusable `.devspirehub/qa.json` rules, and headless CI runner with GitHub Actions annotations.
- **Document Revision History & Restore Previews (Release 0.6):** Content-addressed revision tracking, chronological checkpoints, side-by-side dual-pane line diffs, preview-first restoration with dirty conflict protection (`⌘H`).
- **Durable Audit Trail (Release 0.6):** Append-only audit logging of all document actions (`OPEN`, `SAVE`, `RESTORE`, `EXPORT`, `PUBLISH_ATTEMPT`) with strict secret and token redaction.
- **Safe GitHub Publishing (Release 0.5):** Two-phase review modal, working-branch isolation, base SHA freshness verification, conflict review, and atomic ticket boundaries.
- **GitHub Integration (Release 0.4):** Personal Access Token authentication, repository/branch browsing, remote draft editing, and offline change tracking.
- **Professional Studio Workspace:** Dual-split editor and preview layout with custom cyberpunk aesthetic matching workstation reference designs.
- **Multi-Theme Switcher (Release 0.2):** Instant runtime switching between Cyberpunk Dark, Paper Clean Light, Monokai Pro Charcoal, and Matrix Emerald themes with persistent storage.
- **Export Engine (Release 0.2):** Export documents as standalone styled HTML (with embedded CSS), raw Markdown (`.md`), or clean print-formatted PDF (`@media print`).
- **CodeMirror 6 Core:** Native Markdown syntax highlighting, line numbers gutter, active line tracking, find & replace (`@codemirror/search`), and formatting toolbar.
- **Live GFM Preview:** GitHub Flavored Markdown rendering with strict DOMPurify sanitization preventing script execution, XSS, and dangerous URI schemes.
- **Document Lifecycle & Dirty Tracking:** Revision-aware document models (`CLEAN`, `DIRTY`, `SAVING`, `SAVE_ERROR`, `EXTERNAL_CHANGE`) with unsaved tab close confirmation dialogs.
- **Atomic Safe-Write File Operations:** Temporary file creation with atomic replacement and SHA-256 collision detection protecting against concurrent external edits.
- **Interactive Local Graph View:** Embedded SVG knowledge-graph visualization of note relationships.
- **Draft Crash Recovery Journal:** Write-ahead snapshot journaling in local storage for crash protection.
- **Live Status Bar:** Dynamic word count, character count, estimated reading time, file encoding (`UTF-8`), and cursor position (`Ln, Col`).

---

## Project Structure

```text
markforge-markdown-studio/
├── src/
│   ├── app/                    # Application bootstrap, commands, and typed event bus
│   ├── components/             # Presentation layer
│   │   ├── app-shell/          # Header toolbar, window controls, view toggles
│   │   ├── sidebar/            # Vault explorer, tags cloud, interactive graph view
│   │   ├── document-tabs/      # Tab bar, dirty indicators, safe close dialogs
│   │   ├── editor/             # CodeMirror 6 instance, formatting tools, find & replace
│   │   ├── preview/            # Live rendered document, CAD wireframe, metric cards
│   │   ├── status-bar/         # Real-time document stats and cursor tracking
│   │   └── dialogs/            # Unsaved changes modal, command palette, toasts
│   ├── core/                   # Application core layer (DOM-independent)
│   │   ├── document-state-manager.js # Revision tracking and dirty states
│   │   ├── save-coordinator.js       # Atomic write coordinator & collision detector
│   │   ├── workspace-manager.js      # Vault structure, tags, and graph nodes
│   │   └── recovery-manager.js       # Draft crash recovery journaling
│   ├── services/               # Services layer
│   │   ├── filesystem-service.js     # Tauri 2 native bridge + virtual storage fallback
│   │   ├── markdown-service.js       # GFM parser + DOMPurify sanitization
│   │   └── error-service.js          # Normalized error codes and user diagnostics
│   ├── styles/                 # CSS design system (tokens, layout, components, themes)
│   └── main.js                 # Frontend entry point
├── src-tauri/                  # Rust desktop backend (Tauri 2)
│   ├── src/
│   │   ├── main.rs             # Application binary entry
│   │   ├── lib.rs              # Registered restricted commands
│   │   ├── commands/           # Native read_file, save_file, list_workspace
│   │   └── filesystem/         # Atomic SafeWriter, path traversal guards, tests
│   ├── capabilities/           # Restricted Tauri 2 permissions
│   ├── tauri.conf.json         # Window configuration, strict CSP
│   └── Cargo.toml              # Rust dependencies
└── tests/                      # Automated test suite
    ├── unit/                   # Document state, save coordinator, recovery, markdown
    ├── integration/            # File lifecycle and workspace operations
    └── security/               # Path traversal prevention and XSS regressions
```

---

## Getting Started

### Prerequisites
- **Node.js:** v18+ (tested on v24.20)
- **Rust Toolchain:** 1.77+ (tested on 1.99.1)

### Installation
```bash
npm install
```

### Development
Start the local development server:
```bash
npm run dev
```

Launch the Tauri desktop application:
```bash
npm run tauri dev
```

### Production Build & Desktop Packaging
```bash
# Build production web bundle
npm run build

# Compile Windows executables (.exe setup installer & standalone portable)
npm run build:win

# Generate clean, unbloated source code archive (source-code.zip)
npm run pack:source
```

---

## Documentation & Release Architecture

- [Release & Build Automation Guide](docs/RELEASE_WORKFLOW.md)
- [Installation & Deployment Guide](docs/INSTALLATION.md)
- [Security & Threat Model Architecture](docs/SECURITY.md)
- [Backup & Crash Recovery Architecture](docs/BACKUP_AND_RECOVERY.md)
- [Troubleshooting & Operational Guide](docs/TROUBLESHOOTING.md)
- [Release Notes — Version 1.0.0](docs/RELEASE_NOTES.md)

---

## Running Automated Tests & Documentation QA

Run the complete frontend and security test suite:
```bash
npm run test
```

Run static analysis lint quality gate:
```bash
npm run lint
```

Run Documentation QA on workspace (interactive / text report):
```bash
npm run qa
```

Run Documentation QA in CI blocking mode with structured JSON output:
```bash
npm run qa:ci
```

Run Rust native backend unit tests:
```bash
cd src-tauri
cargo test --lib
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `⌘S` / `Ctrl+S` | Save active document |
| `⇧⌘S` / `Ctrl+Shift+S` | Save As (choose new destination) |
| `⌘N` / `Ctrl+N` | New Markdown document |
| `⌘P` / `Ctrl+P` | Open Command Palette / Quick Search |
| `⌘B` / `Ctrl+B` | Toggle Workspace Sidebar |
| `⌘F` / `Ctrl+F` | Find & Replace in Editor / Focus Mode |
| `⌘W` / `Ctrl+W` | Safely close active document tab |

---

## License
Proprietary - DevspireHub Team.
