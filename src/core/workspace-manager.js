import { AppEvents, eventBus } from '../app/events.js';
import { fileSystemService } from '../services/filesystem-service.js';
import { documentStateManager } from './document-state-manager.js';

/**
 * WorkspaceManager handles the active vault structure, folders, files, tags, and local graph.
 */
export class WorkspaceManager {
  constructor() {
    this.vaultName = 'ExampleVault';
    this.vaultRoot = 'ExampleVault';
    this.recents = [
      { name: 'Sprint Review 2026-03-25.md', path: 'ExampleVault/Sprint Review 2026-03-25.md' }
    ];
    this.folders = [
      { name: 'audio', path: 'ExampleVault/audio', items: [] },
      {
        name: 'embeds',
        path: 'ExampleVault/embeds',
        items: [
          { name: 'telemetry-card.html', path: 'ExampleVault/embeds/telemetry-card.html', type: 'code' },
          { name: 'Embed Showcase.md', path: 'ExampleVault/embeds/Embed Showcase.md', type: 'doc' }
        ]
      },
      { name: 'images', path: 'ExampleVault/images', items: [] }
    ];
    this.knowledgeBase = [
      { name: 'cyberWriter Guide', path: 'ExampleVault/cyberWriter Guide.md', icon: 'book' },
      { name: 'Dr. Elena Vasquez', path: 'ExampleVault/Dr. Elena Vasquez.md', icon: 'user' },
      { name: 'Entangled Labs', path: 'ExampleVault/Entangled Labs.md', icon: 'atom' },
      { name: 'Flashcard Demo', path: 'ExampleVault/Flashcard Demo.md', icon: 'cards' },
      { name: 'Habitat Design', path: 'ExampleVault/Habitat Design.md', icon: 'doc', active: true },
      { name: 'Marcus Kim', path: 'ExampleVault/Marcus Kim.md', icon: 'user' },
      { name: 'Mermaid Style Rules', path: 'ExampleVault/Mermaid Style Rules.md', icon: 'flow' },
      { name: 'Mission Briefing', path: 'ExampleVault/Mission Briefing.md', icon: 'flag' },
      { name: 'Mission Log', path: 'ExampleVault/Mission Log.md', icon: 'list' },
      { name: 'Nexus Labs - Project...', path: 'ExampleVault/Nexus Labs.md', icon: 'box' },
      { name: 'Orbital Mechanics', path: 'ExampleVault/Orbital Mechanics.md', icon: 'orbit' },
      { name: 'System Architecture', path: 'ExampleVault/System Architecture.md', icon: 'layers' }
    ];
    this.tags = [
      '#action', '#approved', '#architecture', '#daily', '#design',
      '#engineering', '#flashcards', '#habitat', '#history',
      '#logs', '#march-2026', '#math', '#media'
    ];
    this.activeTagFilter = null;
    this.graphNodes = [
      { id: 'Habitat Design', label: 'Habitat Design', isCenter: true, x: 140, y: 80 },
      { id: 'System Arch.', label: 'System Arch.', x: 210, y: 35 },
      { id: 'Orbital Mechanics', label: 'Orbital Mechanics', x: 60, y: 40 },
      { id: 'Elena Vasquez', label: 'Elena Vasquez', x: 50, y: 130 },
      { id: 'Entangled Labs', label: 'Entangled Labs', x: 135, y: 145 },
      { id: 'Mission Briefing', label: 'Mission Briefing', x: 220, y: 125 }
    ];
    this.graphEdges = [
      { from: 'Habitat Design', to: 'System Arch.' },
      { from: 'Habitat Design', to: 'Orbital Mechanics' },
      { from: 'Habitat Design', to: 'Elena Vasquez' },
      { from: 'Habitat Design', to: 'Entangled Labs' },
      { from: 'Habitat Design', to: 'Mission Briefing' },
      { from: 'System Arch.', to: 'Mission Briefing' },
      { from: 'Elena Vasquez', to: 'Entangled Labs' }
    ];
  }

  getVaultName() {
    return this.vaultName;
  }

  setFilterTag(tag) {
    this.activeTagFilter = this.activeTagFilter === tag ? null : tag;
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { activeTagFilter: this.activeTagFilter });
  }

  toggleSort() {
    this.sortAsc = this.sortAsc === undefined ? false : !this.sortAsc;
    this.knowledgeBase.sort((a, b) => {
      return this.sortAsc 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name);
    });
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { sorted: true, asc: this.sortAsc });
  }

  /**
   * Sanitizes and validates a filename against invalid OS characters.
   * @param {string} name
   * @returns {boolean}
   */
  isValidFilename(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed || trimmed === '.' || trimmed === '..') return false;
    // Reject OS forbidden characters: \ / : * ? " < > |
    if (/[\\/:*?"<>|]/.test(trimmed)) return false;
    // Windows reserved device names
    const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    if (reserved.test(trimmed)) return false;
    return true;
  }

  /**
   * Creates a new folder in the workspace.
   * @param {string} folderName
   * @param {string} [parentPath='ExampleVault']
   */
  createFolder(folderName, parentPath = 'ExampleVault') {
    if (!this.isValidFilename(folderName)) {
      throw new Error(`Invalid folder name "${folderName}". Cannot contain \\ / : * ? " < > |`);
    }
    const fullPath = `${parentPath}/${folderName.trim()}`;
    if (this.folders.some(f => f.path === fullPath)) {
      throw new Error(`Folder "${folderName}" already exists.`);
    }
    const folder = { name: folderName.trim(), path: fullPath, items: [] };
    this.folders.push(folder);
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { folderCreated: folder });
    return folder;
  }

  /**
   * Adds a new file into the knowledge base.
   * @param {string} fileName
   * @param {string} [content='']
   * @param {string} [parentPath='ExampleVault']
   */
  async createFile(fileName, content = '', parentPath = 'ExampleVault') {
    const cleanName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const baseName = cleanName.replace('.md', '');
    if (!this.isValidFilename(baseName)) {
      throw new Error(`Invalid file name "${fileName}". Cannot contain \\ / : * ? " < > |`);
    }
    const fullPath = `${parentPath}/${cleanName}`;
    await fileSystemService.createFile(fullPath, content || `# ${baseName}\n\n`);
    const node = { name: baseName, path: fullPath, icon: 'doc' };
    this.knowledgeBase.push(node);
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { fileCreated: node });
    return node;
  }

  /**
   * Renames an item in the workspace tree.
   * @param {string} oldPath
   * @param {string} newName
   */
  async renameItem(oldPath, newName) {
    const cleanName = newName.replace('.md', '');
    if (!this.isValidFilename(cleanName)) {
      throw new Error(`Invalid file name "${newName}". Cannot contain \\ / : * ? " < > |`);
    }
    const parts = oldPath.split('/');
    parts.pop();
    const newPath = `${parts.join('/')}/${cleanName}.md`;

    await fileSystemService.renameFile(oldPath, newPath);

    // Update in knowledgeBase
    const kbItem = this.knowledgeBase.find(k => k.path === oldPath);
    if (kbItem) {
      kbItem.name = cleanName;
      kbItem.path = newPath;
    }

    // Update in recents
    const recent = this.recents.find(r => r.path === oldPath);
    if (recent) {
      recent.name = `${cleanName}.md`;
      recent.path = newPath;
    }

    // Update any open document in documentStateManager
    for (const doc of documentStateManager.documents.values()) {
      if (doc.path === oldPath) {
        doc.path = newPath;
        doc.name = `${cleanName}.md`;
        eventBus.emit(AppEvents.DOCUMENT_CHANGED, doc);
      }
    }

    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { renamed: { oldPath, newPath } });
    return { oldPath, newPath };
  }

  /**
   * Duplicates a file in the workspace.
   * @param {string} itemPath
   */
  async duplicateItem(itemPath) {
    const res = await fileSystemService.duplicateFile(itemPath);
    const nodeName = res.name.replace('.md', '');
    const node = { name: nodeName, path: res.path, icon: 'doc' };
    this.knowledgeBase.push(node);
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { fileCreated: node });
    return node;
  }

  /**
   * Deletes an item from the workspace tree.
   * @param {string} itemPath
   */
  async deleteItem(itemPath) {
    await fileSystemService.deleteFile(itemPath);
    this.knowledgeBase = this.knowledgeBase.filter(k => k.path !== itemPath);
    this.recents = this.recents.filter(r => r.path !== itemPath);
    for (const folder of this.folders) {
      folder.items = folder.items.filter(i => i.path !== itemPath);
    }
    for (const doc of documentStateManager.documents.values()) {
      if (doc.path === itemPath) {
        documentStateManager.closeDocument(doc.id, true);
      }
    }
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { deleted: itemPath });
    return true;
  }
}

export const workspaceManager = new WorkspaceManager();
