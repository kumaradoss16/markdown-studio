import { workspaceManager } from '../../core/workspace-manager.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { GraphViewComponent } from './graph-view.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class SidebarComponent {
  constructor(container) {
    this.container = container;
    this.activeContextMenu = null;
    this.setupListeners();

    // Close context menu on outside click or escape
    document.addEventListener('click', (e) => {
      if (this.activeContextMenu && !this.activeContextMenu.contains(e.target)) {
        this.closeContextMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeContextMenu();
      }
    });
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      this.updateActiveItem(doc);
    });
    eventBus.on(AppEvents.WORKSPACE_CHANGED, () => {
      this.render();
    });
  }

  render() {
    const activeDoc = documentStateManager.getActiveDocument();
    const activePath = activeDoc ? activeDoc.path : 'ExampleVault/Habitat Design.md';

    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-title-area">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span>${workspaceManager.getVaultName()}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="sidebar-actions">
          <button class="header-btn" id="sidebarNewDocBtn" title="New Document (⌘N)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarNewFolderBtn" title="New Folder">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarSearchBtn" title="Search (⌘F)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarSortBtn" title="Sort files">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarCollapseBtn" title="Collapse sidebar (⌘B)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="sidebar-scroll-area">
        <!-- Recents -->
        <div class="sidebar-section">
          <div class="folder-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Recents</span>
          </div>
          <div class="folder-content">
            <div class="sidebar-item" data-path="ExampleVault/Sprint Review 2026-03-25.md" data-name="Sprint Review 2026-03-25.md">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Sprint Review 2026-03-25</span>
              <button class="item-more-btn" title="More options" data-path="ExampleVault/Sprint Review 2026-03-25.md" data-name="Sprint Review 2026-03-25.md">···</button>
            </div>
          </div>
        </div>

        <!-- Folders -->
        <div class="sidebar-section">
          <div class="folder-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>audio</span>
          </div>
          <div class="folder-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>embeds</span>
          </div>
          <div class="folder-content">
            <div class="sidebar-item" data-path="ExampleVault/embeds/telemetry-card.html" data-name="telemetry-card.html">
              <span style="font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-teal);">&lt;&gt;</span>
              <span>telemetry-card.html</span>
              <button class="item-more-btn" title="More options" data-path="ExampleVault/embeds/telemetry-card.html" data-name="telemetry-card.html">···</button>
            </div>
            <div class="sidebar-item" data-path="ExampleVault/embeds/Embed Showcase.md" data-name="Embed Showcase.md">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
              <span>Embed Showcase.md</span>
              <button class="item-more-btn" title="More options" data-path="ExampleVault/embeds/Embed Showcase.md" data-name="Embed Showcase.md">···</button>
            </div>
          </div>
          <div class="folder-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>images</span>
          </div>
        </div>

        <!-- Knowledge Base -->
        <div class="sidebar-section">
          <div class="sidebar-section-title">Knowledge Base</div>
          <div class="knowledge-base-list">
            ${workspaceManager.knowledgeBase.map(item => `
              <div class="sidebar-item ${item.path === activePath ? 'active' : ''}" data-path="${item.path}" data-name="${item.name}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>${item.name}</span>
                <button class="item-more-btn" title="More options" data-path="${item.path}" data-name="${item.name}">···</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tags -->
        <div class="sidebar-section">
          <div class="sidebar-section-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Tags [${workspaceManager.tags.length}]</span>
            <button class="header-btn" style="font-size: 9px; padding: 1px 4px;">filter</button>
          </div>
          <div class="tags-container">
            ${workspaceManager.tags.map(tag => `
              <span class="tag-pill ${workspaceManager.activeTagFilter === tag ? 'active' : ''}" data-tag="${tag}">${tag}</span>
            `).join('')}
          </div>
        </div>

        <!-- Graph View Container -->
        <div id="sidebarGraphViewContainer"></div>
      </div>

      <div class="sidebar-footer">
        <span>${workspaceManager.getVaultName()} / <strong style="color: var(--color-text-primary);">${activeDoc ? activeDoc.name.replace('.md', '') : 'Habitat Design'}</strong></span>
      </div>
    `;

    // Render Graph View
    const graphContainer = this.container.querySelector('#sidebarGraphViewContainer');
    if (graphContainer) {
      new GraphViewComponent(graphContainer).render();
    }

    this.attachEvents();
  }

  attachEvents() {
    // New Document button
    this.container.querySelector('#sidebarNewDocBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file' });
    });

    // New Folder button
    this.container.querySelector('#sidebarNewFolderBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-folder' });
    });

    // Search button
    this.container.querySelector('#sidebarSearchBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'command-palette' });
    });

    // Sort button
    this.container.querySelector('#sidebarSortBtn')?.addEventListener('click', () => {
      workspaceManager.toggleSort();
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: `Sorted knowledge base ${workspaceManager.sortAsc ? 'A-Z' : 'Z-A'}`
      });
    });

    // File click handler
    this.container.querySelectorAll('.sidebar-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        // If clicking more button, ignore item activation
        if (e.target.closest('.item-more-btn')) return;

        const path = el.getAttribute('data-path');
        if (!path) return;

        try {
          const fileData = await fileSystemService.readFile(path);
          documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
        } catch {
          const fallbackName = path.split('/').pop() || 'Untitled.md';
          documentStateManager.createDocument(fallbackName, '', path);
        }
      });

      // Context menu on right click
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const path = el.getAttribute('data-path');
        const name = el.getAttribute('data-name');
        if (path) {
          this.showItemContextMenu(e.clientX, e.clientY, path, name);
        }
      });
    });

    // More Options button click handler
    this.container.querySelectorAll('.item-more-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const path = btn.getAttribute('data-path');
        const name = btn.getAttribute('data-name');
        const rect = btn.getBoundingClientRect();
        this.showItemContextMenu(rect.right + 4, rect.top, path, name);
      });
    });

    // Tag pills
    this.container.querySelectorAll('.tag-pill').forEach(el => {
      el.addEventListener('click', () => {
        const tag = el.getAttribute('data-tag');
        workspaceManager.setFilterTag(tag);
      });
    });

    // Collapse toggle
    const collapseBtn = this.container.querySelector('#sidebarCollapseBtn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('.workspace-sidebar');
        sidebar.classList.toggle('collapsed');
      });
    }
  }

  showItemContextMenu(x, y, path, name) {
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu-dropdown';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="rename">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        <span>Rename</span>
      </div>
      <div class="context-menu-item" data-action="duplicate">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Duplicate</span>
      </div>
      <div class="context-menu-item" data-action="copy-path">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy Path</span>
      </div>
      <div class="context-menu-item" data-action="reveal">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>Reveal in File Explorer</span>
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" data-action="delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Delete</span>
      </div>
    `;

    document.body.appendChild(menu);
    const posX = Math.min(x, window.innerWidth - 190);
    const posY = Math.min(y, window.innerHeight - 200);
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    this.activeContextMenu = menu;

    menu.addEventListener('click', async (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      const action = item.getAttribute('data-action');
      this.closeContextMenu();

      if (action === 'rename') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'rename', path, name });
      } else if (action === 'duplicate') {
        try {
          const res = await workspaceManager.duplicateItem(path);
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Duplicated "${res.name}".` });
        } catch (err) {
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: err.message });
        }
      } else if (action === 'copy-path') {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(path);
          }
        } catch {
          // fallback
        }
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: `Copied path: ${path}` });
      } else if (action === 'reveal') {
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: `Path: ${path}` });
      } else if (action === 'delete') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'delete-confirm', path, name });
      }
    });
  }

  closeContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.remove();
      this.activeContextMenu = null;
    }
  }

  updateActiveItem(doc) {
    if (!doc) return;
    this.container.querySelectorAll('.sidebar-item').forEach(el => {
      const path = el.getAttribute('data-path');
      if (path === doc.path) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    const footer = this.container.querySelector('.sidebar-footer');
    if (footer) {
      footer.innerHTML = `<span>${workspaceManager.getVaultName()} / <strong style="color: var(--color-text-primary);">${doc.name.replace('.md', '')}</strong></span>`;
    }
  }
}
