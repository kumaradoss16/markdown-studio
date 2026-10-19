/**
 * Technical Documentation Templates for MarkForge Markdown Studio Release 1.0.
 */

export const TEMPLATES = [
  {
    id: 'readme',
    name: 'Standard Project README',
    description: 'Comprehensive open-source or internal service README with badges, architecture, and quickstart.',
    filename: 'README.md',
    content: `# Project Name

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

> Concise one-sentence mission statement describing the purpose and value of this project.

<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->

## Overview

Provide high-level context explaining what problem this system solves and who it is intended for.

- **Primary Goal:** Summary of the core objective.
- **Architectural Scope:** Key subsystems and operational boundaries.
- **Local-First:** Engineered to run with zero remote runtime dependencies.

## Key Features

- **Reliable Local Editing:** Fast document operations with zero network latency.
- **Deterministic Validation:** Continuous structural inspection against technical quality gates.
- **Self-Contained Export:** Clean standalone HTML and PDF artifacts with embedded styling.

## Prerequisites

- Node.js 20+ / Rust stable (if building native desktop runtime)
- Modern web browser or desktop runtime

## Quick Start

\`\`\`bash
# 1. Clone the repository
git clone https://github.com/org/project-name.git

# 2. Install dependencies
cd project-name
npm install

# 3. Launch local development server
npm run dev
\`\`\`

## Architecture

\`\`\`text
+-------------------+      +-------------------+
|   Document View   | ---> |  Shared Pipeline  |
+-------------------+      +-------------------+
                                     |
                                     v
                           +-------------------+
                           |  Quality Checker  |
                           +-------------------+
\`\`\`

## Contributing

1. Fork the repository and create a feature branch (\`git checkout -b feature/amazing-feature\`).
2. Verify all quality gates pass (\`npm test && npm run build\`).
3. Commit your changes with conventional messages (\`git commit -m 'feat: add capability'\`).
4. Push to branch and open a Pull Request.

## License

Distributed under the MIT License. See \`LICENSE\` for more information.
`
  },
  {
    id: 'api-reference',
    name: 'API Reference Specification',
    description: 'Structured REST / RPC API documentation with authentication, schemas, and endpoints.',
    filename: 'API_REFERENCE.md',
    content: `# API Reference Specification

**Version:** 1.0.0  
**Base URL:** \`https://api.domain.com/v1\`  
**Protocol:** HTTPS / JSON

<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->

## Authentication

All API endpoints require a bearer token passed in the \`Authorization\` header:

\`\`\`http
Authorization: Bearer <API_KEY>
\`\`\`

| Status Code | Description |
| :--- | :--- |
| \`401 Unauthorized\` | Missing or invalid API key. |
| \`403 Forbidden\` | Insufficient permissions for requested resource. |
| \`429 Too Many Requests\` | Rate limit exceeded (limit: 120 req/min). |

## Standard Error Schema

\`\`\`json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource id was not located.",
    "status": 404,
    "timestamp": "2026-10-18T10:00:00Z"
  }
}
\`\`\`

## Endpoints

### 1. List Documents

Retrieves a paginated list of active documents in the workspace.

- **Method:** \`GET\`
- **Path:** \`/documents\`
- **Query Parameters:**
  - \`limit\` (integer, optional, default: 20)
  - \`cursor\` (string, optional)

#### Example Request

\`\`\`bash
curl -X GET "https://api.domain.com/v1/documents?limit=10" \\
  -H "Authorization: Bearer test_token_xyz"
\`\`\`

#### Example Response (\`200 OK\`)

\`\`\`json
{
  "data": [
    {
      "id": "doc_01j9x7k",
      "name": "architecture.md",
      "revision": 4,
      "updatedAt": "2026-10-18T09:30:00Z"
    }
  ],
  "nextCursor": null
}
\`\`\`

### 2. Create Document

Creates a new document draft in the specified directory.

- **Method:** \`POST\`
- **Path:** \`/documents\`
- **Content-Type:** \`application/json\`

#### Request Payload

\`\`\`json
{
  "name": "release-plan.md",
  "content": "# Release Plan\\n\\nInitial draft."
}
\`\`\`
`
  },
  {
    id: 'runbook',
    name: 'Operational Runbook',
    description: 'Production triage, incident response, diagnostic runbook, and mitigation workflows.',
    filename: 'RUNBOOK.md',
    content: `# Operational Runbook: Documentation Service

**Service ID:** \`svc-doc-engine\`  
**Classification:** Tier 2 Internal Operations  
**On-Call Rotation:** Infrastructure & Platform Engineering

<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->

## Service Overview & SLOs

- **Availability Target:** 99.9% uptime per calendar month.
- **P95 Latency:** < 150ms for document transformation and validation.
- **RPO (Recovery Point Objective):** < 10 seconds (local write-ahead recovery journal).
- **RTO (Recovery Time Objective):** < 2 minutes (cold restart).

## Severity Levels

| Severity | Definition | Response SLA |
| :--- | :--- | :--- |
| **SEV-1** | Total workspace corruption or data loss threat. | 15 minutes |
| **SEV-2** | Export engine or save coordinator degraded. | 1 hour |
| **SEV-3** | Preview desynchronization or styling glitch. | Next business day |

## Incident Triage Checklist

1. **Verify State Health:** Check status bar diagnostics for uncommitted changes or save errors.
2. **Inspect Recovery Journal:** Verify localStorage snapshot presence (\`devspire_recovery_journal\`).
3. **Check Native Process:** Inspect Tauri Rust process memory and disk I/O metrics.
4. **Reproduce Failure:** Run \`npm test\` to isolate regression.

## Mitigation Procedures

### Scenario A: Save Lock Collision (\`SAVE_ERROR\`)

1. Check if another process is holding a file lock on the target path.
2. If temporary file (\`.tmp-*\`) exists in directory, inspect its timestamp.
3. Remove stale temporary files older than 5 minutes.
4. Retry save operation through the SafeWriter workflow.

### Scenario B: Preview Memory Pressure

1. Trigger CodeMirror garbage collection by toggling tab focus.
2. Clear pipeline cache (\`markdownPipeline.cache.clear()\`).
3. Reload document snapshot.
`
  },
  {
    id: 'changelog',
    name: 'Changelog (Keep a Changelog)',
    description: 'Semantic version history following Keep a Changelog standards.',
    filename: 'CHANGELOG.md',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->

## [Unreleased]

### Added
- Pre-flight diagnostic check gating exports on critical validation errors.
- Support for base64 local image embedding in standalone HTML exports.

## [0.3.0] - 2026-10-18

### Added
- Shared Markdown Processing Pipeline unifying Preview, Outline, TOC, and Export.
- Automated Table of Contents generator with managed region boundary preservation.
- Modular documentation quality checker with 10 deterministic rules.
- Technical documentation templates (README, API Reference, Runbook, Changelog, Tutorial).

### Fixed
- Deterministic duplicate heading slug collisions resolved with numbered suffixes.
- DOMPurify sanitization boundary hardened against SVG and style event handlers.

## [0.2.0] - 2026-10-17

### Added
- Tabbed multi-document workspace management.
- Atomic SaveCoordinator with temporary file swapping and collision prevention.
- Crash recovery manager with write-ahead localStorage snapshots.

## [0.1.0] - 2026-10-17

### Added
- Baseline CodeMirror 6 markdown editor with syntax highlighting.
- Live preview pane with sanitized GFM rendering.
`
  },
  {
    id: 'tutorial',
    name: 'Technical Tutorial Guide',
    description: 'Pedagogical step-by-step tutorial with prerequisites, code walk-through, and verification.',
    filename: 'TUTORIAL.md',
    content: `# Technical Tutorial: Building with Markdown Studio

**Estimated Completion Time:** 20 minutes  
**Skill Level:** Intermediate  
**Target Environment:** Local Desktop (Windows / macOS / Linux)

<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->

## What You Will Learn

- How to structure technical documentation with managed TOC markers.
- How to validate internal anchors and local media assets.
- How to export self-contained, publication-ready HTML documents.

## Prerequisites

Before beginning this tutorial, ensure you have:
1. MarkForge Markdown Studio installed and running.
2. A working directory with sample markdown notes.

## Step 1: Initialize Your Document

Create a new file in your workspace named \`guide.md\`. Ensure it starts with a primary H1 heading:

\`\`\`markdown
# User Onboarding Guide

Welcome to the application onboarding workflow.
\`\`\`

## Step 2: Insert Managed Table of Contents

Place your cursor beneath the introduction and insert the managed TOC region markers:

\`\`\`markdown
<!-- DEVSPIREHUB_TOC_START -->
<!-- DEVSPIREHUB_TOC_END -->
\`\`\`

Click **Insert / Update TOC** from the toolbar. Notice that the studio automatically scans all subsequent headings and populates the region.

## Step 3: Add Structured Content

Add secondary and tertiary headings to organize your guide:

\`\`\`markdown
## System Configuration

Configure your environment settings in \`config.json\`.

### Database Connection

Ensure your local connection string is specified.
\`\`\`

## Step 4: Verify Quality Diagnostics

Look at the **Diagnostics Bar** at the bottom of the workspace:
- Ensure **0 Errors** are reported.
- If warnings appear (e.g., missing alt text on images), click the diagnostic item to jump directly to the line.

## Step 5: Export Standalone Artifact

1. Open the **Export** dialog (\`Ctrl+E\`).
2. Select **Standalone HTML**.
3. Check **Embed Local Images (Base64)**.
4. Click **Export Document**.

Verify that the generated HTML file opens in any browser completely offline with all styles intact!
`
  }
];
