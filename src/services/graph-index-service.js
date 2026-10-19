import { AppEvents, eventBus } from '../app/events.js';
import { documentStateManager } from '../core/document-state-manager.js';
import { fileSystemService } from './filesystem-service.js';
import { workspaceManager } from '../core/workspace-manager.js';
import { resolveWorkspacePath } from './project-link-checker.js';

/**
 * @typedef {Object} GraphNode
 * @property {string} id - Unique identifier (workspace file path, ghost ID, or tag ID)
 * @property {string} label - Display label (note title or filename without extension)
 * @property {string} path - Workspace file path or reference target
 * @property {string} group - Category / Folder name or 'ghost' or 'tag'
 * @property {number} inDegree - Number of incoming links
 * @property {number} outDegree - Number of outgoing links
 * @property {number} degree - Total degree (inDegree + outDegree)
 * @property {number} radius - Calculated visual radius based on degree
 * @property {boolean} isGhost - True if target note does not exist on disk
 * @property {boolean} isTag - True if this node represents a hashtag
 * @property {string[]} tags - List of inline/frontmatter tags associated with this note
 * @property {number} [x] - Physics X coordinate
 * @property {number} [y] - Physics Y coordinate
 * @property {number} [vx] - Physics velocity X
 * @property {number} [vy] - Physics velocity Y
 * @property {number | null} [fx] - Fixed / pinned X
 * @property {number | null} [fy] - Fixed / pinned Y
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} id - Unique edge identifier ("source->target")
 * @property {string | GraphNode} source - Source node ID or node object reference
 * @property {string | GraphNode} target - Target node ID or node object reference
 * @property {string} [label] - Optional link alias or anchor text
 * @property {'wikilink' | 'markdown' | 'tag'} type - Connection type
 * @property {boolean} isGhost - True if pointing to an unresolved node
 */

/**
 * @typedef {Object} GraphData
 * @property {GraphNode[]} nodes - List of graph nodes
 * @property {GraphEdge[]} edges - List of directed connections
 * @property {Map<string, GraphNode>} nodeMap - Lookup map by ID
 * @property {Map<string, Set<string>>} adjacency - Bi-directional adjacency list
 */

export class GraphIndexService {
  constructor() {
    this.graphData = {
      nodes: [],
      edges: [],
      nodeMap: new Map(),
      adjacency: new Map(),
    };
    this.debounceTimer = null;
    this.isIndexing = false;
  }

  /**
   * Strips code blocks and inline code from markdown content to avoid false-positive link parsing.
   * @param {string} content
   * @returns {string}
   */
  stripCodeBlocks(content) {
    if (!content) return '';
    return content
      .replace(/```[\s\S]*?```/g, '') // Fenced code blocks
      .replace(/`[^`\n]+`/g, ''); // Inline code snippets
  }

  /**
   * Extracts WikiLinks, relative Markdown links, and hashtags from raw markdown content.
   * @param {string} content
   * @param {string} sourcePath
   * @returns {{ links: Array<{ target: string, label?: string, type: 'wikilink' | 'markdown' }>, tags: string[] }}
   */
  extractLinksAndTags(content, sourcePath = '') {
    if (!content) return { links: [], tags: [] };
    const cleanContent = this.stripCodeBlocks(content);
    const links = [];
    const tagsSet = new Set();

    // 1. Extract frontmatter tags: tags: [a, b] or tags:\n - a
    const fmMatch = cleanContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const inlineTagsMatch = fm.match(/tags:\s*\[(.*?)\]/i);
      if (inlineTagsMatch) {
        inlineTagsMatch[1].split(',').forEach(t => {
          const clean = t.trim().replace(/^#/, '');
          if (clean) tagsSet.add(clean.toLowerCase());
        });
      } else {
        const listTagsMatch = fm.match(/tags:\s*\r?\n((?:\s*-\s*.*?\r?\n?)+)/i);
        if (listTagsMatch) {
          listTagsMatch[1].split('\n').forEach(line => {
            const m = line.match(/-\s*([a-zA-Z0-9_\-\/]+)/);
            if (m) tagsSet.add(m[1].toLowerCase());
          });
        }
      }
    }

    // 2. Extract WikiLinks: [[Target]], [[Target|Alias]], [[Target#Heading]], [[Target#Heading|Alias]]
    // Avoid image embeds ![[...]]
    const wikiRegex = /(?<!!)(?:\[\[)([^\]|#\r\n]+)(?:#([^\]|\r\n]+))?(?:\|([^\]\r\n]+))?\]\]/g;
    let match;
    while ((match = wikiRegex.exec(cleanContent)) !== null) {
      const rawTarget = match[1].trim();
      const alias = match[3] ? match[3].trim() : (match[2] ? match[2].trim() : '');
      if (rawTarget) {
        links.push({
          target: rawTarget,
          label: alias || rawTarget,
          type: 'wikilink'
        });
      }
    }

    // 3. Extract Markdown Links: [Label](path/to/target.md)
    // Avoid web URLs (http, https, mailto) and pure anchor links (#section)
    const mdRegex = /(?<!!)(?:\[([^\]\r\n]+)\])\((?!https?:\/\/|mailto:|#)([^)\r\n]+)\)/g;
    while ((match = mdRegex.exec(cleanContent)) !== null) {
      const label = match[1].trim();
      const rawHref = match[2].trim().split('#')[0].split('?')[0]; // Remove anchor / query
      if (rawHref && (rawHref.endsWith('.md') || !rawHref.includes('.'))) {
        links.push({
          target: rawHref,
          label,
          type: 'markdown'
        });
      }
    }

    // 4. Extract inline hashtags: #tag (excluding markdown headers # Heading)
    const hashtagRegex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_\-\/]*)(?=\s|$|[.,;:!?])/g;
    while ((match = hashtagRegex.exec(cleanContent)) !== null) {
      const tag = match[1].trim().toLowerCase();
      // Exclude hex colors (e.g. #fff, #00e5ff) or generic single-char noise
      if (!/^[0-9a-f]{3,8}$/i.test(tag) && tag.length >= 2) {
        tagsSet.add(tag);
      }
    }

    return {
      links,
      tags: Array.from(tagsSet)
    };
  }

  /**
   * Scans and builds the complete knowledge graph across all known documents.
   * @param {Object} [options]
   * @param {boolean} [options.includeTags=true] - Whether to create nodes for tags
   * @returns {Promise<GraphData>}
   */
  async buildGraph(options = { includeTags: true }) {
    this.isIndexing = true;

    // Collect all documents: live state manager docs take precedence over disk/virtual storage
    const allFilesMap = new Map(); // path -> content

    // 1. From virtualStorage
    if (fileSystemService && fileSystemService.virtualStorage && fileSystemService.virtualStorage.size > 0) {
      for (const [path, content] of fileSystemService.virtualStorage.entries()) {
        if (path.endsWith('.md')) {
          allFilesMap.set(path, content);
        }
      }
    } else if (workspaceManager && workspaceManager.knowledgeBase) {
      // Fallback only when virtual storage has not been populated
      for (const item of workspaceManager.knowledgeBase) {
        if (item.path && item.path.endsWith('.md') && !allFilesMap.has(item.path)) {
          allFilesMap.set(item.path, '');
        }
      }
    }

    // 3. From open documents in documentStateManager (latest edits)
    const openDocs = documentStateManager.getOpenDocuments();
    for (const doc of openDocs) {
      if (doc.path && doc.path.endsWith('.md')) {
        allFilesMap.set(doc.path, doc.content || '');
      }
    }

    // Build filename index for resolving WikiLinks
    const exactPathSet = new Set(allFilesMap.keys());
    const baseNameMap = new Map(); // "habitat design" -> "ExampleVault/Habitat Design.md"

    for (const fullPath of exactPathSet) {
      const baseName = fullPath.split('/').pop().replace(/\.md$/i, '').toLowerCase();
      baseNameMap.set(baseName, fullPath);
    }

    const nodeMap = new Map();
    const edges = [];
    const adjacency = new Map();

    const getOrCreateAdjacency = (id) => {
      if (!adjacency.has(id)) adjacency.set(id, new Set());
      return adjacency.get(id);
    };

    // 1. Create real document nodes
    for (const [filePath, content] of allFilesMap.entries()) {
      const fileName = filePath.split('/').pop() || filePath;
      const label = fileName.replace(/\.md$/i, '');
      const parts = filePath.split('/');
      const group = parts.length > 1 ? parts[parts.length - 2] : 'Root';

      nodeMap.set(filePath, {
        id: filePath,
        label,
        path: filePath,
        group,
        inDegree: 0,
        outDegree: 0,
        degree: 0,
        radius: 6,
        isGhost: false,
        isTag: false,
        tags: [],
      });
    }

    // 2. Parse links and connect edges
    for (const [sourcePath, content] of allFilesMap.entries()) {
      const sourceNode = nodeMap.get(sourcePath);
      if (!sourceNode) continue;

      const { links, tags } = this.extractLinksAndTags(content, sourcePath);
      sourceNode.tags = tags;

      // Connect document tags if enabled
      if (options.includeTags) {
        for (const tag of tags) {
          const tagId = `tag:#${tag}`;
          if (!nodeMap.has(tagId)) {
            nodeMap.set(tagId, {
              id: tagId,
              label: `#${tag}`,
              path: tagId,
              group: 'Tag',
              inDegree: 0,
              outDegree: 0,
              degree: 0,
              radius: 4,
              isGhost: false,
              isTag: true,
              tags: [],
            });
          }

          const edgeId = `${sourcePath}->${tagId}`;
          edges.push({
            id: edgeId,
            source: sourcePath,
            target: tagId,
            type: 'tag',
            label: `#${tag}`,
            isGhost: false,
          });

          sourceNode.outDegree++;
          nodeMap.get(tagId).inDegree++;
          getOrCreateAdjacency(sourcePath).add(tagId);
          getOrCreateAdjacency(tagId).add(sourcePath);
        }
      }

      // Connect document links
      for (const link of links) {
        let targetPath = null;
        let isGhost = false;

        if (link.type === 'markdown') {
          // Resolve relative path
          const cleanTarget = link.target.endsWith('.md') ? link.target : `${link.target}.md`;
          const { resolved, escapesRoot } = resolveWorkspacePath(sourcePath, cleanTarget);
          if (!escapesRoot && exactPathSet.has(resolved)) {
            targetPath = resolved;
          } else if (baseNameMap.has(link.target.replace(/\.md$/i, '').toLowerCase())) {
            targetPath = baseNameMap.get(link.target.replace(/\.md$/i, '').toLowerCase());
          } else {
            targetPath = resolved;
            isGhost = true;
          }
        } else {
          // WikiLink resolution
          const cleanTarget = link.target.replace(/\.md$/i, '').trim();
          const lower = cleanTarget.toLowerCase();

          if (baseNameMap.has(lower)) {
            targetPath = baseNameMap.get(lower);
          } else if (exactPathSet.has(cleanTarget) || exactPathSet.has(`${cleanTarget}.md`)) {
            targetPath = exactPathSet.has(cleanTarget) ? cleanTarget : `${cleanTarget}.md`;
          } else {
            // Unresolved note -> Ghost Node
            targetPath = `ghost:${cleanTarget}`;
            isGhost = true;
          }
        }

        if (!targetPath) continue;

        // Prevent self-loop link edges
        if (targetPath === sourcePath) continue;

        // Create ghost node if unresolved
        if (isGhost && !nodeMap.has(targetPath)) {
          const ghostLabel = targetPath.startsWith('ghost:') ? targetPath.replace('ghost:', '') : targetPath.split('/').pop()?.replace(/\.md$/i, '') || targetPath;
          nodeMap.set(targetPath, {
            id: targetPath,
            label: ghostLabel,
            path: targetPath,
            group: 'Ghost',
            inDegree: 0,
            outDegree: 0,
            degree: 0,
            radius: 5,
            isGhost: true,
            isTag: false,
            tags: [],
          });
        }

        const targetNode = nodeMap.get(targetPath);
        if (!targetNode) continue;

        const edgeId = `${sourcePath}->${targetPath}`;
        // Deduplicate edges between same source and target
        if (!edges.some(e => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: sourcePath,
            target: targetPath,
            type: link.type,
            label: link.label || targetNode.label,
            isGhost,
          });

          sourceNode.outDegree++;
          targetNode.inDegree++;
          getOrCreateAdjacency(sourcePath).add(targetPath);
          getOrCreateAdjacency(targetPath).add(sourcePath);
        }
      }
    }

    // Compute node degrees and visual sizing
    for (const node of nodeMap.values()) {
      node.degree = node.inDegree + node.outDegree;
      // Degree-based node sizing: baseline 4.5px, max 20px
      if (node.isTag) {
        node.radius = 4;
      } else if (node.isGhost) {
        node.radius = 4.5;
      } else {
        node.radius = Math.max(5, Math.min(22, 5 + Math.sqrt(node.degree) * 2.8));
      }
    }

    this.graphData = {
      nodes: Array.from(nodeMap.values()),
      edges,
      nodeMap,
      adjacency,
    };

    this.isIndexing = false;
    return this.graphData;
  }

  /**
   * Retrieves a filtered local neighborhood subgraph around a center node.
   * @param {string} centerNodeId
   * @param {number} [hops=1]
   * @returns {GraphData}
   */
  getLocalNeighborhood(centerNodeId, hops = 1) {
    if (!centerNodeId || !this.graphData.nodeMap.has(centerNodeId)) {
      return {
        nodes: [],
        edges: [],
        nodeMap: new Map(),
        adjacency: new Map(),
      };
    }

    const includedNodeIds = new Set([centerNodeId]);
    let currentFrontier = new Set([centerNodeId]);

    for (let h = 0; h < hops; h++) {
      const nextFrontier = new Set();
      for (const id of currentFrontier) {
        const neighbors = this.graphData.adjacency.get(id);
        if (neighbors) {
          for (const neighborId of neighbors) {
            if (!includedNodeIds.has(neighborId)) {
              includedNodeIds.add(neighborId);
              nextFrontier.add(neighborId);
            }
          }
        }
      }
      currentFrontier = nextFrontier;
    }

    const filteredNodes = this.graphData.nodes.filter(n => includedNodeIds.has(n.id));
    const filteredEdges = this.graphData.edges.filter(
      e => includedNodeIds.has(typeof e.source === 'object' ? e.source.id : e.source) &&
           includedNodeIds.has(typeof e.target === 'object' ? e.target.id : e.target)
    );

    const filteredNodeMap = new Map();
    for (const node of filteredNodes) {
      filteredNodeMap.set(node.id, node);
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      nodeMap: filteredNodeMap,
      adjacency: this.graphData.adjacency,
    };
  }

  /**
   * Debounced re-indexing triggered by workspace or document modifications.
   * @param {number} [delayMs=250]
   */
  scheduleReindex(delayMs = 250) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      try {
        const data = await this.buildGraph();
        eventBus.emit(AppEvents.GRAPH_UPDATED, data);
      } catch (err) {
        console.warn('Graph re-indexing error:', err);
      }
    }, delayMs);
  }

  /**
   * Sets up reactive event listeners to automatically keep the graph index up to date.
   */
  initAutoSync() {
    eventBus.on(AppEvents.DOCUMENT_CHANGED, () => this.scheduleReindex(300));
    eventBus.on(AppEvents.DOCUMENT_SAVED, () => this.scheduleReindex(100));
    eventBus.on(AppEvents.DOCUMENT_OPENED, () => this.scheduleReindex(150));
    eventBus.on(AppEvents.DOCUMENT_CLOSED, () => this.scheduleReindex(150));
    eventBus.on(AppEvents.WORKSPACE_CHANGED, () => this.scheduleReindex(200));
  }
}

export const graphIndexService = new GraphIndexService();
