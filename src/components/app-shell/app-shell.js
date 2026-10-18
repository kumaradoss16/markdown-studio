import { workspaceManager } from '../../core/workspace-manager.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class AppShellComponent {
  constructor(container) {
    this.container = container;
    this.currentMode = 'DUAL SPLIT';
  }

  render() {
    this.container.innerHTML = `
      <header class="app-header">
        <!-- Header Left -->
        <div class="header-left">
          <div class="window-dots">
            <div class="window-dot close" title="Close"></div>
            <div class="window-dot minimize" title="Minimize"></div>
            <div class="window-dot maximize" title="Maximize"></div>
          </div>

          <button class="header-btn" id="headerSidebarToggle" title="Toggle Sidebar (⌘B)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>

          <div class="vault-selector" id="vaultDropdownBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-cyan)" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>${workspaceManager.getVaultName()}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <button class="header-btn" id="headerNewDocBtn" title="New Document (⌘N)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>

          <button class="header-btn" id="headerNewFolderBtn" title="New Folder">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
        </div>

        <!-- Header Center Search / Command -->
        <div class="header-center">
          <div class="command-search-bar" id="commandSearchBar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search vault or type command..." readonly />
            <span class="shortcut-badge">⌘P</span>
          </div>
        </div>

        <!-- Header Right -->
        <div class="header-right">
          <!-- View Modes -->
          <div class="view-mode-toggle">
            <button class="view-mode-btn" id="modeSourceBtn">&lt;&gt; Source</button>
            <button class="view-mode-btn active" id="modeSplitBtn">◫ Split</button>
            <button class="view-mode-btn" id="modePreviewBtn">👁 Live Preview</button>
          </div>

          <!-- Quick Formatting -->
          <div style="display: flex; gap: 2px;">
            <button class="header-btn" id="hHead1">H1</button>
            <button class="header-btn" id="hHead2">H2</button>
            <button class="header-btn" id="hBold">B</button>
            <button class="header-btn" id="hCode">&lt;&gt;</button>
            <button class="header-btn" id="hLink">🔗</button>
          </div>

          <!-- Focus -->
          <button class="header-btn" id="focusBtn" title="Focus mode (⌘F)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-purple)" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Focus</span>
            <span class="shortcut-badge" style="font-size: 8.5px;">⌘F</span>
          </button>

          <!-- PDF -->
          <button class="header-btn" id="pdfExportBtn" title="Export to PDF">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>PDF</span>
          </button>

          <!-- Synced status -->
          <div class="sync-status-badge">
            <span style="font-size: 8px;">●</span>
            <span>Synced</span>
          </div>

          <!-- Settings -->
          <button class="header-btn" id="settingsBtn" title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          <!-- User avatar -->
          <div class="avatar-circle" title="Logged in as jt">JT</div>
        </div>
      </header>

      <!-- Main Body Container -->
      <div class="workspace-container">
        <aside class="workspace-sidebar" id="sidebarContainer"></aside>
        <main class="main-workspace">
          <nav class="document-tabs-bar" id="tabsContainer"></nav>
          <div class="dual-split-pane" id="splitPaneContainer">
            <section class="editor-pane" id="editorContainer"></section>
            <section class="preview-pane" id="previewContainer"></section>
          </div>
        </main>
      </div>

      <!-- Status Bar -->
      <footer class="app-status-bar" id="statusBarContainer"></footer>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Sidebar toggle
    this.container.querySelector('#headerSidebarToggle')?.addEventListener('click', () => {
      document.querySelector('.workspace-sidebar')?.classList.toggle('collapsed');
    });

    // Command palette trigger
    this.container.querySelector('#commandSearchBar')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'command-palette' });
    });

    // New Document
    this.container.querySelector('#headerNewDocBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file' });
    });

    // View modes
    const splitContainer = this.container.querySelector('#splitPaneContainer');
    const sourceBtn = this.container.querySelector('#modeSourceBtn');
    const splitBtn = this.container.querySelector('#modeSplitBtn');
    const previewBtn = this.container.querySelector('#modePreviewBtn');

    const setMode = (mode) => {
      sourceBtn?.classList.toggle('active', mode === 'SOURCE');
      splitBtn?.classList.toggle('active', mode === 'DUAL SPLIT');
      previewBtn?.classList.toggle('active', mode === 'PREVIEW');

      splitContainer.className = 'dual-split-pane';
      if (mode === 'SOURCE') splitContainer.classList.add('view-source');
      if (mode === 'PREVIEW') splitContainer.classList.add('view-preview');

      eventBus.emit(AppEvents.VIEW_MODE_CHANGED, mode);
    };

    sourceBtn?.addEventListener('click', () => setMode('SOURCE'));
    splitBtn?.addEventListener('click', () => setMode('DUAL SPLIT'));
    previewBtn?.addEventListener('click', () => setMode('PREVIEW'));

    // Focus mode toggle
    this.container.querySelector('#focusBtn')?.addEventListener('click', () => {
      document.querySelector('.workspace-sidebar')?.classList.toggle('collapsed');
    });

    // PDF / Export button in header
    this.container.querySelector('#pdfExportBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'export' });
    });

    // Settings button
    this.container.querySelector('#settingsBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'settings' });
    });

    // Vault selector info
    this.container.querySelector('#vaultDropdownBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: `Vault: ${workspaceManager.getVaultName()} • ${workspaceManager.knowledgeBase.length} docs loaded`
      });
    });

    // Window control buttons
    this.container.querySelector('.window-dot.close')?.addEventListener('click', () => {
      if (window.__TAURI_INTERNALS__) {
        import('@tauri-apps/api/window').then(w => w.getCurrentWindow().close()).catch(() => {});
      } else {
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: 'Studio session running in local-first browser environment.' });
      }
    });
    this.container.querySelector('.window-dot.minimize')?.addEventListener('click', () => {
      if (window.__TAURI_INTERNALS__) {
        import('@tauri-apps/api/window').then(w => w.getCurrentWindow().minimize()).catch(() => {});
      }
    });
    this.container.querySelector('.window-dot.maximize')?.addEventListener('click', () => {
      if (window.__TAURI_INTERNALS__) {
        import('@tauri-apps/api/window').then(w => w.getCurrentWindow().toggleMaximize()).catch(() => {});
      }
    });

    // Formatting shortcuts from header
    this.container.querySelector('#hHead1')?.addEventListener('click', () => {
      document.querySelector('#toolH1')?.click();
    });
    this.container.querySelector('#hHead2')?.addEventListener('click', () => {
      document.querySelector('#toolH2')?.click();
    });
    this.container.querySelector('#hBold')?.addEventListener('click', () => {
      document.querySelector('#toolBold')?.click();
    });
    this.container.querySelector('#hCode')?.addEventListener('click', () => {
      document.querySelector('#toolCode')?.click();
    });
    this.container.querySelector('#hLink')?.addEventListener('click', () => {
      document.querySelector('#toolWiki')?.click();
    });
  }
}
