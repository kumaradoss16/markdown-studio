import { workspaceManager } from '../../core/workspace-manager.js';
import { fileSystemService } from '../../services/filesystem-service.js';
import { documentStateManager } from '../../core/document-state-manager.js';

/**
 * Interactive SVG/Canvas Graph View matching the reference image
 */
export class GraphViewComponent {
  constructor(container) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = `
      <div class="graph-view-card">
        <div class="graph-view-header">
          <span>● GRAPH VIEW</span>
          <span style="font-size: 9px; color: var(--color-text-muted);">Local (6 Nodes)</span>
        </div>
        <svg class="graph-view-canvas" viewBox="0 0 280 160">
          <defs>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="#00e5ff" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <g id="graphEdges" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.2"></g>
          <g id="graphNodes"></g>
        </svg>
      </div>
    `;

    this.drawGraph();
  }

  drawGraph() {
    const nodes = workspaceManager.graphNodes;
    const edges = workspaceManager.graphEdges;
    const edgesGroup = this.container.querySelector('#graphEdges');
    const nodesGroup = this.container.querySelector('#graphNodes');

    // Draw edges
    let edgesHtml = '';
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        edgesHtml += `<line x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}" />`;
      }
    }
    edgesGroup.innerHTML = edgesHtml;

    // Draw nodes
    let nodesHtml = '';
    for (const node of nodes) {
      const isCenter = node.isCenter;
      const radius = isCenter ? 6 : 4;
      const fillColor = isCenter ? '#00e5ff' : '#38bdf8';
      const textColor = isCenter ? '#ffffff' : '#94a3b8';

      nodesHtml += `
        <g class="graph-node-item" data-id="${node.id}" style="cursor: pointer;">
          ${isCenter ? `<circle cx="${node.x}" cy="${node.y}" r="14" fill="url(#nodeGlow)" />` : ''}
          <circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${fillColor}" />
          <text x="${node.x}" y="${node.y + (isCenter ? 14 : 12)}" 
                font-family="var(--font-editor)" font-size="${isCenter ? '9.5' : '8'}" 
                font-weight="${isCenter ? '700' : '500'}" 
                fill="${textColor}" text-anchor="middle">${node.label}</text>
        </g>
      `;
    }
    nodesGroup.innerHTML = nodesHtml;

    // Node click interactions
    nodesGroup.querySelectorAll('.graph-node-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const targetFile = `ExampleVault/${id.replace('.', '')}.md`;
        try {
          const fileData = await fileSystemService.readFile(targetFile);
          documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
        } catch {
          // Fallback open if file does not exist directly
          documentStateManager.createDocument(`${id}.md`, `# ${id}\n\nDocumentation node for ${id}.`, targetFile);
        }
      });
    });
  }
}
