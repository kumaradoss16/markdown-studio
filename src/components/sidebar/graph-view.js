import { workspaceManager } from '../../core/workspace-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { graphIndexService } from '../../services/graph-index-service.js';
import { AppEvents, eventBus } from '../../app/events.js';

/**
 * Interactive Local Knowledge Graph View in Sidebar.
 * Displays the current note's 1-hop bi-directional neighborhood dynamically.
 */
export class GraphViewComponent {
  constructor(container) {
    this.container = container;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, () => this.drawGraph());
    eventBus.on(AppEvents.GRAPH_UPDATED, () => this.drawGraph());
    eventBus.on(AppEvents.DOCUMENT_SAVED, () => this.drawGraph());
  }

  render() {
    this.container.innerHTML = `
      <div class="graph-view-card">
        <div class="graph-view-header" style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 8px; color: var(--color-accent, #00e5ff);">●</span>
            <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.04em;">GRAPH VIEW</span>
            <span id="sidebarGraphNodeCount" style="font-size: 9px; color: var(--color-text-muted);">Local</span>
          </div>
          <button id="sidebarExpandGraphBtn" class="header-btn" style="padding: 2px 4px; font-size: 10px;" title="Open Global Graph (⌘G)" aria-label="Expand Graph">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
        </div>
        <svg class="graph-view-canvas" viewBox="0 0 280 160" style="background: rgba(0, 0, 0, 0.2); border-radius: 4px; width: 100%; height: 160px; display: block; overflow: hidden;">
          <defs>
            <radialGradient id="sidebarNodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="var(--color-accent, #00e5ff)" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="var(--color-accent, #00e5ff)" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <g id="sidebarGraphEdges" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2"></g>
          <g id="sidebarGraphNodes"></g>
        </svg>
      </div>
    `;

    this.container.querySelector('#sidebarExpandGraphBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.GRAPH_OPEN_REQUESTED);
    });

    this.drawGraph();
  }

  async drawGraph() {
    const edgesGroup = this.container.querySelector('#sidebarGraphEdges');
    const nodesGroup = this.container.querySelector('#sidebarGraphNodes');
    const countBadge = this.container.querySelector('#sidebarGraphNodeCount');
    if (!edgesGroup || !nodesGroup) return;

    const activeDoc = documentStateManager.getActiveDocument();
    let localData = null;

    if (activeDoc && activeDoc.path) {
      localData = graphIndexService.getLocalNeighborhood(activeDoc.path, 1);
    }

    // Fallback: if no active document or isolated, use top degree workspace nodes
    if (!localData || localData.nodes.length === 0) {
      if (graphIndexService.graphData.nodes.length > 0) {
        const topNode = [...graphIndexService.graphData.nodes]
          .filter(n => !n.isGhost && !n.isTag)
          .sort((a, b) => (b.degree || 0) - (a.degree || 0))[0];
        if (topNode) {
          localData = graphIndexService.getLocalNeighborhood(topNode.id, 1);
        }
      }
    }

    if (!localData || localData.nodes.length === 0) {
      // Empty state
      if (countBadge) countBadge.textContent = '0 Nodes';
      edgesGroup.innerHTML = '';
      nodesGroup.innerHTML = `
        <text x="140" y="85" font-family="var(--font-ui, sans-serif)" font-size="10" fill="var(--color-text-muted)" text-anchor="middle">
          No linked notes detected
        </text>
      `;
      return;
    }

    const centerId = activeDoc?.path || localData.nodes[0]?.id;
    const centerNode = localData.nodes.find(n => n.id === centerId) || localData.nodes[0];
    const neighbors = localData.nodes.filter(n => n.id !== centerNode.id);

    if (countBadge) {
      countBadge.textContent = `Local (${localData.nodes.length} Nodes)`;
    }

    // Layout coordinates in radial pattern
    const cx = 140;
    const cy = 80;
    const positions = new Map();
    positions.set(centerNode.id, { x: cx, y: cy, isCenter: true, node: centerNode });

    const radius = 56;
    const totalNeighbors = neighbors.length;
    neighbors.forEach((n, idx) => {
      const angle = (idx / Math.max(1, totalNeighbors)) * Math.PI * 2 - Math.PI / 2;
      positions.set(n.id, {
        x: Math.round(cx + Math.cos(angle) * radius),
        y: Math.round(cy + Math.sin(angle) * radius),
        isCenter: false,
        node: n,
      });
    });

    // Draw edges
    let edgesHtml = '';
    for (const edge of localData.edges) {
      const sId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const p1 = positions.get(sId);
      const p2 = positions.get(tId);
      if (p1 && p2) {
        const isGhost = edge.isGhost;
        const isTag = edge.type === 'tag';
        const stroke = isGhost ? 'rgba(148, 163, 184, 0.3)' : (isTag ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.2)');
        const dash = isGhost ? 'stroke-dasharray="2,2"' : (isTag ? 'stroke-dasharray="1.5,2"' : '');
        edgesHtml += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" ${dash} />`;
      }
    }
    edgesGroup.innerHTML = edgesHtml;

    // Draw nodes
    let nodesHtml = '';
    for (const [id, pos] of positions.entries()) {
      const n = pos.node;
      const isCenter = pos.isCenter;
      const r = isCenter ? 6.5 : (n.isTag ? 4 : (n.isGhost ? 4.5 : 5));
      const fill = isCenter
        ? 'var(--color-accent, #00e5ff)'
        : (n.isTag ? '#a855f7' : (n.isGhost ? 'rgba(148, 163, 184, 0.25)' : '#38bdf8'));
      const stroke = isCenter ? '#ffffff' : (n.isGhost ? '#94a3b8' : '#ffffff');
      const dash = n.isGhost ? 'stroke-dasharray="2,2"' : '';
      const textFill = isCenter ? '#ffffff' : (n.isGhost ? '#94a3b8' : '#cbd5e1');
      const label = n.label.length > 13 ? `${n.label.slice(0, 11)}…` : n.label;

      nodesHtml += `
        <g class="graph-node-item" data-id="${n.id}" data-ghost="${n.isGhost ? '1' : '0'}" style="cursor: pointer;">
          ${isCenter ? `<circle cx="${pos.x}" cy="${pos.y}" r="15" fill="url(#sidebarNodeGlow)" />` : ''}
          <circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" ${dash} />
          <text x="${pos.x}" y="${pos.y + (isCenter ? 14 : 11)}" 
                font-family="var(--font-ui, -apple-system, sans-serif)" font-size="${isCenter ? '9.5' : '8'}" 
                font-weight="${isCenter ? '700' : '500'}" 
                fill="${textFill}" text-anchor="middle">${label}</text>
        </g>
      `;
    }
    nodesGroup.innerHTML = nodesHtml;

    // Click handler to open notes
    nodesGroup.querySelectorAll('.graph-node-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const isGhost = el.getAttribute('data-ghost') === '1';

        if (isGhost) {
          eventBus.emit(AppEvents.GRAPH_OPEN_REQUESTED);
          return;
        }

        try {
          const openDoc = documentStateManager.getOpenDocuments().find(d => d.path === id);
          if (openDoc) {
            documentStateManager.setActiveDocument(openDoc.id);
          } else {
            const fileData = await fileSystemService.readFile(id);
            documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
          }
        } catch (err) {
          console.warn('Could not open file from sidebar graph:', err);
        }
      });
    });
  }
}
