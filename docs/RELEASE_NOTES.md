# Release Notes — Version 1.0.0 Production Hardening

DevspireHub Markdown Studio **Release 1.0.0** marks the milestone transition from developer preview to a dependable, hardened, production-ready desktop and offline-first documentation studio.

This release is centered around **software reliability, application security, explicit data-integrity invariants, and reproducible distribution quality gates**.

---

## 1. Security Review & Capability Lockdown (Secure-by-Default)

- **Strict Content Security Policy (CSP)**:
  - Eliminated external font and style network calls (removed Google Fonts CDN; transitioned to local system font stacks).
  - Enforced strict script and object boundaries (`script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'none'; font-src 'self'; frame-ancestors 'none'`).
- **Comprehensive AST Sanitization**:
  - Expanded DOMPurify configuration to strictly forbid vulnerable elements (`<template>`, `<meta>`, `<link>`, `<base>`, `<form>`, `<applet>`, `<xml>`) and dangerous attributes (`xlink:href`, `formaction`, `autofocus`, and all event handlers).
- **Navigation & Protocol Lockdown**:
  - Universal link click interception across all preview documents: blocks dangerous schemes (`javascript:`, `vbscript:`, `data:`, `file:`).
  - External web links (`http://`, `https://`) are strictly opened using the system default browser with `noopener,noreferrer`.
  - Workspace relative links (`./relative-note.md`) are routed internally through workspace path resolution.
- **Privacy & Telemetry Sanitation**:
  - Centralized log sanitizer redacts OS user paths (`C:\Users\[REDACTED_USER]`, `/home/[REDACTED_USER]`), auth tokens, passwords, and sensitive query parameters before any diagnostics are printed or exported.
- **Dependency Vulnerability Elimination**:
  - Locked and overridden critical upstream dependencies (`tinypool`, `@vitest/mocker`).
  - Production dependency audit (`npm audit --omit=dev`) verifies **0 vulnerabilities**.

---

## 2. Reliability Hardening & Data Integrity Invariants

- **Transactional File Writing**:
  - `SaveCoordinator` enforces single-flight write transactions. Concurrent save attempts on the same document throw structured `SAVE_ABORTED` errors rather than interleaving writes.
- **Continuous 3-Second Crash Recovery Journal**:
  - `RecoveryManager` captures atomic snapshots of dirty document buffers every 3 seconds into local persistent storage.
  - Automatically restores unsaved drafts upon startup following an unexpected shutdown, power loss, or crash.
- **Non-Destructive Backup Retention**:
  - Successful disk commits gracefully clear the active journal while preserving the previous recovery draft under `devspirehub:recovery:last_backup` as an emergency fallback.
- **Deterministic Workspace State**:
  - Active editor tabs, document selections, zoom levels, and layout split ratios are restored deterministically across sessions.

---

## 3. Performance Profiling & Large-Document Budgets

- **Large Document Processing Budget**:
  - Optimized AST and Markdown pipelines tested and verified to parse and render documents exceeding **10,000 lines / 600 KB** within strict performance thresholds (<10ms AST generation).
- **Debounced Preview Rendering (80ms)**:
  - Markdown preview updates are debounced to prevent main thread rendering thrashing during high-speed typing on massive documents.
- **Deferred Graph Indexing**:
  - Workspace link graph indexing is deferred post-mount (100ms) to ensure instantaneous application startup and first-contentful paint.
- **Auto-Cooling Force Simulation**:
  - The Bi-Directional Link Graph simulation automatically decays (`alpha` -> 0) and enters complete idle sleep after settling, eliminating background CPU and GPU battery drain.

---

## 4. Packaging, CI/CD Quality Gates & Release Automation

- **Pre-Commit / Release-Blocking Lint Quality Gate**:
  - Added `scripts/lint-check.js` verifying JSON schema validity, prohibiting `eval` and `new Function`, checking ESM import resolution across `.js/.ts/.tsx/.json`, and confirming CSP conformance.
- **Multi-OS CI/CD Pipeline**:
  - `.github/workflows/ci.yml` runs across Ubuntu, Windows, and macOS matrices validating linting, security audits, Vitest unit/integration/stress suites, and Documentation QA CLI validation.
- **Automated Release Pipeline & Cryptographic Verification**:
  - `.github/workflows/release.yml` automates artifact builds and executes `scripts/generate-checksums.js` to produce SHA-256 `checksums.txt` for all release assets.

---

## 5. Architectural Boundaries & Known Limits

- **Single-User Desktop & Offline Workspace**: DevspireHub Markdown Studio is intentionally designed as an offline-first single-user application. It does not contain server-side collaborative CRDT synchronizers or cloud-hosted user databases.
- **Local File Protocol Isolation**: The application does not serve or mount arbitrary `file://` resources from outside the active workspace directory.
- **Hardware Acceleration Requirements**: Graph view requires HTML5 Canvas support; environments with disabled hardware acceleration automatically fall back to software rendering.
