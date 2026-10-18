import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
import { workspaceManager } from '../../core/workspace-manager.js';
import { markdownService } from '../../services/markdown-service.js';
import { qualityChecker, DiagnosticSeverity } from '../../services/quality-checker.js';
import { tocGenerator } from '../../services/toc-generator.js';
import { exportEngine, ExportFormat } from '../../services/export-engine.js';
import { TEMPLATES } from '../../data/templates.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class DialogsComponent {
  constructor(container) {
    this.container = container;
    this.activeModal = null;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DIALOG_OPEN, (payload) => this.showDialog(payload));
    eventBus.on(AppEvents.NOTIFICATION, (payload) => this.showToast(payload));
  }

  showDialog(payload) {
    if (payload.type === 'confirm-close') {
      this.showConfirmClose(payload.docId, payload.docName);
    } else if (payload.type === 'save-as' || payload.type === 'new-file') {
      this.showFileInputDialog(payload);
    } else if (payload.type === 'new-folder') {
      this.showNewFolderDialog(payload);
    } else if (payload.type === 'rename') {
      this.showRenameDialog(payload);
    } else if (payload.type === 'delete-confirm') {
      this.showDeleteConfirmDialog(payload);
    } else if (payload.type === 'command-palette') {
      this.showCommandPalette();
    } else if (payload.type === 'export') {
      this.showExportDialog();
    } else if (payload.type === 'settings') {
      this.showSettingsDialog();
    } else if (payload.type === 'diagnostics') {
      this.showDiagnosticsDialog();
    } else if (payload.type === 'toc') {
      this.showTocDialog();
    } else if (payload.type === 'templates') {
      this.showTemplatesDialog();
    } else if (payload.type === 'version-history') {
      eventBus.emit(AppEvents.HISTORY_OPEN_REQUESTED, { docId: payload.docId });
    }
  }

  showConfirmClose(docId, docName) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">Unsaved Changes</div>
        <div class="modal-body">
          Do you want to save changes to <strong>${docName}</strong> before closing?<br>
          <span style="font-size: 11px; color: var(--color-text-muted);">Your changes will be permanently lost if you don't save them.</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogCancelBtn">Cancel</button>
          <button class="btn btn-danger" id="dialogDiscardBtn">Don't Save</button>
          <button class="btn btn-primary" id="dialogSaveBtn">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#dialogCancelBtn')?.addEventListener('click', () => {
      overlay.remove();
    });

    overlay.querySelector('#dialogDiscardBtn')?.addEventListener('click', () => {
      documentStateManager.closeDocument(docId, true);
      overlay.remove();
    });

    overlay.querySelector('#dialogSaveBtn')?.addEventListener('click', async () => {
      try {
        await saveCoordinator.save(docId);
        documentStateManager.closeDocument(docId, true);
        overlay.remove();
      } catch (err) {
        // Notification emitted by save coordinator
      }
    });
  }

  showFileInputDialog(payload) {
    const isNew = payload.type === 'new-file';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">${isNew ? 'New Document' : 'Save As'}</div>
        <div class="modal-body">
          <label style="display: block; font-size: 11px; margin-bottom: 6px; color: var(--color-text-secondary);">File Name / Relative Path</label>
          <input type="text" id="dialogFileNameInput" value="${payload.defaultName || 'Untitled.md'}" 
                 style="width: 100%; padding: 6px 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff; font-family: var(--font-editor); font-size: 12px; outline: none;" />
          <div id="dialogFileError" style="color: var(--color-accent-rose); font-size: 11px; margin-top: 6px; display: none;"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogFileCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogFileSubmitBtn">${isNew ? 'Create' : 'Save'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#dialogFileNameInput');
    const errorEl = overlay.querySelector('#dialogFileError');
    input.focus();
    input.select();

    const submit = async () => {
      const val = input.value.trim();
      if (!val) return;
      const cleanBase = val.replace(/\.md$/, '').split('/').pop();
      if (!workspaceManager.isValidFilename(cleanBase)) {
        if (errorEl) {
          errorEl.textContent = `Invalid filename "${val}". Cannot contain \\ / : * ? " < > | or Windows reserved names.`;
          errorEl.style.display = 'block';
        }
        return;
      }
      overlay.remove();

      try {
        if (isNew) {
          const fullPath = val.includes('/') ? val : `ExampleVault/${val}`;
          const initialText = payload.initialContent || '# ' + cleanBase;
          await workspaceManager.createFile(cleanBase, initialText, val.includes('/') ? val.substring(0, val.lastIndexOf('/')) : 'ExampleVault');
          documentStateManager.createDocument(cleanBase + '.md', initialText, fullPath);
        } else {
          const fullPath = val.includes('/') ? val : `ExampleVault/${val}`;
          await saveCoordinator.saveAs(payload.docId, fullPath);
        }
      } catch (err) {
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: err.message });
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') overlay.remove();
    });

    overlay.querySelector('#dialogFileCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dialogFileSubmitBtn')?.addEventListener('click', submit);
  }

  showNewFolderDialog(payload = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">New Folder</div>
        <div class="modal-body">
          <label style="display: block; font-size: 11px; margin-bottom: 6px; color: var(--color-text-secondary);">Folder Name</label>
          <input type="text" id="dialogFolderNameInput" placeholder="e.g. specs, guides, architecture" 
                 style="width: 100%; padding: 6px 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff; font-family: var(--font-editor); font-size: 12px; outline: none;" />
          <div id="dialogFolderError" style="color: var(--color-accent-rose); font-size: 11px; margin-top: 6px; display: none;"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogFolderCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogFolderSubmitBtn">Create Folder</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#dialogFolderNameInput');
    const errorEl = overlay.querySelector('#dialogFolderError');
    input.focus();

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      if (!workspaceManager.isValidFilename(val)) {
        if (errorEl) {
          errorEl.textContent = `Invalid folder name "${val}". Cannot contain \\ / : * ? " < > | or Windows reserved names.`;
          errorEl.style.display = 'block';
        }
        return;
      }

      try {
        const parentPath = payload.parentPath || 'ExampleVault';
        workspaceManager.createFolder(val, parentPath);
        overlay.remove();
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Folder "${val}" created.` });
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') overlay.remove();
    });

    overlay.querySelector('#dialogFolderCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dialogFolderSubmitBtn')?.addEventListener('click', submit);
  }

  showRenameDialog(payload = {}) {
    const currentName = (payload.name || payload.path || 'Untitled').replace(/\.md$/, '');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">Rename Item</div>
        <div class="modal-body">
          <label style="display: block; font-size: 11px; margin-bottom: 6px; color: var(--color-text-secondary);">New Name</label>
          <input type="text" id="dialogRenameInput" value="${currentName}" 
                 style="width: 100%; padding: 6px 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff; font-family: var(--font-editor); font-size: 12px; outline: none;" />
          <div id="dialogRenameError" style="color: var(--color-accent-rose); font-size: 11px; margin-top: 6px; display: none;"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogRenameCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogRenameSubmitBtn">Rename</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#dialogRenameInput');
    const errorEl = overlay.querySelector('#dialogRenameError');
    input.focus();
    input.select();

    const submit = async () => {
      const val = input.value.trim();
      if (!val || val === currentName) {
        overlay.remove();
        return;
      }
      const cleanName = val.replace(/\.md$/, '');
      if (!workspaceManager.isValidFilename(cleanName)) {
        if (errorEl) {
          errorEl.textContent = `Invalid filename "${val}". Cannot contain \\ / : * ? " < > | or Windows reserved names.`;
          errorEl.style.display = 'block';
        }
        return;
      }

      try {
        await workspaceManager.renameItem(payload.path, cleanName);
        overlay.remove();
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Renamed to "${cleanName}.md".` });
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') overlay.remove();
    });

    overlay.querySelector('#dialogRenameCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dialogRenameSubmitBtn')?.addEventListener('click', submit);
  }

  showDeleteConfirmDialog(payload = {}) {
    const itemName = payload.name || payload.path || 'this item';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">Delete Item</div>
        <div class="modal-body">
          Are you sure you want to permanently delete <strong>${itemName}</strong>?<br>
          <span style="font-size: 11px; color: var(--color-text-muted); display: block; margin-top: 6px;">This action cannot be undone and will remove the file from your workspace.</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogDeleteCancelBtn">Cancel</button>
          <button class="btn btn-danger" id="dialogDeleteConfirmBtn">Delete Permanently</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#dialogDeleteCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dialogDeleteConfirmBtn')?.addEventListener('click', async () => {
      try {
        await workspaceManager.deleteItem(payload.path);
        overlay.remove();
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Deleted "${itemName}".` });
      } catch (err) {
        overlay.remove();
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: `Failed to delete: ${err.message}` });
      }
    });
  }

  showCommandPalette() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 520px;">
        <div style="padding: 10px 14px; border-bottom: 1px solid var(--color-border-subtle); display: flex; align-items: center; gap: 8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="paletteSearch" placeholder="Type a command or search documents..." 
                 style="background: transparent; border: none; outline: none; color: #fff; font-size: 13px; width: 100%;" />
        </div>
        <div id="paletteItems" style="max-height: 320px; overflow-y: auto; padding: 6px 0;">
          <div class="sidebar-item" data-action="new-doc"><strong>New Document</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-text-muted);">⌘N</span></div>
          <div class="sidebar-item" data-action="templates"><strong>Technical Documentation Templates...</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-purple);">Templates</span></div>
          <div class="sidebar-item" data-action="manage-toc"><strong>Insert / Update Table of Contents (TOC)</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-cyan);">📑 TOC</span></div>
          <div class="sidebar-item" data-action="view-diagnostics"><strong>Quality Diagnostics &amp; Linting</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-emerald);">🛡️ Check</span></div>
          <div class="sidebar-item" data-action="version-history"><strong>Version History &amp; Revisions...</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-cyan);">⌘H</span></div>
          <div class="sidebar-item" data-action="save-doc"><strong>Save Active Document</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-text-muted);">⌘S</span></div>
          <div class="sidebar-item" data-action="save-as"><strong>Save As...</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-text-muted);">⇧⌘S</span></div>
          <div class="sidebar-item" data-action="toggle-split"><strong>Toggle Dual Split Mode</strong></div>
          <div class="sidebar-item" data-action="toggle-sidebar"><strong>Toggle Sidebar</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-text-muted);">⌘B</span></div>
          <div class="sidebar-item" data-action="export-menu"><strong>Export Document (HTML / PDF / MD)...</strong></div>
          <div class="sidebar-item" data-action="open-settings"><strong>Settings &amp; Theming...</strong></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const search = overlay.querySelector('#paletteSearch');
    search.focus();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelectorAll('#paletteItems .sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        overlay.remove();
        this.executeCommand(action);
      });
    });

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.remove();
    });
  }

  executeCommand(action) {
    const active = documentStateManager.getActiveDocument();
    switch (action) {
      case 'new-doc':
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file' });
        break;
      case 'templates':
        this.showTemplatesDialog();
        break;
      case 'manage-toc':
        this.showTocDialog();
        break;
      case 'view-diagnostics':
        this.showDiagnosticsDialog();
        break;
      case 'version-history':
        if (active) eventBus.emit(AppEvents.HISTORY_OPEN_REQUESTED, { docId: active.id });
        break;
      case 'save-doc':
        if (active) saveCoordinator.save(active.id);
        break;
      case 'save-as':
        if (active) eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'save-as', docId: active.id, defaultName: active.name });
        break;
      case 'toggle-sidebar':
        document.querySelector('.workspace-sidebar')?.classList.toggle('collapsed');
        break;
      case 'toggle-split':
        eventBus.emit(AppEvents.VIEW_MODE_CHANGED, 'DUAL SPLIT');
        break;
      case 'export-menu':
        this.showExportDialog();
        break;
      case 'open-settings':
        this.showSettingsDialog();
        break;
    }
  }

  showDiagnosticsDialog() {
    const activeDoc = documentStateManager.getActiveDocument();
    if (!activeDoc) {
      this.showToast({ type: 'warning', message: 'No active document to inspect.' });
      return;
    }

    const diags = qualityChecker.check(activeDoc);
    const summary = qualityChecker.summarize(diags);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let currentFilter = 'ALL';

    const renderList = () => {
      const filtered = diags.filter(d => {
        if (currentFilter === 'ERROR') return d.severity === DiagnosticSeverity.ERROR;
        if (currentFilter === 'WARNING') return d.severity === DiagnosticSeverity.WARNING;
        if (currentFilter === 'INFO') return d.severity === DiagnosticSeverity.INFO;
        return true;
      });

      if (filtered.length === 0) {
        return `<div style="padding: 30px; text-align: center; color: var(--color-text-muted); font-size: 13px;">
          🎉 No issues detected in this document. All quality gates pass!
        </div>`;
      }

      return filtered.map(d => {
        const isErr = d.severity === DiagnosticSeverity.ERROR;
        const color = isErr ? 'var(--color-accent-rose)' : (d.severity === DiagnosticSeverity.WARNING ? '#fbbf24' : 'var(--color-accent-cyan)');
        const badgeBg = isErr ? 'rgba(244, 63, 94, 0.12)' : 'rgba(251, 191, 36, 0.12)';

        return `
          <div class="diag-card" data-line="${d.line}" data-col="${d.column}" style="padding: 10px 14px; margin-bottom: 8px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface-base); cursor: pointer; transition: border-color 0.15s;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 10px; font-weight: 700; color: ${color}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px;">${d.severity}</span>
              <span style="font-family: var(--font-editor); font-size: 11px; color: var(--color-accent-cyan);">Line ${d.line}:${d.column}</span>
            </div>
            <div style="font-size: 12.5px; color: #fff; margin-bottom: 4px;">${d.message}</div>
            <div style="font-size: 10.5px; font-family: var(--font-editor); color: var(--color-text-muted); display: flex; justify-content: space-between;">
              <span>Rule: ${d.ruleId}</span>
              <span style="color: var(--color-accent-teal);">Click to jump in editor →</span>
            </div>
          </div>
        `;
      }).join('');
    };

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 620px; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between;">
          <span>Quality Diagnostics — ${activeDoc.name}</span>
          <span style="font-size: 11px; font-weight: normal; color: var(--color-text-muted);">Revision ${activeDoc.revision}</span>
        </div>
        
        <div style="padding: 10px 16px; border-bottom: 1px solid var(--color-border-subtle); display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.15);">
          <button class="btn btn-secondary filter-btn ${currentFilter === 'ALL' ? 'active' : ''}" data-filter="ALL" style="font-size: 11px; padding: 4px 10px;">All (${summary.total})</button>
          <button class="btn btn-secondary filter-btn" data-filter="ERROR" style="font-size: 11px; padding: 4px 10px; color: var(--color-accent-rose);">Errors (${summary.errors})</button>
          <button class="btn btn-secondary filter-btn" data-filter="WARNING" style="font-size: 11px; padding: 4px 10px; color: #fbbf24;">Warnings (${summary.warnings})</button>
        </div>

        <div id="diagListContainer" style="padding: 14px 16px; overflow-y: auto; flex: 1;">
          ${renderList()}
        </div>

        <div class="modal-actions" style="border-top: 1px solid var(--color-border-subtle);">
          <button class="btn btn-secondary" id="dialogDiagCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const container = overlay.querySelector('#diagListContainer');

    const attachCardClicks = () => {
      container.querySelectorAll('.diag-card').forEach(card => {
        card.addEventListener('click', () => {
          const line = parseInt(card.getAttribute('data-line'), 10);
          const col = parseInt(card.getAttribute('data-col'), 10);
          overlay.remove();
          eventBus.emit(AppEvents.EDITOR_JUMP_TO_LINE, { line, col });
        });
      });
    };

    attachCardClicks();

    overlay.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        container.innerHTML = renderList();
        attachCardClicks();
      });
    });

    overlay.querySelector('#dialogDiagCloseBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  showTocDialog() {
    const activeDoc = documentStateManager.getActiveDocument();
    if (!activeDoc) {
      this.showToast({ type: 'warning', message: 'No active document to generate TOC.' });
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let minLevel = 2;
    let maxLevel = 4;
    let includeTitle = false;
    let ordered = false;

    const generatePreview = () => {
      try {
        const proposal = tocGenerator.createProposal(activeDoc, {
          minLevel,
          maxLevel,
          includeTitle,
          ordered
        });
        return proposal;
      } catch (err) {
        return { error: err.message };
      }
    };

    let proposal = generatePreview();

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 580px;">
        <div class="modal-header">
          <span>Table of Contents (TOC) Generator</span>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
          <p style="font-size: 12px; color: var(--color-text-secondary); margin: 0;">
            Generates a deterministic Table of Contents inside managed markers (<code><!-- DEVSPIREHUB_TOC_* --></code>), preserving all surrounding text byte-for-byte.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Min Heading Level</label>
              <select id="tocMinLevel" style="width: 100%; padding: 6px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff;">
                <option value="1">H1 (Title)</option>
                <option value="2" selected>H2 (Section)</option>
                <option value="3">H3 (Sub-section)</option>
              </select>
            </div>
            <div>
              <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Max Heading Level</label>
              <select id="tocMaxLevel" style="width: 100%; padding: 6px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff;">
                <option value="3">H3</option>
                <option value="4" selected>H4 (Default)</option>
                <option value="5">H5</option>
                <option value="6">H6</option>
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 16px; align-items: center; font-size: 12px; color: var(--color-text-primary);">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="tocIncludeTitle" />
              <span>Include "## Table of Contents" header</span>
            </label>
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="tocOrdered" />
              <span>Numbered List (1. 2. 3.)</span>
            </label>
          </div>

          <div>
            <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">TOC Proposal Preview</label>
            <pre id="tocPreviewBox" style="background: var(--color-surface-base); border: 1px solid var(--color-border-subtle); padding: 10px; border-radius: var(--radius-sm); font-size: 11px; max-height: 180px; overflow-y: auto; color: var(--color-accent-cyan); white-space: pre-wrap; font-family: var(--font-editor);"></pre>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogTocCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogTocApplyBtn">${proposal.hasExistingToc ? 'Update Existing TOC' : 'Insert Managed TOC'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const previewBox = overlay.querySelector('#tocPreviewBox');
    const updatePreview = () => {
      proposal = generatePreview();
      if (proposal.error) {
        previewBox.textContent = `Error: ${proposal.error}`;
        previewBox.style.color = 'var(--color-accent-rose)';
      } else {
        previewBox.textContent = proposal.generatedToc;
        previewBox.style.color = 'var(--color-accent-cyan)';
      }
    };

    updatePreview();

    overlay.querySelector('#tocMinLevel').addEventListener('change', (e) => {
      minLevel = parseInt(e.target.value, 10);
      updatePreview();
    });
    overlay.querySelector('#tocMaxLevel').addEventListener('change', (e) => {
      maxLevel = parseInt(e.target.value, 10);
      updatePreview();
    });
    overlay.querySelector('#tocIncludeTitle').addEventListener('change', (e) => {
      includeTitle = e.target.checked;
      updatePreview();
    });
    overlay.querySelector('#tocOrdered').addEventListener('change', (e) => {
      ordered = e.target.checked;
      updatePreview();
    });

    overlay.querySelector('#dialogTocCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#dialogTocApplyBtn')?.addEventListener('click', () => {
      if (proposal.error) {
        this.showToast({ type: 'danger', message: proposal.error });
        return;
      }
      try {
        const currentDoc = documentStateManager.getActiveDocument();
        const { updatedContent } = tocGenerator.applyProposal(currentDoc, proposal);
        documentStateManager.updateContent(currentDoc.id, updatedContent);
        overlay.remove();
        this.showToast({
          type: 'success',
          message: proposal.hasExistingToc ? 'Table of Contents updated.' : 'Managed Table of Contents inserted.'
        });
      } catch (err) {
        this.showToast({ type: 'danger', message: `TOC operation failed: ${err.message}` });
      }
    });
  }

  showTemplatesDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let selectedTemplate = TEMPLATES[0];

    const renderTemplateList = () => {
      return TEMPLATES.map(t => {
        const isSel = t.id === selectedTemplate.id;
        return `
          <div class="template-item-card" data-tid="${t.id}" style="padding: 10px 12px; margin-bottom: 6px; border: 1px solid ${isSel ? 'var(--color-accent-purple)' : 'var(--color-border-subtle)'}; background: ${isSel ? 'rgba(168, 85, 247, 0.08)' : 'var(--color-surface-base)'}; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s;">
            <div style="font-weight: 600; font-size: 12.5px; color: ${isSel ? 'var(--color-accent-purple)' : '#fff'};">${t.name}</div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${t.description}</div>
            <div style="font-size: 10px; font-family: var(--font-editor); color: var(--color-accent-cyan); margin-top: 4px;">Default: ${t.filename}</div>
          </div>
        `;
      }).join('');
    };

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 780px; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="modal-header">Technical Documentation Templates</div>
        <div class="modal-body" style="display: flex; gap: 16px; flex: 1; overflow: hidden; padding: 14px 16px;">
          <!-- List Column -->
          <div style="width: 280px; display: flex; flex-direction: column; overflow-y: auto;" id="templateListCol">
            ${renderTemplateList()}
          </div>
          <!-- Preview Column -->
          <div style="flex: 1; display: flex; flex-direction: column; background: var(--color-surface-base); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); overflow: hidden;">
            <div style="padding: 8px 12px; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--color-border-subtle); font-size: 11px; font-family: var(--font-editor); color: var(--color-text-muted);" id="templatePreviewHeader">
              Preview: ${selectedTemplate.filename}
            </div>
            <pre style="flex: 1; margin: 0; padding: 12px; font-family: var(--font-editor); font-size: 11px; color: var(--color-text-primary); overflow: auto; white-space: pre-wrap;" id="templatePreviewContent">${selectedTemplate.content}</pre>
          </div>
        </div>

        <div class="modal-actions" style="border-top: 1px solid var(--color-border-subtle);">
          <button class="btn btn-secondary" id="dialogTemplateCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogTemplateUseBtn">Create Document from Template</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const listCol = overlay.querySelector('#templateListCol');
    const headerEl = overlay.querySelector('#templatePreviewHeader');
    const contentEl = overlay.querySelector('#templatePreviewContent');

    const updateSelection = (t) => {
      selectedTemplate = t;
      listCol.innerHTML = renderTemplateList();
      headerEl.textContent = `Preview: ${t.filename}`;
      contentEl.textContent = t.content;
      attachListEvents();
    };

    const attachListEvents = () => {
      listCol.querySelectorAll('.template-item-card').forEach(card => {
        card.addEventListener('click', () => {
          const tid = card.getAttribute('data-tid');
          const t = TEMPLATES.find(x => x.id === tid);
          if (t) updateSelection(t);
        });
      });
    };

    attachListEvents();

    overlay.querySelector('#dialogTemplateCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#dialogTemplateUseBtn')?.addEventListener('click', () => {
      overlay.remove();
      this.showFileInputDialog({
        type: 'new-file',
        defaultName: selectedTemplate.filename,
        initialContent: selectedTemplate.content
      });
    });
  }

  showExportDialog() {
    const activeDoc = documentStateManager.getActiveDocument();
    if (!activeDoc) {
      this.showToast({ type: 'warning', message: 'No active document to export.' });
      return;
    }

    const docName = activeDoc.name ? activeDoc.name.replace(/\.md$/i, '') : 'Document';
    const preflight = exportEngine.preflightCheck(activeDoc);
    const hasErrors = preflight.hasBlockingErrors;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let embedImages = true;

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 540px;">
        <div class="modal-header">
          <span>Export "${activeDoc.name}"</span>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
          ${hasErrors ? `
            <div style="padding: 10px 12px; background: rgba(244, 63, 94, 0.12); border: 1px solid var(--color-accent-rose); border-radius: var(--radius-sm); font-size: 11.5px; color: #fff;">
              <div style="font-weight: 700; color: var(--color-accent-rose); margin-bottom: 2px;">⚠️ Pre-flight Quality Gate Notice</div>
              Found <strong>${preflight.summary.errors} error(s)</strong> that may affect export completeness (broken links or unclosed blocks).
              <div style="margin-top: 6px;">
                <button class="btn btn-secondary" id="exportInspectDiagsBtn" style="font-size: 10.5px; padding: 2px 8px;">Inspect Diagnostics</button>
              </div>
            </div>
          ` : `
            <div style="padding: 8px 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--color-accent-emerald); border-radius: var(--radius-sm); font-size: 11.5px; color: var(--color-accent-emerald);">
              ✅ Pre-flight validation passed. Zero blocking errors found.
            </div>
          `}

          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-primary);">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="exportEmbedImages" ${embedImages ? 'checked' : ''} />
              <span>Embed Local Images as Base64 (Self-Contained)</span>
            </label>
          </div>
          
          <div class="export-option-card" id="exportHtmlBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-cyan); font-size: 13px;">🌐 Standalone HTML Document (.html)</strong>
              <span class="badge" style="font-size: 10px; background: rgba(0, 229, 255, 0.1); color: var(--color-accent-cyan); padding: 2px 6px; border-radius: 4px;">Styled &amp; Offline</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Self-contained HTML with embedded styling, typography, deterministic anchors, and GFM tables.
            </div>
          </div>

          <div class="export-option-card" id="exportMdBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-emerald); font-size: 13px;">📄 Clean Raw Markdown (.md)</strong>
              <span class="badge" style="font-size: 10px; background: rgba(16, 185, 129, 0.1); color: var(--color-accent-emerald); padding: 2px 6px; border-radius: 4px;">Source</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Exports exact Markdown source text with preserved metadata and formatting.
            </div>
          </div>

          <div class="export-option-card" id="exportPdfBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-purple); font-size: 13px;">🖨️ Formatted PDF / Print Workflow</strong>
              <span class="badge" style="font-size: 10px; background: rgba(192, 132, 252, 0.1); color: var(--color-accent-purple); padding: 2px 6px; border-radius: 4px;">Print</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Opens print dialog with print-optimized CSS, page-break management, and clean typography.
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogExportCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#exportInspectDiagsBtn')?.addEventListener('click', () => {
      overlay.remove();
      this.showDiagnosticsDialog();
    });

    overlay.querySelector('#exportEmbedImages')?.addEventListener('change', (e) => {
      embedImages = e.target.checked;
    });

    overlay.querySelector('#dialogExportCloseBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Handle HTML export
    overlay.querySelector('#exportHtmlBtn')?.addEventListener('click', async () => {
      const res = await exportEngine.exportDocument(activeDoc, {
        format: ExportFormat.HTML,
        embedAssets: embedImages,
        force: true
      });
      if (res.success) {
        this.downloadBlob(res.output, `${docName}.html`, 'text/html');
        overlay.remove();
        this.showToast({ type: 'success', message: `Exported ${docName}.html successfully.` });
      } else {
        this.showToast({ type: 'danger', message: res.error });
      }
    });

    // Handle Raw Markdown export
    overlay.querySelector('#exportMdBtn')?.addEventListener('click', async () => {
      const res = await exportEngine.exportDocument(activeDoc, {
        format: ExportFormat.MARKDOWN,
        force: true
      });
      if (res.success) {
        this.downloadBlob(res.output, `${docName}.md`, 'text/markdown');
        overlay.remove();
        this.showToast({ type: 'success', message: `Exported ${docName}.md successfully.` });
      } else {
        this.showToast({ type: 'danger', message: res.error });
      }
    });

    // Handle PDF export
    overlay.querySelector('#exportPdfBtn')?.addEventListener('click', async () => {
      overlay.remove();
      window.print();
    });
  }

  showSettingsDialog() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'cyberpunk';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">Studio Settings &amp; Preferences</div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 6px;">Color Theme</label>
            <select id="themeSelectInput" style="width: 100%; padding: 8px 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff; font-size: 12.5px; outline: none;">
              <option value="cyberpunk" ${currentTheme === 'cyberpunk' ? 'selected' : ''}>Cyberpunk Dark (Default)</option>
              <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Paper Clean Light</option>
              <option value="monokai" ${currentTheme === 'monokai' ? 'selected' : ''}>Monokai Pro Charcoal</option>
              <option value="matrix" ${currentTheme === 'matrix' ? 'selected' : ''}>Matrix Emerald Terminal</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 6px;">Editor Font Size</label>
            <select id="fontSizeSelectInput" style="width: 100%; padding: 8px 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); color: #fff; font-size: 12.5px; outline: none;">
              <option value="12px">12px — Ultra Compact</option>
              <option value="13px" selected>13px — Studio Standard</option>
              <option value="15px">15px — Medium Comfort</option>
              <option value="17px">17px — High Legibility</option>
            </select>
          </div>

          <div style="padding: 10px; background: var(--color-surface-base); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-muted);">
            DevspireHub Markdown Studio v0.3.0 • Local-First Architecture
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogSettingsCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogSettingsApplyBtn">Apply Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#dialogSettingsCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#dialogSettingsApplyBtn')?.addEventListener('click', () => {
      const selectedTheme = overlay.querySelector('#themeSelectInput').value;
      const selectedFontSize = overlay.querySelector('#fontSizeSelectInput').value;

      document.documentElement.setAttribute('data-theme', selectedTheme);
      document.documentElement.style.setProperty('--font-size-editor', selectedFontSize);
      try {
        localStorage.setItem('devspirehub:theme', selectedTheme);
        localStorage.setItem('devspirehub:fontSize', selectedFontSize);
      } catch (e) {
        console.warn('Failed to persist settings:', e);
      }

      overlay.remove();
      this.showToast({ type: 'success', message: `Theme switched to "${selectedTheme}".` });
    });
  }

  downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  showToast(notification) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${notification.type || 'info'}`;
    toast.innerHTML = `
      <span>${notification.message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}
