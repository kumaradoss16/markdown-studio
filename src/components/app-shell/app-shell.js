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
          <div class="markforge-brand" title="MarkForge Markdown Studio">
            <img src="/markforge-icon.png" alt="MarkForge Logo" class="markforge-logo" width="24" height="24" />
            <span class="markforge-title">MarkForge</span>
          </div>

          <button class="header-btn" id="headerSidebarToggle" title="Toggle Sidebar (⌘B)" aria-label="Toggle Sidebar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>

          <button class="header-btn" id="headerNewDocBtn" title="New Document (⌘N)" aria-label="New Document">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>

          <button class="header-btn" id="headerNewFolderBtn" title="New Folder" aria-label="New Folder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
        </div>

        <!-- Header Center Search / Command -->
        <div class="header-center">
          <div class="command-search-bar" id="commandSearchBar" role="button" aria-label="Search vault or open command palette">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search vault or type command..." readonly aria-label="Search command palette" />
            <span class="shortcut-badge">⌘P</span>
          </div>
        </div>

        <!-- Header Right -->
        <div class="header-right">
          <!-- View Modes -->
          <div class="view-mode-toggle" role="group" aria-label="Workspace View Mode">
            <button class="view-mode-btn" id="modeSourceBtn" title="Source Only" aria-label="Source Mode">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>Source</span>
            </button>
            <button class="view-mode-btn active" id="modeSplitHBtn" title="Horizontal Split" aria-label="Horizontal Split Mode">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              <span>Split H</span>
            </button>
            <button class="view-mode-btn" id="modeSplitVBtn" title="Vertical Split" aria-label="Vertical Split Mode">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
              <span>Split V</span>
            </button>
            <button class="view-mode-btn" id="modePreviewBtn" title="Live Preview Only" aria-label="Preview Mode">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Preview</span>
            </button>
          </div>

          <!-- Quick Formatting -->
          <div style="display: flex; gap: 2px;" role="group" aria-label="Quick format controls">
            <button class="header-btn" id="hHead1" title="Heading 1" aria-label="Heading 1">H1</button>
            <button class="header-btn" id="hHead2" title="Heading 2" aria-label="Heading 2">H2</button>
            <button class="header-btn" id="hBold" title="Bold" aria-label="Bold"><strong>B</strong></button>
            <button class="header-btn" id="hCode" title="Code snippet" aria-label="Code">&lt;&gt;</button>
            <button class="header-btn" id="hLink" title="Insert Link" aria-label="Link">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
          </div>

          <!-- Focus -->
          <button class="header-btn" id="focusBtn" title="Focus mode (⌘F)" aria-label="Toggle focus mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Focus</span>
            <span class="shortcut-badge" style="font-size: 8.5px;">⌘F</span>
          </button>

          <!-- PDF -->
          <button class="header-btn" id="pdfExportBtn" title="Export to PDF" aria-label="Export to PDF">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span>PDF</span>
          </button>

          <!-- Synced status -->
          <div class="sync-status-badge" role="status" aria-label="Synchronized state">
            <span style="font-size: 8px;" aria-hidden="true">●</span>
            <span>Synced</span>
          </div>

          <!-- Settings -->
          <button class="header-btn" id="settingsBtn" title="Settings" aria-label="Open Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
            <div class="pane-splitter" id="paneSplitter" title="Drag to resize panels"></div>
            <section class="preview-pane" id="previewContainer"></section>
          </div>
        </main>
      </div>

      <!-- Status Bar -->
      <footer class="app-status-bar" id="statusBarContainer"></footer>
    `;

    this.attachEvents();
    this.setupSplitter();
    this.setupSyncScroll();
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

    // New Folder
    this.container.querySelector('#headerNewFolderBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-folder' });
    });

    // View modes
    const splitContainer = this.container.querySelector('#splitPaneContainer');
    const sourceBtn = this.container.querySelector('#modeSourceBtn');
    const splitHBtn = this.container.querySelector('#modeSplitHBtn');
    const splitVBtn = this.container.querySelector('#modeSplitVBtn');
    const previewBtn = this.container.querySelector('#modePreviewBtn');

    const setMode = (mode) => {
      sourceBtn?.classList.toggle('active', mode === 'SOURCE');
      splitHBtn?.classList.toggle('active', mode === 'DUAL SPLIT');
      splitVBtn?.classList.toggle('active', mode === 'SPLIT VERTICAL');
      previewBtn?.classList.toggle('active', mode === 'PREVIEW');

      splitContainer.className = 'dual-split-pane';
      if (mode === 'SOURCE') splitContainer.classList.add('view-source');
      if (mode === 'PREVIEW') splitContainer.classList.add('view-preview');
      if (mode === 'SPLIT VERTICAL') splitContainer.classList.add('split-vertical');

      eventBus.emit(AppEvents.VIEW_MODE_CHANGED, mode);
    };

    sourceBtn?.addEventListener('click', () => setMode('SOURCE'));
    splitHBtn?.addEventListener('click', () => setMode('DUAL SPLIT'));
    splitVBtn?.addEventListener('click', () => setMode('SPLIT VERTICAL'));
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

  setupSplitter() {
    const splitContainer = this.container.querySelector('#splitPaneContainer');
    const splitter = this.container.querySelector('#paneSplitter');
    if (!splitter || !splitContainer) return;

    let isDragging = false;

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      splitter.classList.add('dragging');
      const isVertical = splitContainer.classList.contains('split-vertical');
      document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const rect = splitContainer.getBoundingClientRect();
        const isVert = splitContainer.classList.contains('split-vertical');

        if (isVert) {
          const clientY = ev.clientY - rect.top;
          let percent = (clientY / rect.height) * 100;
          percent = Math.max(15, Math.min(85, percent));
          splitContainer.style.setProperty('--editor-split-size', `${percent}%`);
          splitContainer.style.setProperty('--preview-split-size', `calc(${100 - percent}% - var(--splitter-size))`);
        } else {
          const clientX = ev.clientX - rect.left;
          let percent = (clientX / rect.width) * 100;
          percent = Math.max(15, Math.min(85, percent));
          splitContainer.style.setProperty('--editor-split-size', `${percent}%`);
          splitContainer.style.setProperty('--preview-split-size', `calc(${100 - percent}% - var(--splitter-size))`);
        }
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          splitter.classList.remove('dragging');
          document.body.style.removeProperty('cursor');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  setupSyncScroll() {
    let isSyncing = false;

    const getEditorScroller = () => document.querySelector('.cm-scroller');
    const getPreviewScroller = () => document.querySelector('#previewScrollArea');

    const syncFromEditor = () => {
      if (isSyncing) return;
      const ed = getEditorScroller();
      const prev = getPreviewScroller();
      if (!ed || !prev) return;

      const maxEd = ed.scrollHeight - ed.clientHeight;
      if (maxEd <= 0) return;
      const ratio = ed.scrollTop / maxEd;

      isSyncing = true;
      prev.scrollTop = ratio * (prev.scrollHeight - prev.clientHeight);
      requestAnimationFrame(() => { isSyncing = false; });
    };

    const syncFromPreview = () => {
      if (isSyncing) return;
      const ed = getEditorScroller();
      const prev = getPreviewScroller();
      if (!ed || !prev) return;

      const maxPrev = prev.scrollHeight - prev.clientHeight;
      if (maxPrev <= 0) return;
      const ratio = prev.scrollTop / maxPrev;

      isSyncing = true;
      ed.scrollTop = ratio * (ed.scrollHeight - ed.clientHeight);
      requestAnimationFrame(() => { isSyncing = false; });
    };

    document.addEventListener('scroll', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('cm-scroller')) {
        syncFromEditor();
      } else if (e.target && e.target.id === 'previewScrollArea') {
        syncFromPreview();
      }
    }, true);
  }
}
