import { AppEvents, eventBus } from '../../app/events.js';
import { graphIndexService } from '../../services/graph-index-service.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { workspaceStore } from '../../services/workspace-store.js';
import { ForceGraphEngine, FOLDER_PALETTE } from '../../features/graph/force-graph-engine.js';

export class GraphModalComponent {
  constructor() {
    this.modalEl = null;
    this.engine = null;
    this.canvas = null;
    this.resizeObserver = null;
    this.contextMenuEl = null;
    this.boundOnGlobalKeyDown = this.onGlobalKeyDown.bind(this);
    this.boundOnSettingsChanged = this.onSettingsChanged.bind(this);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.GRAPH_OPEN_REQUESTED, () => {
      this.show();
    });

    eventBus.on(AppEvents.GRAPH_UPDATED, (graphData) => {
      if (this.engine && this.isOpen()) {
        this.engine.setData(graphData);
        this.updateStats();
      }
    });
  }

  isOpen() {
    return Boolean(this.modalEl && this.modalEl.parentElement);
  }

  onGlobalKeyDown(e) {
    if (!this.isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.contextMenuEl) {
        this.hideContextMenu();
      } else {
        this.close();
      }
    } else if (e.key === '+' || e.key === '=') {
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        this.engine?.zoomIn();
      }
    } else if (e.key === '-' || e.key === '_') {
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        this.engine?.zoomOut();
      }
    } else if (e.key === '0') {
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        this.engine?.fitView(70);
      }
    }
  }

  onSettingsChanged() {
    if (this.isOpen() && this.engine) {
      this.engine.requestRender();
    }
  }

  async show() {
    this.close();

    // Read persisted graph settings
    const currentSettings = workspaceStore.getSettings() || {};
    const graphSettings = currentSettings.graph || {
      showGhostNotes: true,
      showOrphanNotes: true,
      showTags: true,
      onlyNeighbours: false,
      repulsion: 220,
      linkDistance: 75,
      gravity: 0.04,
    };

    const overlay = document.createElement('div');
    overlay.className = 'graph-modal-backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Workspace Knowledge Graph');
    overlay.setAttribute('tabindex', '-1');

    overlay.innerHTML = `
      <!-- Graph View Header Bar -->
      <div class="graph-modal-header" role="toolbar" aria-label="Graph View Toolbar">
        <div class="graph-header-title-group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #38bdf8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="12" cy="18" r="3"/>
            <line x1="8.5" y1="7.5" x2="10.5" y2="15.5"/>
            <line x1="15.5" y1="7.5" x2="13.5" y2="15.5"/>
            <line x1="9" y1="6" x2="15" y2="6"/>
          </svg>
          <span class="graph-title-text">Workspace Knowledge Graph</span>
          <span id="graphStatsBadge" class="graph-stats-badge" aria-live="polite">Indexing...</span>
        </div>

        <div class="graph-header-actions">
          <button id="graphFocusActiveBtn" class="graph-tool-btn" title="Focus Active Document" aria-label="Focus Active Document">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Focus Active</span>
          </button>
          <button id="graphZoomInBtn" class="graph-tool-btn" title="Zoom In (+)" aria-label="Zoom In">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <span>+</span>
          </button>
          <button id="graphZoomOutBtn" class="graph-tool-btn" title="Zoom Out (-)" aria-label="Zoom Out">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <span>-</span>
          </button>
          <button id="graphFitBtn" class="graph-tool-btn" title="Fit Entire Graph (0)" aria-label="Fit View">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Fit (0)</span>
          </button>
          <button id="graphReheatBtn" class="graph-tool-btn" title="Reheat Physics Simulation" aria-label="Reheat Simulation">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            <span>Reheat</span>
          </button>
          <button id="graphCloseBtn" class="graph-tool-btn" style="padding: 5px 8px; margin-left: 4px;" title="Close (Esc)" aria-label="Close Graph View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Graph View Body -->
      <div style="position: relative; flex: 1; width: 100%; overflow: hidden; background: radial-gradient(circle at 50% 50%, #172033 0%, #0d121f 100%);">
        
        <!-- Floating Controls Panel -->
        <div class="graph-floating-controls" role="region" aria-label="Graph Controls and Filters">
          <!-- Search / Filter -->
          <div class="graph-search-container">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="graphSearchInput" class="graph-search-input" placeholder="Filter notes..." aria-label="Filter notes" />
          </div>

          <!-- Filter Toggles -->
          <div class="graph-filter-list">
            <label class="graph-filter-item">
              <input type="checkbox" id="toggleGhostNotes" ${graphSettings.showGhostNotes ? 'checked' : ''} />
              <span>Show Ghost Notes (Unresolved)</span>
            </label>
            <label class="graph-filter-item">
              <input type="checkbox" id="toggleOrphanNotes" ${graphSettings.showOrphanNotes ? 'checked' : ''} />
              <span>Show Orphan Notes (0 links)</span>
            </label>
            <label class="graph-filter-item">
              <input type="checkbox" id="toggleTags" ${graphSettings.showTags ? 'checked' : ''} />
              <span>Show Tags (#tag)</span>
            </label>
            <label class="graph-filter-item">
              <input type="checkbox" id="toggleOnlyNeighbours" ${graphSettings.onlyNeighbours ? 'checked' : ''} />
              <span style="color: var(--color-accent, #38bdf8);">Only Neighbours of Selection</span>
            </label>
          </div>

          <button id="graphClearFiltersBtn" class="graph-tool-btn" style="width: 100%; justify-content: center; font-size: 10.5px; padding: 4px;" title="Reset all search queries and filter toggles">
            Clear Filters
          </button>

          <!-- Interactive Legend -->
          <div class="graph-legend-container">
            <div class="graph-legend-title">Legend</div>
            <div class="graph-legend-grid">
              <div class="graph-legend-item"><span class="graph-legend-line solid"></span><span>Wikilink</span></div>
              <div class="graph-legend-item"><span class="graph-legend-line dashed"></span><span>Markdown</span></div>
              <div class="graph-legend-item"><span class="graph-legend-line dotted"></span><span>Tag Link</span></div>
              <div class="graph-legend-item"><span class="graph-legend-swatch" style="background: var(--color-accent, #38bdf8); box-shadow: 0 0 4px var(--color-accent);"></span><span>Active Note</span></div>
              <div class="graph-legend-item"><span class="graph-legend-swatch" style="background: #a855f7;"></span><span>Tag Node</span></div>
              <div class="graph-legend-item"><span class="graph-legend-swatch" style="border: 1px dashed #94a3b8; background: transparent;"></span><span>Ghost Note</span></div>
            </div>
          </div>

          <!-- Collapsible Physics Tuning -->
          <details style="margin-top: 2px;">
            <summary style="cursor: pointer; font-weight: 600; color: var(--color-accent, #38bdf8); user-select: none;">Physics Forces</summary>
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Repulsion</span>
                  <span id="repulsionVal">-${graphSettings.repulsion || 220}</span>
                </div>
                <input type="range" id="sliderRepulsion" min="50" max="600" value="${graphSettings.repulsion || 220}" style="width: 100%;" />
              </div>
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Link Distance</span>
                  <span id="linkDistVal">${graphSettings.linkDistance || 75}</span>
                </div>
                <input type="range" id="sliderLinkDist" min="30" max="180" value="${graphSettings.linkDistance || 75}" style="width: 100%;" />
              </div>
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Center Gravity</span>
                  <span id="gravityVal">${(graphSettings.gravity || 0.04).toFixed(2)}</span>
                </div>
                <input type="range" id="sliderGravity" min="1" max="15" value="${Math.round((graphSettings.gravity || 0.04) * 100)}" style="width: 100%;" />
              </div>
            </div>
          </details>
        </div>

        <!-- Canvas Element -->
        <canvas id="graphViewCanvas" style="width: 100%; height: 100%; display: block;" aria-label="Knowledge Graph Visualization"></canvas>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;
    this.canvas = overlay.querySelector('#graphViewCanvas');

    // Initialize ForceGraphEngine
    this.engine = new ForceGraphEngine(this.canvas, {
      tooltipContainer: overlay,
      onNodeClick: (node) => this.handleNodeClick(node),
      onNodeContextMenu: (node, e) => this.showContextMenu(node, e.clientX, e.clientY),
    });

    // Apply initial settings
    this.engine.showGhostNotes = Boolean(graphSettings.showGhostNotes);
    this.engine.showOrphanNotes = Boolean(graphSettings.showOrphanNotes);
    this.engine.showTags = Boolean(graphSettings.showTags);
    this.engine.onlyNeighbours = Boolean(graphSettings.onlyNeighbours);
    if (graphSettings.repulsion) this.engine.charge = -graphSettings.repulsion;
    if (graphSettings.linkDistance) this.engine.linkDistance = graphSettings.linkDistance;
    if (graphSettings.gravity) this.engine.gravity = graphSettings.gravity;

    // Sync active document highlight
    const activeDoc = documentStateManager.getActiveDocument();
    if (activeDoc) {
      this.engine.setActiveNode(activeDoc.path || activeDoc.id);
    }

    // Attach listeners
    this.attachModalEvents(overlay);
    document.addEventListener('keydown', this.boundOnGlobalKeyDown);
    eventBus.on(AppEvents.SETTINGS_CHANGED, this.boundOnSettingsChanged);

    // Build or fetch latest graph data
    const data = await graphIndexService.buildGraph({ includeTags: true });
    this.engine.setData(data);
    this.updateStats();

    // Auto fit after initial layout settles slightly
    setTimeout(() => {
      if (this.engine) this.engine.fitView(70);
    }, 120);

    // Resize handling
    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.engine) this.engine.resize();
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  attachModalEvents(overlay) {
    overlay.querySelector('#graphCloseBtn')?.addEventListener('click', () => this.close());
    overlay.querySelector('#graphFitBtn')?.addEventListener('click', () => this.engine?.fitView(70));
    overlay.querySelector('#graphReheatBtn')?.addEventListener('click', () => this.engine?.reheat(0.85));
    overlay.querySelector('#graphZoomInBtn')?.addEventListener('click', () => this.engine?.zoomIn());
    overlay.querySelector('#graphZoomOutBtn')?.addEventListener('click', () => this.engine?.zoomOut());
    overlay.querySelector('#graphFocusActiveBtn')?.addEventListener('click', () => this.engine?.focusActiveDoc());

    // Search filter
    const searchInput = overlay.querySelector('#graphSearchInput');
    searchInput?.addEventListener('input', (e) => {
      if (this.engine) {
        this.engine.searchQuery = e.target.value;
        this.engine.requestRender();
        this.updateStats();
      }
    });

    // Clear filters
    overlay.querySelector('#graphClearFiltersBtn')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      const toggleGhost = overlay.querySelector('#toggleGhostNotes');
      const toggleOrphan = overlay.querySelector('#toggleOrphanNotes');
      const toggleTags = overlay.querySelector('#toggleTags');
      const toggleNeighbours = overlay.querySelector('#toggleOnlyNeighbours');

      if (toggleGhost) toggleGhost.checked = true;
      if (toggleOrphan) toggleOrphan.checked = true;
      if (toggleTags) toggleTags.checked = true;
      if (toggleNeighbours) toggleNeighbours.checked = false;

      if (this.engine) {
        this.engine.searchQuery = '';
        this.engine.showGhostNotes = true;
        this.engine.showOrphanNotes = true;
        this.engine.showTags = true;
        this.engine.onlyNeighbours = false;
        this.engine.selectedNode = null;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    // Toggles
    const toggleGhost = overlay.querySelector('#toggleGhostNotes');
    toggleGhost?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showGhostNotes = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    const toggleOrphan = overlay.querySelector('#toggleOrphanNotes');
    toggleOrphan?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showOrphanNotes = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    const toggleTags = overlay.querySelector('#toggleTags');
    toggleTags?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showTags = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    const toggleNeighbours = overlay.querySelector('#toggleOnlyNeighbours');
    toggleNeighbours?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.onlyNeighbours = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    // Physics sliders
    const sliderRepulsion = overlay.querySelector('#sliderRepulsion');
    const repulsionVal = overlay.querySelector('#repulsionVal');
    sliderRepulsion?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (repulsionVal) repulsionVal.textContent = `-${val}`;
      if (this.engine) {
        this.engine.charge = -val;
        this.engine.reheat(0.4);
        this.saveGraphSettings();
      }
    });

    const sliderLinkDist = overlay.querySelector('#sliderLinkDist');
    const linkDistVal = overlay.querySelector('#linkDistVal');
    sliderLinkDist?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (linkDistVal) linkDistVal.textContent = `${val}`;
      if (this.engine) {
        this.engine.linkDistance = val;
        this.engine.reheat(0.4);
        this.saveGraphSettings();
      }
    });

    const sliderGravity = overlay.querySelector('#sliderGravity');
    const gravityVal = overlay.querySelector('#gravityVal');
    sliderGravity?.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100;
      if (gravityVal) gravityVal.textContent = `${val.toFixed(2)}`;
      if (this.engine) {
        this.engine.gravity = val;
        this.engine.reheat(0.4);
        this.saveGraphSettings();
      }
    });

    // Dismiss context menu on click outside
    overlay.addEventListener('click', () => {
      this.hideContextMenu();
    });
  }

  saveGraphSettings() {
    if (!this.engine) return;
    const settings = {
      showGhostNotes: this.engine.showGhostNotes,
      showOrphanNotes: this.engine.showOrphanNotes,
      showTags: this.engine.showTags,
      onlyNeighbours: this.engine.onlyNeighbours,
      repulsion: Math.abs(this.engine.charge),
      linkDistance: this.engine.linkDistance,
      gravity: this.engine.gravity,
    };
    workspaceStore.saveSettings({ graph: settings });
  }

  updateStats() {
    if (!this.modalEl || !this.engine) return;
    const badge = this.modalEl.querySelector('#graphStatsBadge');
    if (!badge) return;

    const visibleNodes = this.engine.getVisibleNodes();
    const visibleEdges = this.engine.getVisibleEdges(visibleNodes);

    const ghosts = visibleNodes.filter(n => n.isGhost).length;
    const tags = visibleNodes.filter(n => n.isTag).length;
    const notes = visibleNodes.length - ghosts - tags;

    badge.textContent = `${visibleNodes.length} Nodes (${notes} notes, ${ghosts} ghosts, ${tags} tags) • ${visibleEdges.length} Links`;
  }

  showContextMenu(node, clientX, clientY) {
    this.hideContextMenu();
    if (!node || !this.modalEl) return;

    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.style.left = `${clientX + 2}px`;
    menu.style.top = `${clientY + 2}px`;

    const isGhost = node.isGhost;
    menu.innerHTML = `
      <div class="graph-context-item" data-action="open">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        <span>${isGhost ? 'Create & Open Note' : 'Open Note'}</span>
      </div>
      <div class="graph-context-item" data-action="copy-path">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy Path</span>
      </div>
      <div class="graph-context-item" data-action="filter-neighbours">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>
        <span>Filter Neighbours</span>
      </div>
    `;

    menu.querySelector('[data-action="open"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideContextMenu();
      this.handleNodeClick(node);
    });

    menu.querySelector('[data-action="copy-path"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideContextMenu();
      const pathText = node.path || node.id;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(pathText);
      }
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: `Copied path: ${pathText}`,
      });
    });

    menu.querySelector('[data-action="filter-neighbours"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideContextMenu();
      if (this.engine) {
        this.engine.selectedNode = node;
        this.engine.onlyNeighbours = true;
        const toggle = this.modalEl?.querySelector('#toggleOnlyNeighbours');
        if (toggle) toggle.checked = true;
        this.engine.requestRender();
        this.updateStats();
        this.saveGraphSettings();
      }
    });

    this.modalEl.appendChild(menu);
    this.contextMenuEl = menu;
  }

  hideContextMenu() {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  async handleNodeClick(node) {
    if (!node) return;

    if (node.isTag) {
      const searchInput = this.modalEl?.querySelector('#graphSearchInput');
      if (searchInput) {
        searchInput.value = node.label.replace(/^#/, '');
        this.engine.searchQuery = searchInput.value;
        this.engine.requestRender();
        this.updateStats();
      }
      return;
    }

    if (node.isGhost) {
      const rawTarget = node.id.replace(/^ghost:/, '');
      const notePath = rawTarget.endsWith('.md') ? rawTarget : `${rawTarget}.md`;
      const noteTitle = rawTarget.split('/').pop().replace(/\.md$/i, '');
      const initialContent = `# ${noteTitle}\n\nCreated from graph link.\n`;

      try {
        await fileSystemService.writeFile(notePath, initialContent);
        const fileData = await fileSystemService.readFile(notePath);
        documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'success',
          message: `Created new note "${noteTitle}" from ghost link.`,
        });
        this.close();
      } catch (err) {
        documentStateManager.createDocument(noteTitle, initialContent, notePath);
        this.close();
      }
      return;
    }

    // Regular note: open in editor
    try {
      const existingDoc = documentStateManager.getOpenDocuments().find(d => d.path === node.path);
      if (existingDoc) {
        documentStateManager.setActiveDocument(existingDoc.id);
      } else {
        const fileData = await fileSystemService.readFile(node.path);
        documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
      }
      this.close();
    } catch (err) {
      console.warn('Failed to open note from graph:', err);
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'error',
        message: `Could not open "${node.label}": ${err.message}`,
      });
    }
  }

  close() {
    this.hideContextMenu();

    document.removeEventListener('keydown', this.boundOnGlobalKeyDown);
    eventBus.off(AppEvents.SETTINGS_CHANGED, this.boundOnSettingsChanged);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }
}

export const graphModalComponent = new GraphModalComponent();
