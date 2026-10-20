import { workspaceManager } from '../../core/workspace-manager.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { recentFilesService } from '../../services/recent-files-service.js';
import { GraphViewComponent } from './graph-view.js';
import { FileTreeComponent } from '../file-tree/file-tree.js';
import { GitHubPanelComponent } from '../github/github-panel.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class SidebarComponent {
  constructor(container) {
    this.container = container;
    this.activeContextMenu = null;
    this.collapsedSections = this.getCollapsedSections();
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

  getCollapsedSections() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('markforge:sidebar:collapsed');
        if (raw) return new Set(JSON.parse(raw));
      }
    } catch {
      // fallback
    }
    return new Set();
  }

  saveCollapsedSections() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('markforge:sidebar:collapsed', JSON.stringify([...this.collapsedSections]));
      }
    } catch {
      // fallback
    }
  }

  isSectionCollapsed(sectionId) {
    return this.collapsedSections.has(sectionId);
  }

  toggleSection(sectionId) {
    if (this.collapsedSections.has(sectionId)) {
      this.collapsedSections.delete(sectionId);
    } else {
      this.collapsedSections.add(sectionId);
    }
    this.saveCollapsedSections();

    const sectionEl = this.container.querySelector(`[data-section-id="${sectionId}"]`);
    if (!sectionEl) return;

    const isCollapsed = this.isSectionCollapsed(sectionId);
    sectionEl.classList.toggle('is-collapsed', isCollapsed);

    const toggleBtn = sectionEl.querySelector('.section-toggle-header');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      const chevron = toggleBtn.querySelector('.section-chevron');
      if (chevron) {
        chevron.classList.toggle('collapsed', isCollapsed);
      }
    }

    const contentEl = sectionEl.querySelector('.section-content');
    if (contentEl) {
      contentEl.style.display = isCollapsed ? 'none' : '';
    }
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
    const activePath = activeDoc ? activeDoc.path : '';

    const isRecentsCollapsed = this.isSectionCollapsed('recents');
    const isFilesystemCollapsed = this.isSectionCollapsed('filesystem');
    const isKbCollapsed = this.isSectionCollapsed('knowledge-base');
    const isTagsCollapsed = this.isSectionCollapsed('tags');
    const isGithubCollapsed = this.isSectionCollapsed('github');

    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-title-area">
          <img src="/markforge-icon.png" alt="MarkForge" width="16" height="16" class="sidebar-brand-icon" style="border-radius: 3px;" />
        </div>
        <div class="sidebar-actions" role="toolbar" aria-label="Sidebar Actions">
          <button class="header-btn" id="sidebarNewDocBtn" title="New Document (⌘N)" aria-label="New Document">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarNewFolderBtn" title="New Folder" aria-label="New Folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarSearchBtn" title="Search (⌘F)" aria-label="Search Workspace">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarSortBtn" title="Sort files" aria-label="Sort Files">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/>
            </svg>
          </button>
          <button class="header-btn" id="sidebarCollapseBtn" title="Collapse sidebar (⌘B)" aria-label="Collapse Sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="sidebar-scroll-area">
        <!-- Recents -->
        <div class="sidebar-section recents-section ${isRecentsCollapsed ? 'is-collapsed' : ''}" data-section-id="recents">
          <div class="folder-header section-toggle-header" role="button" tabindex="0" aria-expanded="${!isRecentsCollapsed}" aria-label="Toggle Recent Files section" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="section-chevron ${isRecentsCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style="font-weight: 600;">Recents</span>
            </div>
            ${recentFilesService.getRecents().length > 0 ? `<button class="header-btn" id="sidebarClearRecentsBtn" title="Clear Recent Files" style="font-size: 9px; padding: 1px 5px;">clear</button>` : ''}
          </div>
          <div class="folder-content section-content" style="${isRecentsCollapsed ? 'display: none;' : ''}">
            ${recentFilesService.getRecents().length === 0 ? `
              <div class="sidebar-empty-hint">No recent files</div>
            ` : recentFilesService.getRecents().map(r => `
              <div class="sidebar-item ${r.path === activePath ? 'active' : ''}" data-path="${r.path}" data-name="${r.name}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.name.replace(/\.md$/, '')}</span>
                <button class="item-more-btn" title="More options" aria-label="More options for ${r.name}" data-path="${r.path}" data-name="${r.name}">···</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- File Tree Explorer -->
        <div class="sidebar-section file-tree-section ${isFilesystemCollapsed ? 'is-collapsed' : ''}" data-section-id="filesystem">
          <div class="sidebar-section-title section-toggle-header" role="button" tabindex="0" aria-expanded="${!isFilesystemCollapsed}" aria-label="Toggle Filesystem section" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="section-chevron ${isFilesystemCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <span>Filesystem</span>
            </div>
          </div>
          <div class="section-content" style="${isFilesystemCollapsed ? 'display: none;' : ''}">
            <div id="sidebarFileTreeMount"></div>
          </div>
        </div>

        <!-- Knowledge Base -->
        <div class="sidebar-section knowledge-base-section ${isKbCollapsed ? 'is-collapsed' : ''}" data-section-id="knowledge-base">
          <div class="sidebar-section-title section-toggle-header" role="button" tabindex="0" aria-expanded="${!isKbCollapsed}" aria-label="Toggle Knowledge Base section" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="section-chevron ${isKbCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <span>Knowledge Base</span>
            </div>
          </div>
          <div class="section-content" style="${isKbCollapsed ? 'display: none;' : ''}">
            <div class="knowledge-base-list">
              ${workspaceManager.knowledgeBase.length === 0 ? `
                <div class="sidebar-empty-hint">Knowledge base empty</div>
              ` : workspaceManager.knowledgeBase.map(item => `
                <div class="sidebar-item ${item.path === activePath ? 'active' : ''}" data-path="${item.path}" data-name="${item.name}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span>${item.name}</span>
                  <button class="item-more-btn" title="More options" aria-label="More options for ${item.name}" data-path="${item.path}" data-name="${item.name}">···</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div class="sidebar-section tags-section ${isTagsCollapsed ? 'is-collapsed' : ''}" data-section-id="tags">
          <div class="sidebar-section-title section-toggle-header" role="button" tabindex="0" aria-expanded="${!isTagsCollapsed}" aria-label="Toggle Tags section" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="section-chevron ${isTagsCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <span>Tags [${workspaceManager.tags.length}]</span>
            </div>
            ${workspaceManager.tags.length > 0 ? `<button class="header-btn" style="font-size: 9px; padding: 1px 4px;">filter</button>` : ''}
          </div>
          <div class="section-content" style="${isTagsCollapsed ? 'display: none;' : ''}">
            <div class="tags-container">
              ${workspaceManager.tags.length === 0 ? `
                <div class="sidebar-empty-hint" style="padding: 2px 0;">No tags found</div>
              ` : workspaceManager.tags.map(tag => `
                <span class="tag-pill ${workspaceManager.activeTagFilter === tag ? 'active' : ''}" data-tag="${tag}">${tag}</span>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- GitHub Explorer Section (Release 0.4) -->
        <div class="sidebar-section github-panel-section ${isGithubCollapsed ? 'is-collapsed' : ''}" data-section-id="github">
          <div class="sidebar-section-title section-toggle-header" role="button" tabindex="0" aria-expanded="${!isGithubCollapsed}" aria-label="Toggle GitHub Workspace section" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="section-chevron ${isGithubCollapsed ? 'collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <span>GitHub Workspace</span>
            </div>
          </div>
          <div class="section-content" style="${isGithubCollapsed ? 'display: none;' : ''}">
            <div id="sidebarGitHubMount"></div>
          </div>
        </div>

        <!-- Graph View Container -->
        <div id="sidebarGraphViewContainer"></div>
      </div>

      <div class="sidebar-footer">
        <span><strong style="color: var(--color-text-primary);">${activeDoc ? activeDoc.name.replace(/\.md$/, '') : 'No Document Active'}</strong></span>
      </div>
    `;

    // Render File Tree Explorer
    const fileTreeMount = this.container.querySelector('#sidebarFileTreeMount');
    if (fileTreeMount) {
      this.fileTree = new FileTreeComponent(fileTreeMount);
      this.fileTree.render();
    }

    // Render GitHub Explorer Panel
    const gitHubMount = this.container.querySelector('#sidebarGitHubMount');
    if (gitHubMount) {
      this.gitHubPanel = new GitHubPanelComponent(gitHubMount);
      this.gitHubPanel.render();
    }

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

    // Clear Recents button
    this.container.querySelector('#sidebarClearRecentsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      recentFilesService.clearRecents();
      this.render();
      eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: 'Recent files list cleared.' });
    });

    // Section collapse / expand accordion toggles
    this.container.querySelectorAll('.section-toggle-header').forEach(header => {
      const sectionEl = header.closest('.sidebar-section');
      const sectionId = sectionEl?.getAttribute('data-section-id');
      if (!sectionId) return;

      const onToggle = (e) => {
        if (e.target.closest('button') || e.target.closest('.header-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        this.toggleSection(sectionId);
      };

      header.addEventListener('click', onToggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('button') || e.target.closest('.header-btn')) return;
          e.preventDefault();
          e.stopPropagation();
          this.toggleSection(sectionId);
        }
      });
    });

    // File click handler
    this.container.querySelectorAll('.sidebar-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        // If clicking more button, ignore item activation
        if (e.target.closest('.item-more-btn')) return;

        const path = el.getAttribute('data-path');
        if (!path) return;

        const exists = await recentFilesService.verifyFileExists(path);
        if (!exists) {
          recentFilesService.removeRecent(path);
          eventBus.emit(AppEvents.NOTIFICATION, {
            type: 'warning',
            message: `File "${path}" does not exist on disk.`
          });
          return;
        }

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
      footer.innerHTML = `<span><strong style="color: var(--color-text-primary);">${doc.name.replace('.md', '')}</strong></span>`;
    }
  }
}
