# Security Architecture & Vulnerability Disclosure

DevspireHub Markdown Studio is engineered with a **secure-by-default, offline-first** security architecture. This document outlines our threat model, defensive boundaries, credential protections, and responsible vulnerability reporting policy.

---

## 1. Threat Model & Security Boundaries

```
┌────────────────────────────────────────────────────────┐
│                   Desktop User Runtime                 │
│                                                        │
│  ┌───────────────────────┐   IPC Allowlist             │
│  │ Webview Frontend      │ ──────────────────► Rust    │
│  │ (Strict CSP, No Node) │ ◄────────────────── Backend │
│  └───────────────────────┘                     (Tauri) │
│              │                                    │    │
│              ▼                                    ▼    │
│       DOMPurify AST                     SafeWriter     │
│       (Sanitized HTML)                  (Atomic / Capped)│
└────────────────────────────────────────────────────────┘
```

### 1.1 Webview Isolation & Capability Lockdown
* **Zero Node Integration:** The webview executes in a sandboxed context without access to Node.js `process`, `child_process`, or raw POSIX primitives.
* **Strict Content Security Policy (CSP):**
  ```http
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'
  ```
  * Disallows inline script execution (`<script>` injection).
  * Blocks external font CDN tracking (zero connections to `fonts.googleapis.com` or third parties).
  * Limits network egress strictly to GitHub API endpoints (`https://api.github.com`) solely when the user explicitly triggers remote operations.

### 1.2 Protocol Scheme Restrictions
* **Navigation Lockdown:** The webview is barred from navigating away from the local application bundle.
* **Blocked Execution Schemes:** Any link targeting `javascript:`, `data:text/html`, `vbscript:`, or `file://` is intercepted and rejected with an explicit security notification.
* **Safe External Openings:** Valid `http://` and `https://` documentation links open exclusively in the operating system's default browser with `noopener,noreferrer` attributes.

### 1.3 Parser Sanitization & XSS Defense
* Markdown body rendering passes through **DOMPurify** configured with a strict whitelist:
  * **Forbidden Tags:** `<script>`, `<style>`, `<iframe>`, `<frame>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<meta>`, `<link>`, `<applet>`, `<xml>`, `<template>`.
  * **Forbidden Attributes:** All event handlers (`onerror`, `onload`, `onclick`, `onmouseover`, etc.), `formaction`, `autofocus`, and `xlink:href`.
  * **SVG Safety:** SVG diagrams (Mermaid, CAD wireframes) are constrained to non-executable geometric primitives (`<path>`, `<rect>`, `<circle>`, `<line>`, `<ellipse>`).

### 1.4 Filesystem Isolation & Path Traversal Prevention
* All file paths are validated against directory traversal attacks (`../`, `..\`, `%2e%2e`).
* File mutations are confined within the active workspace root (`SafeWriter.validate_path`).
* Atomic writes are performed via sibling temporary files (`.tmp-save-*`) before being renamed into place, guaranteeing zero-byte truncation immunity during abrupt process termination.

---

## 2. Credential Security & Secret Redaction

* **OS-Backed Keyrings / Web Crypto Vault:**
  * GitHub Personal Access Tokens (PAT) and workspace credentials are never stored in plaintext on disk.
  * In desktop environments, credentials use OS-level encrypted storage (DPAPI on Windows, Keychain on macOS, Secret Service on Linux) or an AES-GCM 256-bit ephemeral cryptographic vault.
* **Log Redaction:**
  * All diagnostic logging passes through `redactSensitiveData()` and `sanitizeLogData()`.
  * System user home paths (`C:\Users\<username>`, `/home/<username>`, `/Users/<username>`) are sanitized.
  * Document body contents and authorization tokens (`ghp_`, `github_pat_`, Bearer tokens) are automatically redacted before console or file emission.

---

## 3. Offline-First Privacy Guarantee

* DevspireHub Markdown Studio contains **zero telemetry**, **zero analytics trackers**, and **zero external CDN dependencies**.
* Editing, rendering, graph indexing, Table of Contents generation, Quality Diagnostics, and PDF/HTML exports run 100% locally without sending document content across the wire.

---

## 4. Reporting Security Vulnerabilities

We take security vulnerabilities seriously. If you discover a vulnerability, please report it responsibly:

* **Email:** `security@devspirehub.com`
* **GitHub:** Use GitHub's private vulnerability reporting feature under the **Security** tab of the repository.
* **Response SLA:**
  * **Initial acknowledgment:** Within 24 hours.
  * **Triage & severity assessment:** Within 72 hours.
  * **Patch release:** High/Critical vulnerabilities are patched in an out-of-band security release within 7 days.
* **Please include:**
  * Detailed reproduction steps or proof-of-concept payload.
  * Operating system and studio version.
  * Potential impact assessment.
