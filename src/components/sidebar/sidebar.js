import { workspaceManager } from '../../core/workspace-manager.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { GraphViewComponent } from './graph-view.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class SidebarComponent {
  constructor(container) {
    this.container = container;
    this.setupListeners();
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
            <div class="sidebar-item" data-path="ExampleVault/Sprint Review 2026-03-25.md">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>Sprint Review 2026-03-25</span>
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
            <div class="sidebar-item" data-path="ExampleVault/embeds/telemetry-card.html">
              <span style="font-family: var(--font-editor); font-size: 10px; color: var(--color-accent-teal);">&lt;&gt;</span>
              <span>telemetry-card.html</span>
            </div>
            <div class="sidebar-item" data-path="ExampleVault/embeds/Embed Showcase.md">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
              <span>Embed Showcase.md</span>
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
              <div class="sidebar-item ${item.path === activePath ? 'active' : ''}" data-path="${item.path}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>${item.name}</span>
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
    // File click handler
    this.container.querySelectorAll('.sidebar-item').forEach(el => {
      el.addEventListener('click', async () => {
        const path = el.getAttribute('data-path');
        if (!path) return;

        try {
          const fileData = await fileSystemService.readFile(path);
          documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
        } catch {
          documentStateManager.createDocument(fileData?.name || path.split('/').pop(), '', path);
        }
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
