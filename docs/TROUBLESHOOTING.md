# Troubleshooting & Operational Guide

This guide provides troubleshooting steps and diagnostic procedures for common operational issues encountered in MarkForge Markdown Studio.

---

## 1. Diagnostics & Sanitized Logs

Markdown Studio features an internal, privacy-preserving logging subsystem (`ErrorService`). All logs are automatically sanitized before display or export:
- Personal OS paths (e.g., `C:\Users\username\`, `/home/username/`) are converted to `[REDACTED_USER]`.
- Auth tokens, session cookies, and basic auth credentials (`https://user:pass@...`) are stripped.
- Raw document contents are excluded from telemetry and diagnostic bundles.

### Exporting Diagnostics
1. Open **Settings** (`Ctrl+,` or `Cmd+,`).
2. Navigate to **System & Diagnostics**.
3. Click **Export Sanitized Diagnostic Report**.
4. A clean JSON bundle containing runtime version, OS architecture, sanitized error traces, and feature flags will be saved to your downloads directory.

---

## 2. Graph View & Visualizer Issues

The Bi-Directional Link Graph relies on HTML5 Canvas and D3 force simulation.

### Issue: Graph View is Blank or Frozen
- **Cause**: Outdated graphics drivers or disabled hardware acceleration.
- **Resolution**:
  1. Open Studio Settings -> **Performance**.
  2. Toggle **Hardware Acceleration** off/on to force software canvas fallback.
  3. Reduce graph complexity: In the Graph View toolbar, enable **Hide Unresolved Nodes** and lower **Max Link Distance**.

### Issue: High CPU / Fan Spin When Graph View is Open
- **Cause**: Active force simulation on massive workspaces (>1,000 documents).
- **Resolution**:
  - MarkForge Markdown Studio implements **auto-cooling** (alpha decays to 0 after ~300 ticks). Once the graph settles, the simulation completely enters idle sleep.
  - If you are continuously dragging nodes, simulation remains active. Release the node to allow the graph to cool.

---

## 3. External Modifications & Git Conflict Markers

### Issue: "File Changed on Disk" Notification
- **Cause**: An external editor, background linter, or `git pull` updated a file while it was open in Markdown Studio.
- **Resolution**:
  - If the document in Studio has **no unsaved changes**, Studio automatically reloads the disk version cleanly.
  - If the document in Studio has **unsaved changes**, Studio prompts you with a conflict resolution dialog:
    - **Keep My In-Memory Changes**: Overwrite disk with the Studio editor buffer.
    - **Reload Disk Version**: Discard unsaved Studio edits and load the new file from disk.
    - **Compare Side-by-Side**: Open the internal Diff Viewer to inspect line-by-line differences before deciding.

### Issue: Git Conflict Markers Rendered in Preview
- If conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> branch`) appear in Markdown files, Studio renders them inside a high-visibility warning block to prevent accidental publication.
- Resolve the conflict in the editor and delete the marker lines.

---

## 4. Resetting Application State & Cache

If the application settings become corrupted or an unresponsive state is reached:

### Safe Cache Reset (Preserves Document Files)
1. Open your browser or desktop container Developer Tools (`Ctrl+Shift+I` or `F12`).
2. In the Console, run:
   ```javascript
   // Clear application settings and layout state
   localStorage.removeItem('devspirehub:theme');
   localStorage.removeItem('devspirehub:accent');
   localStorage.removeItem('devspirehub:settings');
   sessionStorage.clear();
   location.reload();
   ```
3. Your local Markdown files remain untouched on disk.

### Resetting Corrupted Workspace Indexes
If WikiLink indexing or workspace search shows stale or ghost files:
1. In the sidebar file explorer, right-click the root folder.
2. Select **Re-index Workspace**.
3. Studio will perform a clean AST scan of all `.md` files and reconstruct the link registry.

---

## 5. Security & Content Blocking

### Issue: External Images or Scripts Do Not Load
- **Cause**: MarkForge Markdown Studio enforces a **Strict Content Security Policy (CSP)** and blocks external network requests by default.
- **Resolution**:
  - Remote images: By default, remote `http://` / `https://` images may be blocked unless explicitly permitted in settings or stored locally in your workspace assets folder (`./assets/image.png`).
  - Scripts: Inline `<script>` execution and `javascript:` URLs are unconditionally prohibited in preview mode to prevent Cross-Site Scripting (XSS).
