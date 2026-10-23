import { fileSystemService } from './filesystem-service.js';
import { StudioError, ErrorCode } from './error-service.js';
import { eventBus, AppEvents } from '../app/events.js';

/**
 * @typedef {Object} FileNode
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {'file' | 'directory'} type
 * @property {string} [extension]
 * @property {FileNode[]} [children]
 * @property {boolean} [isOpen]
 * @property {number} [mtime]
 * @property {number} [size]
 */

/**
 * FileSystemAdapter
 * Unified abstraction layer connecting the File Tree UI to:
 * 1. Tauri 2 `@tauri-apps/plugin-fs` (desktop native runtime)
 * 2. Electron IPC `window.electronAPI`
 * 3. Web File System Access API (`showDirectoryPicker`)
 * 4. High-performance Virtual Storage Fallback (in-memory / test runner)
 *
 * Error Boundaries:
 * - All Tauri calls are wrapped in try-catch blocks
 * - Failures cascade to virtual storage with logged reasons
 * - isVirtualMode() exposes degraded mode status to UI
 * - virtualModeReason documents why fallback is active
 * - App event emitted on fallback for UI warning display
 */
export class FileSystemAdapter {
  constructor() {
    this.runtime = this.detectRuntime();
    this.virtualModeReason = null; // Reason string if using virtual storage
  }

  detectRuntime() {
    if (typeof window !== 'undefined') {
      if (Boolean(window.__TAURI_INTERNALS__)) return 'tauri';
      if (Boolean(window.electronAPI || window.ipcRenderer)) return 'electron';
      if (typeof window.showDirectoryPicker === 'function') return 'web-fs';
    }
    return 'virtual';
  }

  /**
   * Checks if currently using virtual storage fallback.
   * @returns {boolean}
   */
  isVirtualMode() {
    return this.virtualModeReason !== null;
  }

  /**
   * Emits notification event when falling back to virtual mode.
   * Sets data-virtual-mode attribute on document root for CSS hooks.
   * @private
   */
  _notifyVirtualModeFallback() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-virtual-mode', 'true');
    }
    eventBus.emit(AppEvents.NOTIFICATION, {
      type: 'warning',
      message: `File system unavailable. Using virtual storage. Reason: ${this.virtualModeReason}`,
    });
  }

  /**
   * Helper to extract file extension without dot.
   * @param {string} filename
   * @returns {string}
   */
  getExtension(filename) {
    const dotIdx = filename.lastIndexOf('.');
    if (dotIdx === -1 || dotIdx === 0) return '';
    return filename.slice(dotIdx + 1).toLowerCase();
  }

  /**
   * Helper to get base name.
   * @param {string} path
   * @returns {string}
   */
  getBaseName(path) {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
  }

  /**
   * Recursively scans and builds a nested file tree starting from rootPath.
   * All Tauri calls wrapped in try-catch for error boundary. On failure,
   * sets virtualModeReason, logs error, and falls back to virtual storage.
   * 
   * @param {string} [rootPath='ExampleVault']
   * @param {number} [depth=0]
   * @param {number} [maxDepth=20]
   * @returns {Promise<FileNode>}
   */
  async readTree(rootPath = 'ExampleVault', depth = 0, maxDepth = 20) {
    const rootName = this.getBaseName(rootPath);
    const rootNode = {
      id: rootPath,
      name: rootName,
      path: rootPath,
      type: 'directory',
      isOpen: true,
      children: [],
    };

    if (this.runtime === 'tauri') {
      try {
        const { readDir } = await import('@tauri-apps/plugin-fs');
        const entries = await readDir(rootPath);
        for (const entry of entries) {
          const entryPath = `${rootPath}/${entry.name}`;
          if (entry.isDirectory && depth < maxDepth) {
            const subTree = await this.readTree(entryPath, depth + 1, maxDepth);
            rootNode.children.push(subTree);
          } else {
            rootNode.children.push({
              id: entryPath,
              name: entry.name,
              path: entryPath,
              type: 'file',
              extension: this.getExtension(entry.name),
            });
          }
        }
        this.sortNodes(rootNode.children);
        return rootNode;
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri readDir failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri readTree failure:', err);
        this._notifyVirtualModeFallback();
      }
    }

    // Virtual Storage / Default Environment tree assembly
    const allPaths = Array.from(fileSystemService.virtualStorage.keys());
    const childMap = new Map();

    for (const filePath of allPaths) {
      if (!filePath.startsWith(rootPath + '/')) continue;

      const relative = filePath.slice(rootPath.length + 1);
      const segments = relative.split('/');

      let currentParent = rootNode;
      let currentPath = rootPath;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLeaf = i === segments.length - 1;
        currentPath = `${currentPath}/${seg}`;

        if (isLeaf) {
          // Check if file already added
          if (!currentParent.children.some((c) => c.path === currentPath)) {
            currentParent.children.push({
              id: currentPath,
              name: seg,
              path: currentPath,
              type: 'file',
              extension: this.getExtension(seg),
            });
          }
        } else {
          // Directory node
          let dirNode = currentParent.children.find((c) => c.path === currentPath);
          if (!dirNode) {
            dirNode = {
              id: currentPath,
              name: seg,
              path: currentPath,
              type: 'directory',
              isOpen: false,
              children: [],
            };
            currentParent.children.push(dirNode);
          }
          currentParent = dirNode;
        }
      }
    }

    // Recursively sort directories first, then alphabetically
    this.sortTree(rootNode);
    return rootNode;
  }

  sortTree(node) {
    if (node.children && node.children.length > 0) {
      this.sortNodes(node.children);
      for (const child of node.children) {
        if (child.type === 'directory') {
          this.sortTree(child);
        }
      }
    }
  }

  sortNodes(nodes) {
    nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      return a.type === 'directory' ? -1 : 1;
    });
  }

  /**
   * Reads the content of a file.
   * Wrapped in error boundary: logs Tauri failures and falls back to virtual storage.
   * 
   * @param {string} filePath
   * @returns {Promise<{ path: string, content: string }>}
   */
  async readFile(filePath) {
    if (this.runtime === 'tauri') {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(filePath);
        return { path: filePath, content };
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri readTextFile failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri readFile failure:', err);
        this._notifyVirtualModeFallback();
      }
    }
    return await fileSystemService.readFile(filePath);
  }

  /**
   * Writes content to a file.
   * Wrapped in error boundary: logs Tauri failures and falls back to virtual storage.
   * 
   * @param {string} filePath
   * @param {string} content
   */
  async writeFile(filePath, content) {
    if (this.runtime === 'tauri') {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, content);
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri writeTextFile failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri writeFile failure:', err);
        this._notifyVirtualModeFallback();
      }
    }
    return await fileSystemService.saveFile(filePath, content);
  }

  /**
   * Sanitizes item name to prevent path traversal or separator injections.
   * @param {string} name
   * @returns {string}
   */
  sanitizeItemName(name) {
    if (!name || typeof name !== 'string') {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Name parameter must be a non-empty string.');
    }
    const clean = name.trim();
    if (clean.includes('/') || clean.includes('\\') || clean.includes('..') || clean === '.' || clean.includes('\0')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Item name cannot contain directory separators or traversal sequences.');
    }
    return clean;
  }

  /**
   * Creates a new file under a parent directory.
   * @param {string} parentPath
   * @param {string} fileName
   * @param {string} [initialContent='']
   * @returns {Promise<FileNode>}
   */
  async createFile(parentPath, fileName, initialContent = '') {
    const safeName = this.sanitizeItemName(fileName);
    const cleanName = safeName.includes('.') ? safeName : `${safeName}.md`;
    const fullPath = `${parentPath}/${cleanName}`;
    await this.writeFile(fullPath, initialContent || `# ${cleanName.replace(/\.md$/, '')}\n\n`);

    return {
      id: fullPath,
      name: cleanName,
      path: fullPath,
      type: 'file',
      extension: this.getExtension(cleanName),
    };
  }

  /**
   * Creates a new directory.
   * Wrapped in error boundary: logs Tauri failures and falls back to virtual storage.
   * 
   * @param {string} parentPath
   * @param {string} folderName
   * @returns {Promise<FileNode>}
   */
  async createDirectory(parentPath, folderName) {
    const safeName = this.sanitizeItemName(folderName);
    const fullPath = `${parentPath}/${safeName}`;
    if (this.runtime === 'tauri') {
      try {
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(fullPath);
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri mkdir failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri createDirectory failure:', err);
        this._notifyVirtualModeFallback();
      }
    }

    // Ensure virtual representation by creating a placeholder file or storing structure
    fileSystemService.virtualStorage.set(`${fullPath}/.keep`, '');

    return {
      id: fullPath,
      name: safeName,
      path: fullPath,
      type: 'directory',
      isOpen: true,
      children: [],
    };
  }

  /**
   * Renames a file or folder.
   * Wrapped in error boundary: logs Tauri failures and falls back to virtual storage.
   * 
   * @param {string} oldPath
   * @param {string} newName
   */
  async rename(oldPath, newName) {
    const safeName = this.sanitizeItemName(newName);
    const parts = oldPath.split('/');
    parts.pop();
    const newPath = `${parts.join('/')}/${safeName}`;

    if (this.runtime === 'tauri') {
      try {
        const { rename } = await import('@tauri-apps/plugin-fs');
        await rename(oldPath, newPath);
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri rename failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri rename failure:', err);
        this._notifyVirtualModeFallback();
      }
    }

    // Update in virtual storage
    const content = fileSystemService.virtualStorage.get(oldPath);
    if (content !== undefined) {
      fileSystemService.virtualStorage.delete(oldPath);
      fileSystemService.virtualStorage.set(newPath, content);
    } else {
      // Prefix rename for directory
      const oldPrefix = oldPath + '/';
      const newPrefix = newPath + '/';
      for (const [key, val] of Array.from(fileSystemService.virtualStorage.entries())) {
        if (key.startsWith(oldPrefix)) {
          fileSystemService.virtualStorage.delete(key);
          fileSystemService.virtualStorage.set(key.replace(oldPrefix, newPrefix), val);
        }
      }
    }

    return { oldPath, newPath, name: safeName };
  }

  /**
   * Deletes a file or directory.
   * Wrapped in error boundary: logs Tauri failures and falls back to virtual storage.
   * 
   * @param {string} path
   */
  async delete(path) {
    if (!path || typeof path !== 'string' || path.includes('..') || path.includes('\0')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Unsafe path specified for deletion.');
    }

    if (this.runtime === 'tauri') {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path, { recursive: true });
      } catch (err) {
        // Error boundary: log failure and fall back to virtual storage
        const reason = `Tauri remove failed: ${err.message || 'unknown error'}`;
        this.virtualModeReason = reason;
        console.error('[FileSystemAdapter] Tauri delete failure:', err);
        this._notifyVirtualModeFallback();
      }
    }

    fileSystemService.virtualStorage.delete(path);
    // If directory, delete child paths
    const prefix = path + '/';
    for (const key of Array.from(fileSystemService.virtualStorage.keys())) {
      if (key.startsWith(prefix)) {
        fileSystemService.virtualStorage.delete(key);
      }
    }
    return true;
  }
}

export const fileSystemAdapter = new FileSystemAdapter();
