# DevspireHub Markdown Studio — Release 0.6 Architecture Specification
## Document Revision History, Side-by-Side Diffs, Change Summaries, Restore Previews, and Audit Records

**Classification:** Reliability-sensitive & security-critical feature release  
**Release:** v0.6.0  
**Scope:** Local & Remote Document Revision History, Content-Addressed History Store, Deterministic Change Summaries, Secure Restore Previews & Application, Durable Audit Logging, Side-by-Side Diffing.

---

## 1. Existing Architecture & Baseline Findings

### 1.1 Baseline Subsystem Classification
- **DocumentStateManager:** `WORKING` (`id`, `path`, `content`, `revision`, `savedRevision`, `state`, `diskHash`).
- **SaveCoordinator:** `WORKING` (Atomic write, revision-aware save flow, `inFlightSaves` concurrency protection).
- **CrashRecoveryManager:** `WORKING` (Write-ahead journal in localStorage for dirty unsaved drafts).
  - *Architectural Relationship:* Crash recovery handles uncommitted/dirty work in progress; Revision History handles committed/checkpointed states (saves, restores, explicit checkpoints, publishes). These stores are distinct and decoupled.
- **RevisionComparisonService & computeLineDiff:** `WORKING` (Line-by-line diff computation with `added`, `removed`, `unchanged` classifications).
- **DiffModalComponent:** `WORKING` (Three-way remote comparison modal with line numbering, badge classification, and HTML escaping).
- **PublicationCoordinator & PublicationRecordService:** `WORKING` (Release 0.5 publication workflow, verification, and audit records).
- **Revision History Store:** `MISSING` (To be implemented in Release 0.6).
- **Change Summary Engine:** `MISSING` (To be implemented in Release 0.6).
- **Audit Log Service:** `MISSING` (To be implemented in Release 0.6).
- **Restore Coordinator & Preview:** `MISSING` (To be implemented in Release 0.6).

---

## 2. Component Architecture & Data Flow

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                           Layer 1: Presentation                           │
│  (HistoryPanelModal, HistoryDiffModal, CommandPalette, Toolbar, Tabs)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ EventBus / Intent Dispatches
┌─────────────────────────────────────▼─────────────────────────────────────┐
│                         Layer 2: Application Core                         │
│  ┌─────────────────────────┐               ┌───────────────────────────┐  │
│  │   HistoryCoordinator    │               │    RestoreCoordinator     │  │
│  │  (Snapshot checkpoints, │               │  (Preview isolation,      │  │
│  │   save integration)     │               │   stale revision checks,  │  │
│  └────────────┬────────────┘               │   safe apply)             │  │
│               │                            └─────────────┬─────────────┘  │
└───────────────┼──────────────────────────────────────────┼────────────────┘
                │ Core APIs                                │ Core APIs
┌───────────────▼──────────────────────────────────────────▼────────────────┐
│                           Layer 3: Domain Services                        │
│  ┌──────────────────────────┐  ┌───────────────────────────────────────┐  │
│  │   RevisionHistoryStore   │  │          ChangeSummaryService         │  │
│  │ (Content-addressed blobs,│  │    (Deterministic diff summaries,     │  │
│  │  document index, eviction│  │     secret/credential redaction)      │  │
│  └────────────┬─────────────┘  └───────────────────────────────────────┘  │
│               │                                                           │
│  ┌────────────▼─────────────┐  ┌───────────────────────────────────────┐  │
│  │      AuditLogService     │  │         computeLineDiff Engine        │  │
│  │  (Durable append-only ops│  │     (Shared line diffs for history    │  │
│  │   events, zero secrets)  │  │      A<->B and restore previews)      │  │
│  └──────────────────────────┘  └───────────────────────────────────────┘  │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ Storage Boundary
┌─────────────────────────────────────▼─────────────────────────────────────┐
│                    Layer 4: Storage & Desktop Runtime                     │
│  (LocalStorage / AppData Store / Workspace Boundary Sanitizer)            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Schemas & Contracts

### 3.1 Revision Snapshot Schema
```typescript
interface RevisionSnapshot {
  historyId: string;          // Unique identifier: "hist_<timestamp>_<random>"
  documentKey: string;        // Canonical path (e.g. "specs/system.md") or session id ("doc-...")
  createdAt: string;          // ISO 8601 timestamp
  source: 'local_save' | 'autosnapshot' | 'restore' | 'publish' | 'remote_refresh';
  revisionNumber: number;     // Monotonic per-document sequence number (1, 2, 3...)
  summary: string;            // Human-readable change summary (e.g. "Saved to disk (+5 / -2 lines)")
  contentHash: string;        // Deterministic content hash (FNV-1a / SHA-256)
  contentRef: string;         // Hash pointer to content-addressed blob store
  metadata: {
    linesCount: number;
    charCount: number;
    author?: string;
    remoteCommitSha?: string;
    restoredFromHistoryId?: string;
  };
}
```

### 3.2 Audit Event Schema
```typescript
interface AuditEvent {
  auditId: string;            // Unique identifier: "aud_<timestamp>_<random>"
  timestamp: string;          // ISO 8601 timestamp
  documentKey: string;        // Canonical document path or ID
  action: 'OPEN' | 'SAVE' | 'RESTORE' | 'EXPORT' | 'CLOSE' | 'REMOTE_REFRESH' | 'PUBLISH_ATTEMPT';
  outcome: 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'UNCERTAIN';
  actor: string;              // Local user or "@username"
  contentHash?: string;       // Non-sensitive fingerprint
  summary: string;            // Redacted human-readable summary
  details?: Record<string, any>; // Redacted contextual details (never secrets!)
}
```

### 3.3 Restore Preview Snapshot Schema
```typescript
interface RestorePreviewSnapshot {
  previewId: string;
  targetHistoryId: string;
  documentId: string;
  documentKey: string;
  capturedWorkingRevision: number; // working doc revision at the time preview was opened
  workingContent: string;
  targetContent: string;
  targetContentHash: string;
  diff: Array<{ type: 'added' | 'removed' | 'unchanged', text: string, oldLineNo: number | null, newLineNo: number | null }>;
  createdAt: string;
}
```

---

## 4. Explicit Data-Integrity Invariants (Release 0.6)

1. **History Non-Mutation (Invariant 1):** Existing history blobs and index rows are immutable after creation. Corrections or reverts are written as new revision entries with `source: 'restore'`, never modifications of past records.
2. **Preview Isolation (Invariant 2):** Opening a restore preview or history diff modal never alters `doc.content`, `doc.revision`, or `doc.state`.
3. **Explicit Restore Only (Invariant 3):** Content restoration strictly requires explicit user confirmation. No background or automatic restore is permitted.
4. **Stale Restore Rejection (Invariant 4):** If the working document's `revision` changes between restore preview generation and confirmation, the restore application is rejected (`ErrorCode.STALE_RESTORE`), requiring a fresh preview.
5. **Hash Integrity (Invariant 5):** The stored `contentHash` must match the recomputed hash of the retrieved content. Any mismatch marks the snapshot corrupt, blocks restoration, and surfaces an honest error.
6. **No Silent Disk Overwrite (Invariant 6):** Restoring a document that is currently in `DIRTY` state or `EXTERNAL_CHANGE` state prompts the user with explicit conflict options (Save working draft first, Discard working draft and restore, or Cancel).
7. **Audit Completeness (Invariant 7):** Every successful save, restore application, remote refresh classification change, and publication outcome records an audit log event.
8. **Zero Secret Leakage (Invariant 8):** History summaries, audit logs, and diagnostic messages must never contain raw GitHub tokens, credentials, or Bearer authentication headers (strictly enforced via `redactSensitiveData`).
9. **Workspace Boundary (Invariant 9):** Path resolution for document history keys strictly enforces workspace boundaries and rejects directory traversal sequences (`..`).
10. **Remote Honesty (Invariant 10):** Remote-related history and audit records must accurately reflect verified outcomes from Release 0.5. Uncertain or ambiguous outcomes are logged as `UNCERTAIN`.
11. **Local/Remote Segregation (Invariant 11):** Restoring a local revision in a remote-backed draft updates the local working draft only; it never performs remote GitHub commits until the user explicitly initiates publication via Release 0.5.
12. **Failure Containment (Invariant 12):** Storage failures, corruption in history indices, or storage quota limits fail closed gracefully without disrupting the active editor view or losing the working buffer.

---

## 5. Storage Model & Eviction Policy

- **Content-Addressed Blobs:** Content strings are keyed by their deterministic hash (`devspirehub:history:blob:<hash>`). Multiple snapshots with identical contents share a single storage entry.
- **Per-Document Indexing:** Snapshots are indexed by `documentKey` (`devspirehub:history:index:<documentKey>`).
- **Configurable Cap & Eviction:** The history store maintains up to `MAX_ENTRIES_PER_DOC = 50` snapshots per document. When the cap is reached, the oldest snapshot is evicted. Crucially, a snapshot currently pinned by an active in-flight restore preview is never evicted.
- **Untitled Document Key Migration:** When an untitled document (`doc.id` key) is saved to disk for the first time with a canonical path, its existing history entries are automatically re-keyed to the canonical path, preserving the full editing lineage.

---

## 6. Threat Model & Security Mitigations

| Threat Vector | Potential Impact | Release 0.6 Mitigation |
|:---|:---|:---|
| **Diff XSS Injection** | Malicious Markdown containing `<script>` or event handlers executed in diff view | All text lines rendered in diffs and history views are strictly sanitized via `escapeHtml()`. No raw `innerHTML` of user content. |
| **Credential Leakage** | Tokens or secrets persisted into audit logs or summaries | `redactSensitiveData` filters all summaries, commit messages, and audit payloads before persistence. |
| **Corrupt Snapshot Injection** | Tampered or truncated history restored into document | Hash integrity check (`contentHash`) verifies content before any restore operation. Mismatched hashes abort restore. |
| **Silent Data Overwrite** | User unintentionally loses uncommitted edits during restore | Restore previews require explicit confirm. If document is dirty, user is warned before working content is replaced. |
| **Path Traversal** | Accessing files outside the workspace via document key manipulation | `documentKey` sanitization rejects leading slashes, `..`, and invalid OS path characters. |

---

## 7. Release-Blocking Quality Gates

- **Gate A (Compilation & Build):** `npm run build` succeeds with zero errors.
- **Gate B (Regression Test Suite):** `npm test` runs all prior Release 0.1–0.5 test suites (198 tests) with 100% green status.
- **Gate C (History & Audit Unit Tests):** All new unit tests for `RevisionHistoryStore`, `ChangeSummaryService`, `AuditLogService`, and `RestoreCoordinator` pass.
- **Gate D (Data-Integrity Invariant Verification):** Invariants 1–12 explicitly tested and passing.
- **Gate E (Security & XSS Audit):** HTML escaping and credential redaction tests pass.
- **Gate F (UI Integration & Manual Smoke Checklist):** History modal opens from toolbar and command palette; restore preview displays side-by-side diff; confirm restore updates editor content.
- **Gate G (Documentation & Version Bump):** Version bumped to `0.6.0` in `package.json`; `docs/RELEASE_0.6_SPEC.md` and `docs/RELEASE_0.6_REPORT.md` committed.
