# MarkForge Markdown Studio — Release 0.7.0 Architecture Specification
**Advanced Documentation QA for Large Repositories**

**Classification:** High-Reliability Documentation Quality & CI Verification Release  
**Release Version:** v0.7.0  
**Scope:** Configurable Validation Profiles, Workspace-Wide Link & Cross-Doc Anchor Checking, Documentation Coverage Analysis, Navigation Tree Verification, Reusable Project Rules (.devspirehub/qa.json), CI-Friendly Reporting (CLI + JSON/Markdown + GitHub Annotations), Desktop QA Modal.

---

## 1. Executive Summary & Product Objective

Release 0.7.0 expands MarkForge Markdown Studio from active-file editing diagnostics into an **enterprise-grade, workspace-wide Documentation QA and CI validation platform**.

Teams managing multi-folder documentation repositories, technical handbooks, and open-source projects can now:
- Run deterministic project-wide link validation (local files, cross-document anchor slugs `file.md#heading`, local images, and opt-in rate-limited remote URLs).
- Measure documentation coverage (presence of required files like `README.md` and `CONTRIBUTING.md`, required heading sections per document, empty documents, missing H1s, and orphan docs with zero inbound links).
- Verify navigation integrity (order and resolution of nav links in `SUMMARY.md`, `nav.md`, or project configuration, checking for broken links, duplicates, dangling references, and unlisted orphan pages).
- Configure reusable, versioned project rules in `.devspirehub/qa.json` with named profiles (`default`, `strict`, `docs-repo`, `ci-blocking`).
- Execute headless QA in CI pipelines (`npm run qa` / `npm run qa:ci`) with deterministic exit codes (`0` pass, `1` blocking findings, `2` configuration error) and structured JSON/Markdown/GitHub Annotation output.
- Inspect and filter findings in a desktop QA panel with click-through navigation to source lines and one-click report export.

---

## 2. Baseline Classification & Reuse Policy

To preserve the single-pipeline invariant, Release 0.7 strictly builds on existing subsystems without creating divergent parsers:

| Subsystem | Baseline Status | Release 0.7 Extension |
|:---|:---|:---|
| `MarkdownPipeline` (`markdown-pipeline.js`) | **AUTHORITATIVE** | Sole source of AST, headings, slugs, links, images, codeblocks. No second markdown parser. |
| `QualityChecker` (`quality-checker.js`) | **AUTHORITATIVE** | Extend `check()` with profile-aware rule overrides and severities; retain 100% backward-compatibility for active-doc checks. |
| `FileSystemService` / `FileSystemAdapter` | **AUTHORITATIVE** | Provides canonical workspace resolution, traversal guards, virtual storage, and native Tauri FS bridges. |
| `WorkspaceManager` (`workspace-manager.js`) | **AUTHORITATIVE** | Workspace file inventory, search, and document registration. |
| `SaveCoordinator` (`save-coordinator.js`) | **AUTHORITATIVE** | Guarantees QA never triggers background disk writes or mutates sources. |
| `DOMPurify` / Sanitizer | **AUTHORITATIVE** | Neutralizes all report outputs and diagnostic messages rendered in UI. |

---

## 3. Explicit Data-Integrity Invariants

Release 0.7 enforces 12 immutable invariants across UI, background workers, and CI:

1. **Invariant 1: Source Immutability:** QA scanning, rule evaluation, and report generation NEVER modify or touch Markdown source files on disk.
2. **Invariant 2: Revision Consistency:** All file scans capture an immutable pipeline snapshot tagged with document content hash/revision. Stale UI diagnostics are invalidated if a file is modified mid-run.
3. **Invariant 3: Deterministic Reports:** Identical workspace file trees, profiles, and configurations produce identical diagnostic ordering and identical JSON summaries across runs and operating systems.
4. **Invariant 4: Workspace Boundary Enforcement:** All link, image, nav, and config path resolutions strictly reject parent directory traversal (`../`, `..\`), root escapes (`/`, `C:\`), and out-of-vault references with a blocking `ERROR`.
5. **Invariant 5: Fail-Closed Configuration:** If a project config (`.devspirehub/qa.json`) is corrupt, malformed, or references unknown rules/profiles, the run immediately aborts with diagnostic code `2` rather than applying partial/corrupted overrides.
6. **Invariant 6: Honest Exit Codes:** In CLI / CI mode, exit code is `0` ONLY when zero blocking issues exist per the active profile's `failOn` policy. Exit code is `1` for blocking findings, and `2` for configuration/scanner failures. Partial scanner crashes never exit `0`.
7. **Invariant 7: No Silent Auto-Fix:** Quick-fixes remain explicit single-action user confirmations. Project QA never performs batch auto-writes or silent rewrites.
8. **Invariant 8: Pipeline Authority:** All headings, anchor slugs, links, and code fences must be produced by `MarkdownPipeline`. No secondary regex or heuristic parsers are permitted.
9. **Invariant 9: Failure Containment:** If a single file in a large workspace is corrupted or unreadable, a file-level error diagnostic is emitted, and the scanner proceeds to validate remaining files unless `stopOnFatal: true`.
10. **Invariant 10: Zero Secret Leakage:** QA reports, CLI outputs, and logs must never embed GitHub PATs, OAuth tokens, authorization headers, or sensitive environment paths beyond workspace-relative paths.
11. **Invariant 11: Remote Link Opt-In:** Network requests for remote `http(s)` URLs are strictly disabled by default. When explicitly enabled via configuration, requests are rate-limited, enforce timeouts (max 5000ms), and block private/link-local IP addresses (SSRF protection).
12. **Invariant 12: Isolation from Publishing and History:** Project QA operates in a read-only sandboxed coordinator and does not mutate publication tickets, remote drafts, or revision history stores.

---

## 4. Architecture & Layering

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                              │
│   - ProjectQaModalComponent (Profile selector, filterable findings,     │
│     coverage metrics, navigation tree health, report exporter)         │
│   - StatusBarComponent / CommandPalette ("Run Project QA...")          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ EventBus / Direct Invocation
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Application Core Layer                              │
│   - ProjectQaCoordinator (Orchestrates multi-file scan lifecycle)       │
│   - QaRunSession (Manages in-flight run state, progress, cancellation) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Service Interfaces
┌───────────────────────────────────▼────────────────────────────────────┐
│                       QA Services Layer                                │
│   ├─ QaProfileService (Built-in profiles: default, strict, docs-repo,   │
│   │                    ci-blocking; merge overrides)                   │
│   ├─ ProjectRulesLoader (Parse/validate .devspirehub/qa.json, fail-close)│
│   ├─ ProjectLinkChecker (Workspace-wide links, cross-doc anchors,       │
│   │                      assets, SSRF-guarded remote link checks)      │
│   ├─ NavigationChecker (Nav sources, duplicate/dangling link checks)   │
│   ├─ CoverageReporter (Required files, required sections, orphans, H1s)│
│   └─ QaReportWriter (JSON report, Markdown report, GitHub annotations) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Shared Infrastructure Layer                         │
│   - MarkdownPipeline (Authoritative AST & anchor generation)           │
│   - QualityChecker (Extensible diagnostic rules engine)                │
│   - FileSystemService / FileSystemAdapter (Workspace I/O boundary)     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Validation Profiles & Project Rules Schema

### 5.1 Built-in Profiles
1. **`default`:**
   - Single-doc checks matching Release 0.3.
   - `failOn: "error"` (warnings do not fail).
   - No project-wide coverage/nav enforcement.
2. **`strict`:**
   - Missing H1 elevated to `ERROR`.
   - Broken local link elevated to `ERROR`.
   - Missing alt text elevated to `ERROR`.
   - Stale TOC elevated to `ERROR`.
   - `failOn: "error"`.
3. **`docs-repo`:**
   - Comprehensive for multi-doc repositories.
   - Checks local links, cross-document anchors (`doc.md#heading`), images.
   - Evaluates documentation coverage (required files, orphan docs, empty docs).
   - Validates declared navigation structures.
   - `failOn: "error"`.
4. **`ci-blocking`:**
   - Strict subset designed for pull-request gating and CI blocking.
   - Broken local links, unclosed code blocks, corrupt TOC, invalid nav, and missing required files fail the build.
   - `failOn: "error"`.

### 5.2 Project Configuration Schema (`.devspirehub/qa.json`)
```json
{
  "$schema": "https://devspirehub.com/schemas/qa-config-v1.json",
  "version": 1,
  "profile": "docs-repo",
  "include": ["**/*.md"],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/vendor/**"],
  "failOn": "error",
  "rules": {
    "RULE_MISSING_H1": { "enabled": true, "severity": "ERROR" },
    "RULE_BROKEN_LOCAL_LINK": { "enabled": true, "severity": "ERROR" },
    "RULE_BROKEN_CROSS_DOC_ANCHOR": { "enabled": true, "severity": "ERROR" },
    "RULE_ORPHAN_DOCUMENT": { "enabled": true, "severity": "WARNING" },
    "RULE_DANGLING_NAV_ENTRY": { "enabled": true, "severity": "ERROR" },
    "RULE_DUPLICATE_NAV_ENTRY": { "enabled": true, "severity": "WARNING" },
    "RULE_UNCOVERED_REQUIRED_SECTION": { "enabled": true, "severity": "ERROR" },
    "RULE_EMPTY_DOCUMENT": { "enabled": true, "severity": "WARNING" }
  },
  "coverage": {
    "requiredFiles": ["README.md"],
    "requiredSections": {
      "README.md": ["Installation", "Usage"]
    },
    "flagOrphanDocs": true
  },
  "navigation": {
    "sources": ["SUMMARY.md", "docs/SUMMARY.md", "nav.md"]
  },
  "links": {
    "checkRemote": false,
    "remoteTimeoutMs": 5000,
    "maxRemoteConcurrency": 4
  }
}
```

---

## 6. Project-Wide Link, Navigation & Coverage Engines

### 6.1 ProjectLinkChecker
- **Workspace Link Graph:** Indexes all local documents, their headings, and generated slug anchors.
- **Link Types:**
  - Same-doc anchor: `#heading-slug` $\rightarrow$ verified against document's own headings.
  - Cross-doc link: `guide.md` $\rightarrow$ verified against workspace file existence.
  - Cross-doc anchor: `guide.md#installation` $\rightarrow$ verified against target file existence AND target file's heading anchor index.
  - Local image/asset: `images/diagram.png` $\rightarrow$ verified against workspace assets.
  - Path traversal: `../secret.txt` $\rightarrow$ flagged with `RULE_PATH_TRAVERSAL` (`ERROR`).
  - Remote link: `https://example.com` $\rightarrow$ skipped unless `checkRemote: true`. If enabled, checked with timeout and private IP blocklist (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`).

### 6.2 NavigationChecker
- Discovers navigation documents declared in `config.navigation.sources` or default conventions (`SUMMARY.md`, `docs/SUMMARY.md`, `nav.md`).
- Parses markdown list items containing links (e.g. `* Title -> document-path`).
- Validations:
  - **Dangling entries:** Nav links pointing to non-existent files $\rightarrow$ `RULE_DANGLING_NAV_ENTRY` (`ERROR`).
  - **Duplicate entries:** Multiple nav items referencing the identical file path $\rightarrow$ `RULE_DUPLICATE_NAV_ENTRY` (`WARNING`).
  - **Unlisted pages:** Markdown files in workspace not referenced in any navigation source $\rightarrow$ `RULE_UNLISTED_NAV_PAGE` (`INFO` / `WARNING` per profile).

### 6.3 CoverageReporter
- **Required Files:** Checks if all glob patterns in `coverage.requiredFiles` match at least one file. Missing files $\rightarrow$ `RULE_MISSING_REQUIRED_DOC` (`ERROR`).
- **Required Sections:** Inspects target documents for specified H1/H2/H3 heading titles. Missing section $\rightarrow$ `RULE_UNCOVERED_REQUIRED_SECTION` (`ERROR`).
- **Orphan Documents:** Computes inbound link counts from all links and navigation lists. Files with 0 inbound links (except root README) $\rightarrow$ `RULE_ORPHAN_DOCUMENT` (`WARNING`).
- **Empty Documents:** Documents with 0 bytes or whitespace-only $\rightarrow$ `RULE_EMPTY_DOCUMENT` (`WARNING`).
- **Missing H1s:** Documents lacking top-level heading $\rightarrow$ `RULE_MISSING_H1`.

---

## 7. CI / CLI & Reporting Specification

### 7.1 Command Line Interface (`scripts/run-docs-qa.js`)
```bash
# Run with default profile on current workspace
npm run qa

# Run in CI mode blocking on errors with JSON output
npm run qa:ci

# Custom options
node scripts/run-docs-qa.js --root ./docs --profile strict --format markdown --out qa-report.md --fail-on error
```

### 7.2 CLI Arguments
- `--root <path>`: Root workspace directory (default: `.`).
- `--profile <name>`: Profile name (`default`, `strict`, `docs-repo`, `ci-blocking`).
- `--config <path>`: Explicit path to project configuration file.
- `--format <json|markdown|text>`: Output report format (default: `text`).
- `--out <path>`: Output destination file path.
- `--fail-on <error|warning>`: Severity threshold triggering exit code 1 (default: `error`).
- `--annotations <github>`: Output GitHub Actions workflow annotations (`::error file=...,line=...::...`).

### 7.3 Exit Codes
- `0`: Scan completed successfully; no diagnostics meet or exceed `failOn` threshold.
- `1`: Scan completed; blocking diagnostics found meeting or exceeding `failOn` threshold.
- `2`: Tooling or configuration error (invalid JSON, path traversal outside root, missing required config).

### 7.4 Structured JSON Report Schema (`qa-report-v1`)
```json
{
  "reportVersion": "1.0.0",
  "studioVersion": "0.7.0",
  "timestamp": "2026-10-19T07:30:00.000Z",
  "workspaceRoot": "docs",
  "profile": "docs-repo",
  "failOn": "error",
  "passed": false,
  "summary": {
    "filesScanned": 24,
    "totalDiagnostics": 3,
    "errors": 1,
    "warnings": 2,
    "info": 0
  },
  "coverage": {
    "requiredFiles": { "total": 2, "matched": 2, "missing": [] },
    "requiredSections": { "total": 3, "matched": 2, "missing": [{ "file": "README.md", "section": "Usage" }] },
    "orphanDocs": ["docs/archived-note.md"],
    "emptyDocs": []
  },
  "navigation": {
    "sourcesChecked": ["docs/SUMMARY.md"],
    "totalNavItems": 18,
    "brokenNavItems": 0,
    "duplicateNavItems": 0
  },
  "diagnostics": [
    {
      "id": "diag-RULE_BROKEN_LOCAL_LINK-12",
      "ruleId": "RULE_BROKEN_LOCAL_LINK",
      "severity": "ERROR",
      "file": "docs/architecture.md",
      "line": 12,
      "column": 1,
      "message": "Linked local file \"missing-guide.md\" was not found in the workspace.",
      "target": "[Guide](missing-guide.md)"
    }
  ]
}
```

---

## 8. Threat Model & Security Mitigations

| Asset | Threat Vector | Mitigation Strategy |
|:---|:---|:---|
| **Local Filesystem** | Link traversal (`../../etc/passwd`) | `isWithinWorkspace` boundary check; traversal attempts emit `ERROR` and abort file resolution. |
| **Network / Remote URLs** | SSRF to cloud metadata / intranet (`169.254.169.254`, `localhost`) | Opt-in only; private IP and localhost regex blacklist; short timeouts (5s); zero credential headers. |
| **Configuration Files** | Malicious / unbounded `.devspirehub/qa.json` | JSON schema validation; size cap (64KB); strict unknown rule rejection; fail-closed execution. |
| **UI Presentation** | Stored XSS in diagnostic messages / file names | HTML character escaping via `escapeHtml` / `DOMPurify` before DOM rendering in QA panel. |
| **CI Logs & Reports** | Token & credential leakage in logs | Application of `redactSensitiveData`; workspace-relative path normalization. |

---

## 9. Release-Blocking Quality Gates

- **Gate A (Compilation & Build):** `npm run build` succeeds without warnings or bundle errors.
- **Gate B (Regression Testing):** All 225 existing tests from Releases 0.1–0.6 remain green.
- **Gate C (QA Unit Suites):** Unit tests pass for profiles, rules loader, link checker, nav checker, coverage reporter, and report writer.
- **Gate D (QA Integration & CLI):** Headless test fixture executes `scripts/run-docs-qa.js`, verifying exit codes `0`, `1`, and `2`.
- **Gate E (Security Verification):** Path traversal, SSRF prevention, HTML escaping, and credential redaction tests pass.
- **Gate F (Desktop UX Smoke):** Project QA panel opens from command palette, runs scan on active workspace, renders diagnostics and coverage, and exports report.
- **Gate G (Documentation & Versioning):** `package.json` bumped to `0.7.0`, `docs/RELEASE_0.7_REPORT.md` written, `ARCHITECTURE.md` and `README.md` updated.
