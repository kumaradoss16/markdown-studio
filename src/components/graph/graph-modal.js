import { AppEvents, eventBus } from '../../app/events.js';
import { graphIndexService } from '../../services/graph-index-service.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { ForceGraphEngine } from '../../features/graph/force-graph-engine.js';

export class GraphModalComponent {
  constructor() {
    this.modalEl = null;
    this.engine = null;
    this.canvas = null;
    this.resizeObserver = null;
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return Boolean(this.modalEl && this.modalEl.parentElement);
  }

  async show() {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'graph-modal-backdrop';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(10, 15, 26, 0.85);
      backdrop-filter: blur(8px);
      z-index: 9998;
      display: flex;
      flex-direction: column;
      animation: fadeIn 0.15s ease-out;
    `;

    overlay.innerHTML = `
      <!-- Graph View Header Bar -->
      <div class="graph-modal-header" style="
        height: 48px;
        background: var(--color-bg-panel, #111827);
        border-bottom: 1px solid var(--color-border-subtle, #1f2937);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        z-index: 10;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #00e5ff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="12" cy="18" r="3"/>
            <line x1="8.5" y1="7.5" x2="10.5" y2="15.5"/>
            <line x1="15.5" y1="7.5" x2="13.5" y2="15.5"/>
            <line x1="9" y1="6" x2="15" y2="6"/>
          </svg>
          <span style="font-weight: 700; font-size: 14px; color: #f8fafc; letter-spacing: -0.01em;">
            Workspace Knowledge Graph
          </span>
          <span id="graphStatsBadge" style="
            font-size: 11px;
            color: var(--color-text-muted, #94a3b8);
            background: rgba(255, 255, 255, 0.06);
            padding: 2px 8px;
            border-radius: 12px;
            margin-left: 6px;
          ">Indexing...</span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="graphFitBtn" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; display: flex; align-items: center; gap: 4px;" title="Fit entire graph in viewport">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            Fit View
          </button>
          <button id="graphReheatBtn" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; display: flex; align-items: center; gap: 4px;" title="Reheat physics simulation">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Reheat
          </button>
          <button id="graphCloseBtn" class="header-btn" style="padding: 6px;" title="Close (Esc)" aria-label="Close Graph View">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Graph View Body -->
      <div style="position: relative; flex: 1; width: 100%; overflow: hidden; background: radial-gradient(circle at 50% 50%, #172033 0%, #0d121f 100%);">
        
        <!-- Floating Controls Panel -->
        <div class="graph-floating-controls" style="
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 20;
          background: rgba(17, 24, 39, 0.88);
          backdrop-filter: blur(10px);
          border: 1px solid var(--color-border-subtle, #374151);
          border-radius: 8px;
          padding: 12px 14px;
          width: 260px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          gap: 10px;
          color: #e2e8f0;
          font-size: 11px;
        ">
          <!-- Search / Filter -->
          <div style="display: flex; align-items: center; background: rgba(0,0,0,0.3); border: 1px solid var(--color-border-subtle, #4b5563); border-radius: 4px; padding: 4px 8px; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="graphSearchInput" placeholder="Filter nodes..." style="background: transparent; border: none; outline: none; color: #fff; font-size: 11px; width: 100%;" />
          </div>

          <!-- Filter Toggles -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
              <input type="checkbox" id="toggleGhostNotes" checked style="accent-color: var(--color-accent, #00e5ff);" />
              <span>Show Ghost Notes (Unresolved)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
              <input type="checkbox" id="toggleOrphanNotes" checked style="accent-color: var(--color-accent, #00e5ff);" />
              <span>Show Orphan Notes (0 links)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
              <input type="checkbox" id="toggleTags" checked style="accent-color: #a855f7;" />
              <span>Show Tags (#tag)</span>
            </label>
          </div>

          <!-- Collapsible Physics Tuning -->
          <details style="margin-top: 2px;">
            <summary style="cursor: pointer; font-weight: 600; color: var(--color-accent, #00e5ff); user-select: none;">Physics Forces</summary>
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Repulsion</span>
                  <span id="repulsionVal">-220</span>
                </div>
                <input type="range" id="sliderRepulsion" min="50" max="600" value="220" style="width: 100%;" />
              </div>
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Link Distance</span>
                  <span id="linkDistVal">75</span>
                </div>
                <input type="range" id="sliderLinkDist" min="30" max="180" value="75" style="width: 100%;" />
              </div>
              <div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Center Gravity</span>
                  <span id="gravityVal">0.04</span>
                </div>
                <input type="range" id="sliderGravity" min="1" max="15" value="4" style="width: 100%;" />
              </div>
            </div>
          </details>
        </div>

        <!-- Canvas Element -->
        <canvas id="graphViewCanvas" style="width: 100%; height: 100%; display: block;"></canvas>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;
    this.canvas = overlay.querySelector('#graphViewCanvas');

    // Initialize Engine
    this.engine = new ForceGraphEngine(this.canvas, {
      tooltipContainer: overlay,
      onNodeClick: (node) => this.handleNodeClick(node),
    });

    // Sync active document highlight
    const activeDoc = documentStateManager.getActiveDocument();
    if (activeDoc) {
      this.engine.setActiveNode(activeDoc.path || activeDoc.id);
    }

    // Attach Dialog Event Listeners
    this.attachModalEvents(overlay);

    // Build or fetch latest graph data
    const data = await graphIndexService.buildGraph({ includeTags: true });
    this.engine.setData(data);
    this.updateStats();

    // Auto fit after initial layout settles slightly
    setTimeout(() => {
      if (this.engine) this.engine.fitView(70);
    }, 120);

    // Resize handling
    if (typeof ResizeObserver !== 'undefined') {
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

    // Search filter
    const searchInput = overlay.querySelector('#graphSearchInput');
    searchInput?.addEventListener('input', (e) => {
      if (this.engine) {
        this.engine.searchQuery = e.target.value;
        this.engine.requestRender();
        this.updateStats();
      }
    });

    // Toggles
    const toggleGhost = overlay.querySelector('#toggleGhostNotes');
    toggleGhost?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showGhostNotes = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
      }
    });

    const toggleOrphan = overlay.querySelector('#toggleOrphanNotes');
    toggleOrphan?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showOrphanNotes = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
      }
    });

    const toggleTags = overlay.querySelector('#toggleTags');
    toggleTags?.addEventListener('change', (e) => {
      if (this.engine) {
        this.engine.showTags = e.target.checked;
        this.engine.requestRender();
        this.updateStats();
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
      }
    });
  }

  updateStats() {
    if (!this.modalEl || !this.engine) return;
    const badge = this.modalEl.querySelector('#graphStatsBadge');
    if (!badge) return;

    const visibleNodes = this.engine.getVisibleNodes();
    const visibleEdges = this.engine.getVisibleEdges(visibleNodes);
    badge.textContent = `${visibleNodes.length} Nodes • ${visibleEdges.length} Links`;
  }

  async handleNodeClick(node) {
    if (!node) return;

    if (node.isTag) {
      // Filter graph by tag
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
      // Prompt/create ghost note and open
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
        // Fallback in-memory doc
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
