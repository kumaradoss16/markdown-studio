import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
import { markdownService } from '../../services/markdown-service.js';
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
    } else if (payload.type === 'command-palette') {
      this.showCommandPalette();
    } else if (payload.type === 'export') {
      this.showExportDialog();
    } else if (payload.type === 'settings') {
      this.showSettingsDialog();
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
        // Notification already emitted by save coordinator
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
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogFileCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="dialogFileSubmitBtn">${isNew ? 'Create' : 'Save'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#dialogFileNameInput');
    input.focus();
    input.select();

    const submit = async () => {
      const val = input.value.trim();
      if (!val) return;
      overlay.remove();

      if (isNew) {
        const fullPath = val.includes('/') ? val : `ExampleVault/${val}`;
        documentStateManager.createDocument(val, '# ' + val.replace('.md', ''), fullPath);
      } else {
        const fullPath = val.includes('/') ? val : `ExampleVault/${val}`;
        await saveCoordinator.saveAs(payload.docId, fullPath);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') overlay.remove();
    });

    overlay.querySelector('#dialogFileCancelBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dialogFileSubmitBtn')?.addEventListener('click', submit);
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
        <div id="paletteItems" style="max-height: 280px; overflow-y: auto; padding: 6px 0;">
          <div class="sidebar-item" data-action="new-doc"><strong>New Document</strong> <span style="margin-left: auto; font-family: var(--font-editor); font-size: 10px; color: var(--color-text-muted);">⌘N</span></div>
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
      case 'export-pdf':
        this.showExportDialog();
        break;
      case 'open-settings':
        this.showSettingsDialog();
        break;
    }
  }

  showExportDialog() {
    const activeDoc = documentStateManager.getActiveDocument();
    if (!activeDoc) {
      this.showToast({ type: 'warning', message: 'No active document to export.' });
      return;
    }

    const docName = activeDoc.name ? activeDoc.name.replace('.md', '') : 'Document';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <span>Export "${activeDoc.name}"</span>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 10px;">
          <p style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px;">
            Choose an export format for the current document:
          </p>
          
          <div class="export-option-card" id="exportHtmlBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-cyan); font-size: 13px;">🌐 Standalone HTML Document (.html)</strong>
              <span class="badge" style="font-size: 10px; background: rgba(0, 229, 255, 0.1); color: var(--color-accent-cyan); padding: 2px 6px; border-radius: 4px;">Styled</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Sanitized HTML with embedded styling, typography, and GFM tables. Ready for offline sharing.
            </div>
          </div>

          <div class="export-option-card" id="exportMdBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-emerald); font-size: 13px;">📄 Raw Markdown File (.md)</strong>
              <span class="badge" style="font-size: 10px; background: rgba(16, 185, 129, 0.1); color: var(--color-accent-emerald); padding: 2px 6px; border-radius: 4px;">Source</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Downloads the exact unmodified Markdown source text and YAML frontmatter.
            </div>
          </div>

          <div class="export-option-card" id="exportPdfBtn" style="padding: 12px; border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); cursor: pointer; background: var(--color-surface-base); transition: all 0.2s;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <strong style="color: var(--color-accent-purple); font-size: 13px;">🖨️ Formatted PDF / Print</strong>
              <span class="badge" style="font-size: 10px; background: rgba(192, 132, 252, 0.1); color: var(--color-accent-purple); padding: 2px 6px; border-radius: 4px;">Print</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">
              Opens desktop print dialog with clean, ink-friendly page styling.
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="dialogExportCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#dialogExportCloseBtn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Handle HTML export
    overlay.querySelector('#exportHtmlBtn')?.addEventListener('click', () => {
      const htmlContent = markdownService.generateStandaloneHtml(activeDoc);
      this.downloadBlob(htmlContent, `${docName}.html`, 'text/html');
      overlay.remove();
      this.showToast({ type: 'success', message: `Exported ${docName}.html successfully.` });
    });

    // Handle Raw Markdown export
    overlay.querySelector('#exportMdBtn')?.addEventListener('click', () => {
      this.downloadBlob(activeDoc.content || '', `${docName}.md`, 'text/markdown');
      overlay.remove();
      this.showToast({ type: 'success', message: `Exported ${docName}.md successfully.` });
    });

    // Handle PDF export
    overlay.querySelector('#exportPdfBtn')?.addEventListener('click', () => {
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
            DevspireHub Markdown Studio v0.2.0 • Local-First Architecture
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
