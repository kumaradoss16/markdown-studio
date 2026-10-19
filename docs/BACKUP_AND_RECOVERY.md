# Backup & Recovery Architecture

DevspireHub Markdown Studio is engineered with an **offline-first, zero-data-loss architecture**. This guide covers the journaling mechanism, storage locations, snapshot lifecycle, and step-by-step recovery procedures for uncommitted changes following an unexpected system shutdown or application crash.

---

## 1. Storage & Persistence Architecture

DevspireHub Markdown Studio operates completely offline. All document state, workspace graphs, metadata, and crash recovery snapshots are persisted locally on the client machine.

### Operating System Storage Locations

| OS | Application Config & Recovery Store | Cache & Log Output |
|---|---|---|
| **Windows** | `%APPDATA%\devspirehub-markdown-studio\` <br> `IndexedDB` / `localStorage` under WebView2 / Tauri container | `%LOCALAPPDATA%\devspirehub-markdown-studio\logs\` |
| **macOS** | `~/Library/Application Support/devspirehub-markdown-studio/` | `~/Library/Logs/devspirehub-markdown-studio/` |
| **Linux** | `~/.config/devspirehub-markdown-studio/` | `~/.cache/devspirehub-markdown-studio/logs/` |

---

## 2. Crash Recovery & Write-Ahead Journaling

To prevent data loss during power outages, process termination, or hardware faults, Markdown Studio employs continuous write-ahead journaling:

### Continuous Background Journaling (3-Second Heartbeat)
- Every **3 seconds**, `RecoveryManager` inspects active open documents managed by `DocumentStateManager`.
- If any active document buffer contains unsaved changes (`isDirty === true`), an atomic snapshot of that document is serialized into the local recovery store (`devspirehub:recovery:journal`).
- Snapshots include:
  - Document ID and workspace path
  - Full buffer text content
  - Cursor position and active selection range
  - Epoch timestamp and dirty state flags

### Non-Destructive Backup Retention
- When documents are successfully saved to disk, journals are gracefully cleared.
- However, the most recent recovery snapshot is preserved under `devspirehub:recovery:last_backup` to ensure that a disk write failure never obliterates the in-memory draft.

---

## 3. Post-Crash Recovery Procedure

When Markdown Studio starts up, `RecoveryManager` inspects the journal for uncommitted drafts. If an ungraceful shutdown occurred while edits were pending, the application prompts the user with the Recovery Banner:

```
[ Unsaved Changes Detected ]
Markdown Studio recovered 2 draft documents from a previous session.
[ Restore All Drafts ]   [ Dismiss & Keep Disk State ]
```

### Automatic Recovery Flow
1. **Launch Markdown Studio** after the crash or restart.
2. The Studio detects `devspirehub:recovery:journal`.
3. Click **Restore All Drafts** in the recovery prompt.
4. Each uncommitted file will be reopened in a dedicated editor tab with an `[Unsaved Recovery Draft]` badge.
5. Inspect the recovered content and press `Ctrl+S` (`Cmd+S`) to commit the changes to your workspace file.

### Manual Draft Recovery (Emergency Fallback)
If the UI is inaccessible or the application was uninstalled:
1. Open your browser / runtime developer tools (or inspect the local storage SQLite/IndexedDB store).
2. Retrieve the JSON string stored under the key:
   ```javascript
   localStorage.getItem('devspirehub:recovery:journal');
   ```
   Or check the historical backup key:
   ```javascript
   localStorage.getItem('devspirehub:recovery:last_backup');
   ```
3. Parse the JSON array to extract document paths and the raw text strings:
   ```json
   [
     {
       "id": "doc-workspace-spec.md",
       "path": "docs/spec.md",
       "content": "# Specification\n\nRecovered content...",
       "timestamp": 1773900000000
     }
   ]
   ```
4. Copy the `content` string directly back into your workspace Markdown files.

---

## 4. Best Practices for Document Protection

1. **Version Control Integration**: Maintain your workspace within a Git repository. DevspireHub Markdown Studio's revision history works harmoniously alongside Git.
2. **Periodic Workspace Backups**: Automated backup tools (e.g., Windows File History, macOS Time Machine, `rsync`) can safely snapshot the workspace directory at any time; Studio's transactional file writing ensures disk files are never left in a partially written state.
3. **Clean Workspace Shutdowns**: While the 3-second journaling minimizes loss to a maximum of 3 seconds of typing, explicitly saving files (`Ctrl+S` / `Cmd+S`) or closing tabs cleanly triggers standard disk write-through operations.
