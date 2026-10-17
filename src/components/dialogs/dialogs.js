import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
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
          <div class="sidebar-item" data-action="export-pdf"><strong>Export Preview as PDF</strong></div>
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
      case 'export-pdf':
        window.print();
        break;
    }
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
