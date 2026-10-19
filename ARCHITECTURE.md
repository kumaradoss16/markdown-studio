# DevspireHub Markdown Studio — Architecture & Technical Design

## 1. Architectural Principles

DevspireHub Markdown Studio follows a strictly layered, local-first architecture designed to ensure zero data loss, rock-solid security boundaries, and high-performance editing.

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Layer 1: Presentation                       │
│  (AppShell, Sidebar, DocumentTabs, CodeMirror 6, Preview, Status)│
└───────────────────────────────┬─────────────────────────────────┘
                                │ EventBus / Core APIs
┌───────────────────────────────▼─────────────────────────────────┐
│                   Layer 2: Application Core                     │
│ (DocumentStateManager, SaveCoordinator, WorkspaceManager, WAL) │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Service Interfaces
┌───────────────────────────────▼─────────────────────────────────┐
│                      Layer 3: Services                          │
│     (FileSystemService, MarkdownService, ErrorService)          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Restricted IPC (Invoke)
┌───────────────────────────────▼─────────────────────────────────┐
│                 Layer 4: Native Desktop Runtime                 │
│      (Tauri 2 + Rust SafeWriter, CSP, Atomic File I/O)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Document State Model & Revision Awareness

Every open document in `DocumentStateManager` is an independent model tracking:
- `id`: Unique internal session identifier.
- `path`: Canonical disk path (or null for untitled drafts).
- `content`: In-memory content string.
- `revision`: Integer incremented on every change.
- `savedRevision`: Revision corresponding to the last confirmed write to disk.
- `state`: Current lifecycle state (`CLEAN`, `DIRTY`, `SAVING`, `SAVE_ERROR`, `EXTERNAL_CHANGE`).
- `diskHash`: SHA-256 hash representing the persisted state on disk.

### Revision-Aware Save Flow
1. User requests save (`Ctrl+S` or toolbar).
2. `SaveCoordinator` captures a snapshot of current `revision` and `content`.
3. Document is flagged as `SAVING`.
4. `FileSystemService` sends content and `expectedHash` to Rust backend or virtual storage.
5. If another program altered the file on disk during editing, the write is aborted with `EXTERNAL_MODIFICATION` error, protecting user content from being silently overwritten.
6. Upon successful write:
   - If `doc.revision === capturedRevision`, state becomes `CLEAN`.
   - If user continued typing while the disk write was in flight (`doc.revision > capturedRevision`), the document properly remains `DIRTY`!

---

## 3. Atomic Safe-Write Protocol

Directly overwriting existing files risks truncating or corrupting user drafts during unexpected process termination, disk failures, or power loss. DevspireHub implements a safe atomic replace strategy:

1. **Path Validation:** Checks for directory traversal attempts (`..`).
2. **Directory Verification:** Ensures the target folder exists.
3. **Temporary Write:** Creates an adjacent temporary file (`.tmp-save-<timestamp>`).
4. **Buffer Flush:** Flushes content to disk storage (`flush()`).
5. **Atomic Rename:** Renames the temporary file to the destination path using the operating system's atomic filesystem replacement primitive.
6. **Error Cleanup:** If any step fails, the temporary file is removed and the original file remains intact.

---

## 4. Markdown Security Pipeline

Rendering user-provided Markdown or pasted snippets in a desktop webview presents XSS risks. The rendering pipeline strictly sanitizes all markup:

$$\text{Markdown Source} \longrightarrow \text{Marked (GFM AST)} \longrightarrow \text{Preprocessor (Wiki-links)} \longrightarrow \text{DOMPurify Sanitization} \longrightarrow \text{Safe Preview DOM}$$

- **Script Neutralization:** `<script>` tags, inline event attributes (`onload`, `onerror`, `onclick`), and `javascript:` URIs are unconditionally stripped.
- **CSP Enforcement:** Tauri's Content Security Policy forbids inline scripts, object tags, and unauthorized network connections:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self'`
- **Allowed Attributes:** Only safe formatting attributes (`class`, `style`, `href`, `data-wiki-target`) are permitted for rich telemetry metrics and technical layouts.

---

## 5. Crash Recovery & Snapshot Journaling

The `CrashRecoveryManager` maintains a write-ahead journal in browser/local storage for dirty documents. 
- On every edit, an entry with the document's timestamp, path, and content is recorded.
- When saved or cleanly closed, the entry is pruned.
- If the application is terminated abruptly, the presence of entries in the journal enables immediate recovery of unsaved drafts upon next launch.

---

## 6. Document Revision History & Restore Engine (Release 0.6)

Release 0.6 introduces content-addressed revision history, side-by-side visual diffs, and safe preview-first restoration:

```text
┌─────────────────────────────────────────────────────────────────┐
│              User Trigger (⌘H or Tabs Action)                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     HistoryPanelComponent                       │
│    - Browse chronological checkpoints & source badges           │
│    - Select any 2 revisions for side-by-side diff               │
│    - Click "Preview Restore" to inspect changes against buffer  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                      RestoreCoordinator                         │
│  - Invariant 2: Preview Isolation (0 mutations to buffer/disk)  │
│  - Invariant 4: Stale Restore Rejection (guards concurrent edit)│
│  - Invariant 6: Explicit Dirty Conflict Resolution             │
│  - Invariant 1: History Non-Mutation (appends 'restore' snapshot│
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    RevisionHistoryStore                         │
│  - Content-addressed deduplication: blob:<hash>                 │
│  - Per-document metadata index: index:<key>                     │
│  - FIFO 50-entry eviction with active preview pinning           │
│  - FNV-1a Hash Integrity verification on read (Invariant 5)     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Integrity Invariants
1. **Invariant 1 (History Non-Mutation):** Existing revision history snapshots are immutable and append-only. Restoring a revision appends a new snapshot with `source: 'restore'`.
2. **Invariant 2 (Preview Isolation):** Generating a restore preview is strictly read-only. It never mutates the active document, CodeMirror editor state, or disk file.
3. **Invariant 3 (Explicit Restore Only):** No automated or background rollbacks. Restores require explicit user confirmation.
4. **Invariant 4 (Stale Restore Rejection):** If a user edits the document while a restore preview is open, the restore is rejected with `STALE_RESTORE`.
5. **Invariant 5 (Hash Integrity Verification):** Content blobs are verified against their content hash on retrieval; mismatched content throws `CORRUPT_HISTORY`.
6. **Invariant 6 (No Silent Overwrites):** Unsaved working changes generate a `RESTORE_CONFLICT` requiring explicit confirmation.
7. **Invariant 8 (Zero Secret Leakage):** All summaries, diff lines, and audit events are strictly sanitized against credential leakage and XSS.

---

## 7. Append-Only Durable Audit Logging (Release 0.6)

The `AuditLogService` persists a chronological audit trail (`devspirehub:audit_log:v1`) capped at 500 events across local and remote operations:
- **Tracked Actions:** `OPEN`, `SAVE`, `RESTORE`, `EXPORT`, `CLOSE`, `REMOTE_REFRESH`, `PUBLISH_ATTEMPT`.
- **Honest Outcomes:** `SUCCESS`, `FAILURE`, `CANCELLED`, `UNCERTAIN` (Invariant 10).
- **Zero Leakage:** Recursive redaction of GitHub PATs, OAuth bearer tokens, and secrets across all payload strings and nested metadata objects.

---

## 8. Advanced Documentation QA & CI Verification (Release 0.7)

Release 0.7 transforms DevspireHub into a workspace-wide Documentation QA and CI verification engine for multi-folder technical repositories, handbooks, and open-source documentation.

```text
┌─────────────────────────────────────────────────────────────────┐
│                      ProjectQaCoordinator                       │
│  - Invariant 1: Source Immutability (Read-only scans)           │
│  - Invariant 3: Deterministic Reports & Ordering                │
│  - Invariant 8: Single Parser Authority (MarkdownPipeline)      │
│  - Invariant 9: Failure Containment (Error resilience)          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ProjectLinkChecker│   │NavigationChecker │   │ CoverageReporter │
│- Local File Links│   │- SUMMARY.md/nav  │   │- Required Files  │
│- Cross-Doc Anchor│   │- Dangling Entries│   │- Required Heading│
│- Local Images    │   │- Duplicate Links │   │- Orphan Documents│
│- SSRF Protection │   │- Unlisted Pages  │   │- Empty Docs/No H1│
└──────────────────┘   └──────────────────┘   └──────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        QaReportWriter                           │
│  - Schema: qa-report-v1 (JSON, Markdown, Console, Annotations)  │
│  - Invariant 6: Honest Exit Codes (0: Pass, 1: Block, 2: Error) │
│  - Desktop UI: ProjectQaModalComponent with filterable findings │
│  - Headless CLI: node scripts/run-docs-qa.js (--profile, etc.)  │
└─────────────────────────────────────────────────────────────────┘
```

### Validation Profiles & Invariants
- **Profiles:** `default`, `strict`, `docs-repo`, `ci-blocking`.
- **Configuration:** Project overrides declared in `.devspirehub/qa.json` (max 64KB, fail-closed on unknown rules or syntax errors).
- **SSRF Guard:** Remote URL checks are opt-in only and block private/loopback IP subnets (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`, `::1`).
- **Traversal Guard:** Path traversal attempts (`../`) escaping the workspace root immediately emit blocking `RULE_PATH_TRAVERSAL` errors.


