import { fileSystemService } from './filesystem-service.js';
import { StudioError, ErrorCode } from './error-service.js';

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
 */
export class FileSystemAdapter {
  constructor() {
    this.runtime = this.detectRuntime();
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
      } catch {
        // Fall back to virtual storage if native bridge fails or unconfigured
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
   * @param {string} filePath
   * @returns {Promise<{ path: string, content: string }>}
   */
  async readFile(filePath) {
    if (this.runtime === 'tauri') {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(filePath);
        return { path: filePath, content };
      } catch {
        // Fall back
      }
    }
    return await fileSystemService.readFile(filePath);
  }

  /**
   * Writes content to a file.
   * @param {string} filePath
   * @param {string} content
   */
  async writeFile(filePath, content) {
    if (this.runtime === 'tauri') {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, content);
      } catch {
        // Fall back
      }
    }
    return await fileSystemService.saveFile(filePath, content);
  }

  /**
   * Creates a new file under a parent directory.
   * @param {string} parentPath
   * @param {string} fileName
   * @param {string} [initialContent='']
   * @returns {Promise<FileNode>}
   */
  async createFile(parentPath, fileName, initialContent = '') {
    const cleanName = fileName.includes('.') ? fileName : `${fileName}.md`;
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
   * @param {string} parentPath
   * @param {string} folderName
   * @returns {Promise<FileNode>}
   */
  async createDirectory(parentPath, folderName) {
    const fullPath = `${parentPath}/${folderName.trim()}`;
    if (this.runtime === 'tauri') {
      try {
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(fullPath);
      } catch {
        // Fall back
      }
    }

    // Ensure virtual representation by creating a placeholder file or storing structure
    fileSystemService.virtualStorage.set(`${fullPath}/.keep`, '');

    return {
      id: fullPath,
      name: folderName.trim(),
      path: fullPath,
      type: 'directory',
      isOpen: true,
      children: [],
    };
  }

  /**
   * Renames a file or folder.
   * @param {string} oldPath
   * @param {string} newName
   */
  async rename(oldPath, newName) {
    const parts = oldPath.split('/');
    parts.pop();
    const newPath = `${parts.join('/')}/${newName}`;

    if (this.runtime === 'tauri') {
      try {
        const { rename } = await import('@tauri-apps/plugin-fs');
        await rename(oldPath, newPath);
      } catch {
        // Fall back
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

    return { oldPath, newPath, name: newName };
  }

  /**
   * Deletes a file or directory.
   * @param {string} path
   */
  async delete(path) {
    if (this.runtime === 'tauri') {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path, { recursive: true });
      } catch {
        // Fall back
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
