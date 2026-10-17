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
