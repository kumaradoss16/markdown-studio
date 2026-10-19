import { fileSystemAdapter } from '../../services/filesystem-adapter.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { createNodeElement, getNodeIcon } from './tree-node.js';

/**
 * FileTreeComponent
 * Production-ready recursive file explorer with dynamic indentation,
 * non-destructive expand/collapse, active document tracking, keyboard navigation,
 * and optimistic file operations.
 */
export class FileTreeComponent {
  /**
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @param {string} [options.rootPath='ExampleVault']
   */
  constructor(container, options = {}) {
    this.container = container;
    this.rootPath = options.rootPath || 'ExampleVault';
    this.treeData = null;
    this.activePath = null;
    this.focusedPath = null;
    this.expandedPaths = new Set([this.rootPath, `${this.rootPath}/embeds`]);
    this.nodeMap = new Map(); // path -> { node, element, childrenEl }
    this.activeContextMenu = null;

    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      if (doc && doc.path) {
        this.setActivePath(doc.path);
      }
    });

    eventBus.on(AppEvents.WORKSPACE_CHANGED, () => {
      this.refresh();
    });

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

  /**
   * Initializes and renders the file tree.
   */
  async render() {
    this.container.innerHTML = `
      <div class="file-tree-container" tabindex="0" role="tree" aria-label="Filesystem Explorer">
        <div class="file-tree-loading">Loading workspace...</div>
      </div>
    `;

    this.treeEl = this.container.querySelector('.file-tree-container');
    this.attachKeyboardNavigation();
    await this.refresh();
  }

  /**
   * Reloads the tree from the filesystem adapter while preserving expanded state.
   */
  async refresh() {
    try {
      this.treeData = await fileSystemAdapter.readTree(this.rootPath);
      this.nodeMap.clear();

      if (!this.treeEl) return;
      this.treeEl.innerHTML = '';

      if (this.treeData.children && this.treeData.children.length > 0) {
        for (const child of this.treeData.children) {
          this.renderRecursiveNode(child, this.treeEl, 0);
        }
      } else {
        this.treeEl.innerHTML = `<div class="file-tree-empty">No files in workspace</div>`;
      }

      // Restore active highlight
      const activeDoc = documentStateManager.getActiveDocument();
      if (activeDoc && activeDoc.path) {
        this.setActivePath(activeDoc.path);
      }
    } catch (err) {
      if (this.treeEl) {
        this.treeEl.innerHTML = `<div class="file-tree-error">Failed to load tree: ${err.message}</div>`;
      }
    }
  }

  /**
   * Recursively mounts tree nodes and nested containers.
   * @param {import('../../services/filesystem-adapter.js').FileNode} node
   * @param {HTMLElement} parentEl
   * @param {number} depth
   */
  renderRecursiveNode(node, parentEl, depth) {
    const isExpanded = this.expandedPaths.has(node.path);
    const isActive = this.activePath === node.path;

    const nodeEl = createNodeElement(node, depth, isExpanded, isActive);
    parentEl.appendChild(nodeEl);

    let childrenEl = null;

    if (node.type === 'directory') {
      childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';
      childrenEl.style.display = isExpanded ? 'block' : 'none';
      parentEl.appendChild(childrenEl);

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          this.renderRecursiveNode(child, childrenEl, depth + 1);
        }
      }
    }

    // Cache node in map
    this.nodeMap.set(node.path, { node, element: nodeEl, childrenEl, depth });

    // Event binding
    this.attachNodeEvents(node, nodeEl);
  }

  attachNodeEvents(node, nodeEl) {
    // Primary click handler
    nodeEl.addEventListener('click', (e) => {
      // If clicked the more options button, avoid selecting/toggling
      if (e.target.closest('.tree-item-more-btn')) return;

      this.focusNode(node.path);

      if (node.type === 'directory') {
        this.toggleDirectory(node.path);
      } else {
        this.selectFile(node.path);
      }
    });

    // Right-click context menu
    nodeEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.focusNode(node.path);
      this.showContextMenu(e.clientX, e.clientY, node);
    });

    // More options button click
    const moreBtn = nodeEl.querySelector('.tree-item-more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.focusNode(node.path);
        const rect = moreBtn.getBoundingClientRect();
        this.showContextMenu(rect.right + 4, rect.top, node);
      });
    }
  }

  /**
   * Toggles a directory's expanded state without re-rendering the whole tree.
   * @param {string} dirPath
   */
  toggleDirectory(dirPath) {
    const cached = this.nodeMap.get(dirPath);
    if (!cached || !cached.childrenEl) return;

    const willOpen = !this.expandedPaths.has(dirPath);

    if (willOpen) {
      this.expandedPaths.add(dirPath);
      cached.childrenEl.style.display = 'block';
      cached.element.classList.add('expanded');
    } else {
      this.expandedPaths.delete(dirPath);
      cached.childrenEl.style.display = 'none';
      cached.element.classList.remove('expanded');
    }

    // Update chevron rotation and folder icon
    const chevron = cached.element.querySelector('.tree-chevron');
    if (chevron) {
      chevron.classList.toggle('rotated', willOpen);
    }
    const iconContainer = cached.element.querySelector('.tree-icon-container');
    if (iconContainer) {
      iconContainer.innerHTML = getNodeIcon(cached.node, willOpen);
    }
  }

  /**
   * Activates a file and triggers document load in CodeMirror.
   * @param {string} filePath
   */
  async selectFile(filePath) {
    this.setActivePath(filePath);

    try {
      const fileData = await fileSystemAdapter.readFile(filePath);
      const hash = 'disk-' + Date.now();
      documentStateManager.openDocument(fileData.path, fileData.content, hash);
    } catch {
      const name = filePath.split('/').pop() || 'Untitled.md';
      documentStateManager.createDocument(name, '', filePath);
    }
  }

  /**
   * Highlights the active file in the tree DOM.
   * @param {string} filePath
   */
  setActivePath(filePath) {
    this.activePath = filePath;
    this.focusedPath = filePath;

    for (const [path, entry] of this.nodeMap.entries()) {
      if (path === filePath) {
        entry.element.classList.add('active');
        this.ensureNodeVisible(filePath);
      } else {
        entry.element.classList.remove('active');
      }
    }
  }

  /**
   * Highlights focused node during keyboard navigation.
   * @param {string} path
   */
  focusNode(path) {
    this.focusedPath = path;
    for (const [p, entry] of this.nodeMap.entries()) {
      if (p === path) {
        entry.element.classList.add('focused');
        if (typeof entry.element.scrollIntoView === 'function') {
          entry.element.scrollIntoView({ block: 'nearest' });
        }
      } else {
        entry.element.classList.remove('focused');
      }
    }
  }

  /**
   * Ensures parent directories are expanded to reveal an active file.
   * @param {string} filePath
   */
  ensureNodeVisible(filePath) {
    const parts = filePath.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      if (!this.expandedPaths.has(current)) {
        this.toggleDirectory(current);
      }
    }
  }

  /**
   * Keyboard arrow navigation (VS Code standard).
   */
  attachKeyboardNavigation() {
    this.treeEl.addEventListener('keydown', (e) => {
      const visibleNodes = this.getVisibleNodes();
      if (visibleNodes.length === 0) return;

      const currentIndex = visibleNodes.findIndex((n) => n.path === this.focusedPath);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < visibleNodes.length - 1 ? currentIndex + 1 : 0;
          this.focusNode(visibleNodes[nextIndex].path);
          break;
        }

        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleNodes.length - 1;
          this.focusNode(visibleNodes[prevIndex].path);
          break;
        }

        case 'ArrowRight': {
          e.preventDefault();
          if (currentIndex !== -1) {
            const current = visibleNodes[currentIndex];
            if (current.type === 'directory') {
              if (!this.expandedPaths.has(current.path)) {
                this.toggleDirectory(current.path);
              } else if (currentIndex < visibleNodes.length - 1) {
                // Jump to first child
                this.focusNode(visibleNodes[currentIndex + 1].path);
              }
            }
          }
          break;
        }

        case 'ArrowLeft': {
          e.preventDefault();
          if (currentIndex !== -1) {
            const current = visibleNodes[currentIndex];
            if (current.type === 'directory' && this.expandedPaths.has(current.path)) {
              this.toggleDirectory(current.path);
            } else {
              // Jump to parent directory
              const parentPath = current.path.substring(0, current.path.lastIndexOf('/'));
              if (parentPath && this.nodeMap.has(parentPath)) {
                this.focusNode(parentPath);
              }
            }
          }
          break;
        }

        case 'Enter': {
          e.preventDefault();
          if (currentIndex !== -1) {
            const current = visibleNodes[currentIndex];
            if (current.type === 'directory') {
              this.toggleDirectory(current.path);
            } else {
              this.selectFile(current.path);
            }
          }
          break;
        }
      }
    });
  }

  /**
   * Returns a flattened array of currently visible nodes (skips children of collapsed folders).
   * @returns {import('../../services/filesystem-adapter.js').FileNode[]}
   */
  getVisibleNodes() {
    const visible = [];

    const traverse = (nodes) => {
      if (!nodes) return;
      for (const node of nodes) {
        visible.push(node);
        if (node.type === 'directory' && this.expandedPaths.has(node.path) && node.children) {
          traverse(node.children);
        }
      }
    };

    if (this.treeData && this.treeData.children) {
      traverse(this.treeData.children);
    }
    return visible;
  }

  /**
   * Renders the floating contextual options menu on right-click.
   * @param {number} x
   * @param {number} y
   * @param {import('../../services/filesystem-adapter.js').FileNode} node
   */
  showContextMenu(x, y, node) {
    this.closeContextMenu();

    const isDir = node.type === 'directory';
    const parentPath = isDir ? node.path : node.path.substring(0, node.path.lastIndexOf('/')) || this.rootPath;

    const menu = document.createElement('div');
    menu.className = 'context-menu-dropdown';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="new-file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        <span>New File</span>
      </div>
      <div class="context-menu-item" data-action="new-folder">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        <span>New Folder</span>
      </div>
      <div class="context-menu-separator"></div>
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
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" data-action="delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Delete</span>
      </div>
    `;

    document.body.appendChild(menu);
    const posX = Math.min(x, window.innerWidth - 190);
    const posY = Math.min(y, window.innerHeight - 220);
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    this.activeContextMenu = menu;

    menu.addEventListener('click', async (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      const action = item.getAttribute('data-action');
      this.closeContextMenu();

      if (action === 'new-file') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file', parentPath });
      } else if (action === 'new-folder') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-folder', parentPath });
      } else if (action === 'rename') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'rename', path: node.path, name: node.name, isDirectory: isDir });
      } else if (action === 'duplicate') {
        try {
          const res = await fileSystemAdapter.createFile(parentPath, `${node.name.replace(/\.md$/, '')} (copy).md`);
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Duplicated "${res.name}".` });
          await this.refresh();
        } catch (err) {
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: err.message });
        }
      } else if (action === 'copy-path') {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(node.path);
          }
        } catch {}
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: `Copied: ${node.path}` });
      } else if (action === 'delete') {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'delete-confirm', path: node.path, name: node.name, isDirectory: isDir });
      }
    });
  }

  closeContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.remove();
      this.activeContextMenu = null;
    }
  }
}
