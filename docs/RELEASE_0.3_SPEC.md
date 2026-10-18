# DevspireHub Markdown Studio — Release 0.3 Architecture Specification

**Classification:** Reliability-sensitive feature release  
**Release:** v0.3.0  
**Scope:** Shared Markdown Processing Pipeline, Table of Contents (TOC) Generator, Modular Quality Checker, Link & Asset Validator, Self-Contained Export Engine, Templates & Theme Consistency.

---

## 1. Existing Architecture & Baseline Findings

### 1.1 Baseline Classification of Subsystems
- **CodeMirror 6 Editor:** `WORKING` (Line numbers, active line, search panel, markdown keymaps).
- **Document State Lifecycle:** `WORKING` (`CLEAN`, `DIRTY`, `SAVING`, `SAVE_ERROR`, `EXTERNAL_CHANGE` revision models).
- **SaveCoordinator & SafeWriter:** `WORKING` (Atomic temporary write, SHA-256 collision detection, path traversal protection).
- **Crash Recovery Manager:** `WORKING` (Write-ahead snapshot journal in localStorage).
- **Markdown Rendering & Sanitization:** `WORKING` (Marked GFM + DOMPurify script/event/protocol neutralization).
- **TOC Generation:** `MISSING` (To be implemented in Release 0.3 with managed regions).
- **Documentation Quality Checker & Diagnostics:** `MISSING` (To be implemented with structured diagnostics schema).
- **Link & Asset Validation:** `MISSING` (To be implemented with explicit asset resolution policy).
- **Self-Contained Export Engine:** `PARTIALLY_IMPLEMENTED` (Basic standalone HTML and print exist; comprehensive self-contained asset embedding, pre-flight validation, and transactional export to be implemented).
- **Technical Documentation Templates:** `MISSING` (README, API docs, Runbook, Changelog, Tutorial to be added).

---

## 2. Shared Markdown Processing Pipeline

The core architectural invariant of Release 0.3 is:
**One authoritative pipeline powers Preview, Outline, TOC Generation, Quality Diagnostics, Asset Validation, and Export.**

```text
┌─────────────────────────────────────────────────────────────┐
│          Immutable Document Snapshot (id, revision, content) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│           Centralized Markdown Pipeline Engine              │
│       - GFM AST Parser (Marked Lexer / AST Nodes)           │
│       - Structured Metadata Extractor (Headings, Links,     │
│         Images, Code Blocks, Raw HTML, Frontmatter)         │
│       - Deterministic Anchor Generator (duplicate-aware)    │
└──────────────┬───────────────┬───────────────┬──────────────┘
               │               │               │
      ┌────────▼───────┐┌──────▼───────┐┌──────▼───────┐
      │  TOC Generator ││Quality Engine││Asset Resolver│
      │(Managed Region)││ (Diagnostics)││(Local/Anchor)│
      └────────────────┘└──────────────┘└──────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Sanitized Render Stage                      │
│             - DOMPurify Security Enforcement                 │
│             - Print / Export Theme Injection                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       Live Desktop Preview           Export Artifact
                                  (HTML, PDF, Raw MD)
```

### Deterministic Anchor ID Rules
- Lowercase normalized text.
- Punctuation removed (`[^a-z0-9\s-]`).
- Whitespace replaced with hyphen (`-`).
- Duplicate occurrences indexed with suffix: `heading`, `heading-1`, `heading-2`.
- Compatible across Preview anchors, TOC links, and exported HTML.

---

## 3. Explicit Data-Integrity Invariants

1. **Source Immutability by Default:** Preview, validation, linting, and export never alter source content.
2. **Revision Consistency:** All operations consume an immutable snapshot tagged with `documentRevision`. Stale results are flagged or discarded.
3. **Narrow Source Transformations:** TOC updates and diagnostic quick-fixes only modify designated byte ranges (`<!-- DEVSPIREHUB_TOC_START -->` to `<!-- DEVSPIREHUB_TOC_END -->`), preserving all surrounding text byte-for-byte.
4. **Explicit Changes Only:** Background processes never silently modify files. User confirmation is mandatory.
5. **No Stale Source Writes:** If document revision changes after a transformation proposal is created, the proposal is rejected.
6. **Export Isolation:** Export failures leave original source and pre-existing valid export artifacts intact.
7. **Asset Integrity:** Required assets are resolved against the active workspace boundary. Missing assets block default self-contained export.
8. **Sanitization Consistency:** Preview and Export enforce identical DOMPurify security restrictions.
9. **Deterministic Output:** Identical source revision and config yields semantically identical AST and anchors.
10. **Failure Containment:** Individual rule or parser anomalies are captured in diagnostics without crashing the editor.
11. **Workspace Boundary Enforcement:** Path resolution strictly forbids parent directory escapes (`..`) and unsafe URL protocols.
12. **Honest Completion Status:** Success is reported only when the target artifact exists on disk and passed validation.

---

## 4. Threat Model & Security Boundaries

| Asset / Boundary | Threat Vector | Mitigation Strategy |
| :--- | :--- | :--- |
| **Markdown Source** | Embedded XSS (`<script>`, `<img onerror=...>`, `javascript:`) | DOMPurify sanitization with strict whitelist + URI protocol validation |
| **Local Links & Assets** | Path traversal (`../`, absolute system paths, symlink escape) | Strict workspace boundary enforcement; rejection of traversal sequences |
| **Remote Resources** | Data leakage, SSRF, untrusted remote fetching | Offline-first default; zero background remote network requests |
| **Managed TOC Region** | Corrupted markers, regex denial of service (ReDoS), file truncation | Non-greedy, linear boundary parsing; validation before slice replacement |
| **Export Filesystem** | Overwriting critical system files | Canonical path checks within user-selected or designated export directories |

---

## 5. Release-Blocking Quality Gates

- **Gate A (Static Checks & Compilation):** `npm run build` succeeds; zero syntax errors.
- **Gate B (Functional Correctness):** 100% test pass on Vitest test suites (pipeline, TOC, quality checker, link/asset resolver, export engine).
- **Gate C (Security Regression):** DOMPurify script stripping, path traversal blocking, and safe protocol tests pass.
- **Gate D (Data Integrity):** Source preservation verified across TOC updates and failed exports.
- **Gate E (Desktop Integration):** Real workspace UI renders diagnostics panel, TOC modal, export manager, and templates.
