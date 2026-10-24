/**
 * ForceGraphEngine
 * Zero-dependency HTML5 Canvas 2D Force-Directed Graph Engine.
 * Features:
 *  - Coulomb node repulsion, Hooke link attraction, center gravity, soft collision avoidance
 *  - Velocity-Verlet / Euler numerical integration with damping & alpha cooling
 *  - Automatic idle sleep (alpha < 0.005) saving 100% CPU/GPU when quiescent
 *  - High-DPI crisp rendering with coordinate transforms
 *  - Smooth Zoom & Pan (mouse wheel centered at cursor, drag background)
 *  - Node dragging and pinning with instant reheat
 *  - Interactive 1-hop neighbor highlighting & non-neighbor dimming
 *  - Floating tooltip with node details, degree, and path
 *  - Dynamic CSS token styling (responds to studio accent and theme changes)
 *  - Filtering (search query, ghost notes, orphan nodes, tag nodes)
 */

export class ForceGraphEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options]
   * @param {(node: any) => void} [options.onNodeClick]
   * @param {HTMLElement} [options.tooltipContainer]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onNodeClick = options.onNodeClick || null;
    this.tooltipContainer = options.tooltipContainer || document.body;

    // Dimensions & Scale
    this.width = canvas.clientWidth || 800;
    this.height = canvas.clientHeight || 600;
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    // Graph Data
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.adjacency = new Map();

    // Viewport Transform
    this.transform = { x: 0, y: 0, k: 1 };

    // Physics Simulation Parameters
    this.charge = -220; // Repulsion
    this.linkDistance = 75; // Spring rest length
    this.gravity = 0.04; // Center pull
    this.damping = 0.86; // Velocity friction
    this.alpha = 1.0; // Current temperature
    this.alphaDecay = 0.985; // Cooling factor
    this.alphaMin = 0.005; // Sleep threshold
    this.isSleeping = false;
    this.animFrameId = null;

    // Filters
    this.searchQuery = '';
    this.showGhostNotes = true;
    this.showOrphanNotes = true;
    this.showTags = true;

    // Interaction State
    this.hoveredNode = null;
    this.draggedNode = null;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.mouseDownPos = { x: 0, y: 0 };
    this.activeNodeId = null; // Currently open document in editor

    // Tooltip Element
    this.tooltipEl = null;
    this.initTooltip();

    // Bind Event Handlers
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnResize = this.resize.bind(this);

    this.attachEventListeners();
    this.resize();
  }

  initTooltip() {
    if (typeof document === 'undefined') return;
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'graph-tooltip';
    this.tooltipEl.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10001;
      display: none;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid var(--color-border-subtle, #334155);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: var(--font-ui, -apple-system, sans-serif);
      font-size: 11px;
      color: #f8fafc;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      backdrop-filter: blur(6px);
      max-width: 280px;
    `;
    this.tooltipContainer.appendChild(this.tooltipEl);
  }

  attachEventListeners() {
    this.canvas.addEventListener('mousedown', this.boundOnMouseDown);
    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);
    this.canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
    window.addEventListener('resize', this.boundOnResize);
  }

  destroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
    this.canvas.removeEventListener('wheel', this.boundOnWheel);
    window.removeEventListener('resize', this.boundOnResize);
    if (this.tooltipEl && this.tooltipEl.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || this.canvas.parentElement?.clientWidth || 800;
    this.height = rect.height || this.canvas.parentElement?.clientHeight || 600;
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.requestRender();
  }

  /**
   * Sets graph data and initializes node positions if unassigned.
   * @param {{ nodes: any[], edges: any[], nodeMap?: Map<string, any>, adjacency?: Map<string, Set<string>> }} data
   */
  setData(data) {
    const existingPos = new Map();
    for (const n of this.nodes) {
      existingPos.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy, fx: n.fx, fy: n.fy });
    }

    const cx = this.width / 2;
    const cy = this.height / 2;

    this.nodes = (data.nodes || []).map((n, i) => {
      const prev = existingPos.get(n.id);
      const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
      const radius = 60 + Math.random() * 120;
      return {
        ...n,
        x: prev ? prev.x : (n.x !== undefined ? n.x : cx + Math.cos(angle) * radius),
        y: prev ? prev.y : (n.y !== undefined ? n.y : cy + Math.sin(angle) * radius),
        vx: prev ? prev.vx : (n.vx !== undefined ? n.vx : 0),
        vy: prev ? prev.vy : (n.vy !== undefined ? n.vy : 0),
        fx: prev ? prev.fx : (n.fx !== undefined ? n.fx : null),
        fy: prev ? prev.fy : (n.fy !== undefined ? n.fy : null),
      };
    });

    this.edges = data.edges || [];
    this.nodeMap = new Map();
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
    }

    if (data.adjacency) {
      this.adjacency = data.adjacency;
    } else {
      this.adjacency = new Map();
      for (const e of this.edges) {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        if (!this.adjacency.has(s)) this.adjacency.set(s, new Set());
        if (!this.adjacency.has(t)) this.adjacency.set(t, new Set());
        this.adjacency.get(s).add(t);
        this.adjacency.get(t).add(s);
      }
    }

    this.reheat(0.85);
  }

  setActiveNode(docPathOrId) {
    this.activeNodeId = docPathOrId;
    this.requestRender();
  }

  // Filter Getters
  getVisibleNodes() {
    const q = this.searchQuery.trim().toLowerCase();
    return this.nodes.filter(node => {
      if (!this.showGhostNotes && node.isGhost) return false;
      if (!this.showTags && node.isTag) return false;
      if (!this.showOrphanNotes && !node.isTag && node.degree === 0) return false;
      if (q) {
        const matchesLabel = (node.label || '').toLowerCase().includes(q);
        const matchesPath = (node.path || '').toLowerCase().includes(q);
        const matchesTags = (node.tags || []).some(t => t.toLowerCase().includes(q));
        if (!matchesLabel && !matchesPath && !matchesTags) return false;
      }
      return true;
    });
  }

  getVisibleEdges(visibleNodes) {
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    return this.edges.filter(e => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });
  }

  /**
   * Physics simulation step using Velocity-Verlet & Coulomb-Hooke laws.
   */
  step() {
    if (this.isSleeping) return false;

    const visibleNodes = this.getVisibleNodes();
    const visibleEdges = this.getVisibleEdges(visibleNodes);
    const n = visibleNodes.length;

    if (n === 0) {
      this.isSleeping = true;
      return false;
    }

    const cx = this.width / 2;
    const cy = this.height / 2;

    // 1. Center gravity pull
    for (let i = 0; i < n; i++) {
      const node = visibleNodes[i];
      if (node.fx !== null && node.fx !== undefined) continue;
      const dx = cx - node.x;
      const dy = cy - node.y;
      node.vx += dx * this.gravity * this.alpha;
      node.vy += dy * this.gravity * this.alpha;
    }

    // 2. Node-node repulsion (Coulomb's Law with cutoff)
    for (let i = 0; i < n; i++) {
      const n1 = visibleNodes[i];
      for (let j = i + 1; j < n; j++) {
        const n2 = visibleNodes[j];
        let dx = n2.x - n1.x;
        let dy = n2.y - n1.y;
        let distSq = dx * dx + dy * dy;

        if (distSq < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          distSq = dx * dx + dy * dy;
        }

        const dist = Math.sqrt(distSq);
        const force = (this.charge / (distSq + 120)) * this.alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (n1.fx === null || n1.fx === undefined) {
          n1.vx += fx;
          n1.vy += fy;
        }
        if (n2.fx === null || n2.fx === undefined) {
          n2.vx -= fx;
          n2.vy -= fy;
        }

        // Soft collision buffer
        const minDist = (n1.radius || 6) + (n2.radius || 6) + 4;
        if (dist < minDist) {
          const overlap = (minDist - dist) * 0.45 * this.alpha;
          const colFx = (dx / dist) * overlap;
          const colFy = (dy / dist) * overlap;
          if (n1.fx === null || n1.fx === undefined) {
            n1.vx -= colFx;
            n1.vy -= colFy;
          }
          if (n2.fx === null || n2.fx === undefined) {
            n2.vx += colFx;
            n2.vy += colFy;
          }
        }
      }
    }

    // 3. Link spring attraction (Hooke's Law)
    for (const edge of visibleEdges) {
      const source = typeof edge.source === 'object' ? edge.source : this.nodeMap.get(edge.source);
      const target = typeof edge.target === 'object' ? edge.target : this.nodeMap.get(edge.target);
      if (!source || !target) continue;

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) dist = 0.1;

      const displacement = dist - this.linkDistance;
      const springForce = displacement * 0.045 * this.alpha;
      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      if (source.fx === null || source.fx === undefined) {
        source.vx += fx;
        source.vy += fy;
      }
      if (target.fx === null || target.fx === undefined) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }

    // 4. Position & velocity update with friction
    let maxVelocity = 0;
    for (let i = 0; i < n; i++) {
      const node = visibleNodes[i];
      if (node.fx !== null && node.fx !== undefined) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
      } else {
        node.vx *= this.damping;
        node.vy *= this.damping;
        node.x += node.vx;
        node.y += node.vy;
        const v = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (v > maxVelocity) maxVelocity = v;
      }
    }

    // 5. Alpha cooling decay & sleep condition
    this.alpha *= this.alphaDecay;
    if (this.alpha < this.alphaMin && maxVelocity < 0.2) {
      this.isSleeping = true;
    }

    return true;
  }

  reheat(targetAlpha = 0.7) {
    this.alpha = Math.max(this.alpha, targetAlpha);
    this.isSleeping = false;
    this.startLoop();
  }

  startLoop() {
    if (this.animFrameId) return;
    const loop = () => {
      this.step();
      this.render();
      if (!this.isSleeping) {
        this.animFrameId = requestAnimationFrame(loop);
      } else {
        this.animFrameId = null;
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  requestRender() {
    if (this.isSleeping) {
      this.render();
    } else {
      this.startLoop();
    }
  }

  // Coordinate transforms
  screenToWorld(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = sx - rect.left;
    const canvasY = sy - rect.top;
    return {
      x: (canvasX - this.transform.x) / this.transform.k,
      y: (canvasY - this.transform.y) / this.transform.k
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.transform.k + this.transform.x,
      y: wy * this.transform.k + this.transform.y
    };
  }

  getNodeAt(sx, sy) {
    const { x, y } = this.screenToWorld(sx, sy);
    const visibleNodes = this.getVisibleNodes();
    for (let i = visibleNodes.length - 1; i >= 0; i--) {
      const node = visibleNodes[i];
      const dx = node.x - x;
      const dy = node.y - y;
      const hitRadius = (node.radius || 6) + 6 / this.transform.k;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }
    return null;
  }

  // Mouse Interactivity
  onMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    this.mouseDownPos = { x: e.clientX, y: e.clientY };
    const node = this.getNodeAt(e.clientX, e.clientY);

    if (node) {
      this.draggedNode = node;
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      node.fx = worldPos.x;
      node.fy = worldPos.y;
      this.reheat(0.4);
    } else {
      this.isPanning = true;
      this.panStart = {
        x: e.clientX - this.transform.x,
        y: e.clientY - this.transform.y,
      };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  onMouseMove(e) {
    if (this.draggedNode) {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      this.draggedNode.fx = worldPos.x;
      this.draggedNode.fy = worldPos.y;
      this.reheat(0.3);
      return;
    }

    if (this.isPanning) {
      this.transform.x = e.clientX - this.panStart.x;
      this.transform.y = e.clientY - this.panStart.y;
      this.requestRender();
      return;
    }

    // Hover inspection
    const node = this.getNodeAt(e.clientX, e.clientY);
    if (node !== this.hoveredNode) {
      this.hoveredNode = node;
      if (node) {
        this.canvas.style.cursor = 'pointer';
        this.showTooltip(node, e.clientX, e.clientY);
      } else {
        this.canvas.style.cursor = 'default';
        this.hideTooltip();
      }
      this.requestRender();
    } else if (node && this.tooltipEl) {
      this.updateTooltipPos(e.clientX, e.clientY);
    }
  }

  onMouseUp(e) {
    if (this.draggedNode) {
      this.draggedNode.fx = null;
      this.draggedNode.fy = null;
      this.draggedNode = null;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'default';
    }

    // Check if this was a click rather than a pan/drag
    const dx = e.clientX - this.mouseDownPos.x;
    const dy = e.clientY - this.mouseDownPos.y;
    if (dx * dx + dy * dy < 25) {
      const clickedNode = this.getNodeAt(e.clientX, e.clientY);
      if (clickedNode && this.onNodeClick) {
        this.onNodeClick(clickedNode);
      }
    }
  }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newK = Math.max(0.15, Math.min(4.5, this.transform.k * zoomFactor));

    // Keep mouse pointer centered in world coordinates
    this.transform.x = mouseX - (mouseX - this.transform.x) * (newK / this.transform.k);
    this.transform.y = mouseY - (mouseY - this.transform.y) * (newK / this.transform.k);
    this.transform.k = newK;

    this.requestRender();
  }

  // Tooltip
  showTooltip(node, clientX, clientY) {
    if (!this.tooltipEl) return;
    const groupBadge = node.isGhost ? 'Ghost Note' : (node.isTag ? 'Tag' : node.group || 'Document');
    const tagsHtml = (node.tags && node.tags.length > 0)
      ? `<div style="margin-top: 4px; color: #a855f7;">${node.tags.map(t => `#${t}`).join(' ')}</div>`
      : '';

    this.tooltipEl.innerHTML = `
      <div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${node.label}</div>
      <div style="font-size: 10px; color: var(--color-text-muted, #94a3b8);">${node.path || ''}</div>
      <div style="margin-top: 5px; display: flex; gap: 8px; font-size: 10px;">
        <span style="color: var(--color-accent, #00e5ff);">● ${groupBadge}</span>
        <span>In: ${node.inDegree || 0}</span>
        <span>Out: ${node.outDegree || 0}</span>
      </div>
      ${tagsHtml}
    `;
    this.tooltipEl.style.display = 'block';
    this.updateTooltipPos(clientX, clientY);
  }

  updateTooltipPos(clientX, clientY) {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.left = `${clientX + 14}px`;
    this.tooltipEl.style.top = `${clientY + 10}px`;
  }

  hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * Centers and zooms the viewport to cleanly fit all visible nodes.
   * @param {number} [padding=60]
   */
  fitView(padding = 60) {
    const visibleNodes = this.getVisibleNodes();
    if (visibleNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of visibleNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const graphW = Math.max(maxX - minX, 40);
    const graphH = Math.max(maxY - minY, 40);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const availW = this.width - padding * 2;
    const availH = this.height - padding * 2;
    const k = Math.min(availW / graphW, availH / graphH, 2.2);
    const clampedK = Math.max(0.2, Math.min(k, 1.8));

    this.transform.k = clampedK;
    this.transform.x = this.width / 2 - centerX * clampedK;
    this.transform.y = this.height / 2 - centerY * clampedK;

    this.requestRender();
  }

  /**
   * Main Canvas render method.
   */
  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply High DPI scaling & transform
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    const visibleNodes = this.getVisibleNodes();
    const visibleEdges = this.getVisibleEdges(visibleNodes);

    // Retrieve active theme accent color from DOM
    let accentColor = '#00e5ff';
    let accentColorSoft = 'rgba(0, 229, 255, 0.4)';
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const computed = window.getComputedStyle(document.documentElement);
      accentColor = computed.getPropertyValue('--color-accent')?.trim() ||
                    computed.getPropertyValue('--color-accent-cyan')?.trim() || '#00e5ff';
      accentColorSoft = computed.getPropertyValue('--color-accent-soft')?.trim() || 'rgba(0, 229, 255, 0.4)';
    }

    // Determine neighbor set if hovering
    const hoveredId = this.hoveredNode ? this.hoveredNode.id : null;
    let neighborSet = null;
    if (hoveredId) {
      neighborSet = this.adjacency.get(hoveredId) || new Set();
    }

    // 1. Draw Edges
    for (const edge of visibleEdges) {
      const source = typeof edge.source === 'object' ? edge.source : this.nodeMap.get(edge.source);
      const target = typeof edge.target === 'object' ? edge.target : this.nodeMap.get(edge.target);
      if (!source || !target) continue;

      const isConnectedToHover = hoveredId && (source.id === hoveredId || target.id === hoveredId);
      const isDimmed = hoveredId && !isConnectedToHover;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (isConnectedToHover) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.0 / this.transform.k;
        ctx.globalAlpha = 0.95;
      } else if (isDimmed) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.8 / this.transform.k;
        ctx.globalAlpha = 0.15;
      } else {
        if (edge.isGhost) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
          ctx.setLineDash([3, 3]);
        } else if (edge.type === 'tag') {
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
          ctx.setLineDash([1.5, 3]);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        }
        ctx.lineWidth = 1.0 / this.transform.k;
        ctx.globalAlpha = 0.75;
      }

      ctx.stroke();

      // Directional arrow indicator
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 18) {
        const arrowDist = dist - (target.radius || 6) - 3;
        const arrowX = source.x + (dx / dist) * arrowDist;
        const arrowY = source.y + (dy / dist) * arrowDist;
        const angle = Math.atan2(dy, dx);
        const arrowSize = Math.max(3, 4.5 / this.transform.k);

        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }

    // 2. Draw Nodes
    for (const node of visibleNodes) {
      const isHovered = hoveredId === node.id;
      const isNeighbor = neighborSet && neighborSet.has(node.id);
      const isDimmed = hoveredId && !isHovered && !isNeighbor;
      const isActiveDoc = this.activeNodeId && (node.id === this.activeNodeId || node.path === this.activeNodeId);

      const r = (node.radius || 6);

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.15;
      }

      // Outer Glow for Hovered or Active Node
      if (isHovered || isActiveDoc) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = isHovered ? 0.35 : 0.2;
        ctx.fill();
        ctx.globalAlpha = isDimmed ? 0.15 : 1.0;
      }

      // Base Node Fill & Stroke
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (node.isTag) {
        ctx.fillStyle = '#a855f7'; // Purple for tags
        ctx.fill();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.2 / this.transform.k;
        ctx.stroke();
      } else if (node.isGhost) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1.2 / this.transform.k;
        ctx.stroke();
      } else {
        // Real Note
        if (isActiveDoc) {
          ctx.fillStyle = accentColor;
        } else {
          ctx.fillStyle = isHovered ? accentColor : (accentColorSoft || accentColor);
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 / this.transform.k;
        ctx.stroke();
      }

      // 3. Node Labels
      const shouldDrawLabel = isHovered || isNeighbor || isActiveDoc || (node.degree > 1 && this.transform.k > 0.65) || this.transform.k > 1.1;
      if (shouldDrawLabel) {
        const fontSize = Math.max(9, Math.min(13, 11 / Math.sqrt(this.transform.k)));
        ctx.font = `${isHovered || isActiveDoc ? '600' : '500'} ${fontSize}px var(--font-ui, -apple-system, sans-serif)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        if (node.isGhost) {
          ctx.fillStyle = '#94a3b8';
        } else if (node.isTag) {
          ctx.fillStyle = '#e9d5ff';
        } else if (isHovered || isActiveDoc) {
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillStyle = '#cbd5e1';
        }

        ctx.fillText(node.label, node.x, node.y + r + 4);
      }

      ctx.restore();
    }

    ctx.restore();
  }
}
