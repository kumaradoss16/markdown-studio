import { fileSystemService } from './filesystem-service.js';
import { fileSystemAdapter } from './filesystem-adapter.js';
import { AppEvents, eventBus } from '../app/events.js';

const RECENT_FILES_KEY = 'devspirehub:recent-files';
const MAX_RECENTS = 20;

export class RecentFilesService {
  constructor() {
    this.recents = this.loadRecents();
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_OPENED, (doc) => {
      if (doc && doc.path) {
        this.addRecent(doc.path, doc.name);
      }
    });

    eventBus.on(AppEvents.DOCUMENT_SAVED, (doc) => {
      if (doc && doc.path) {
        this.addRecent(doc.path, doc.name);
      }
    });
  }

  loadRecents() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(RECENT_FILES_KEY);
      if (raw === null) return this.getDefaultRecents();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getDefaultRecents() {
    return [
      {
        name: 'Sprint Review 2026-03-25.md',
        path: 'ExampleVault/Sprint Review 2026-03-25.md',
        lastAccessed: Date.now() - 3600000
      },
      {
        name: 'Habitat Design.md',
        path: 'ExampleVault/Habitat Design.md',
        lastAccessed: Date.now() - 7200000
      }
    ];
  }

  persist() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(this.recents));
      }
    } catch {
      // Memory fallback
    }
  }

  /**
   * Adds or bumps a file in the recent files list.
   * @param {string} path
   * @param {string} [name]
   * @returns {Array<any>}
   */
  addRecent(path, name) {
    if (!path) return this.recents;
    const cleanName = name || path.split('/').pop() || path;

    // Remove if already present
    this.recents = this.recents.filter(r => r.path !== path);

    // Prepend new entry
    this.recents.unshift({
      name: cleanName,
      path,
      lastAccessed: Date.now()
    });

    // Enforce capacity limit
    if (this.recents.length > MAX_RECENTS) {
      this.recents = this.recents.slice(0, MAX_RECENTS);
    }

    this.persist();
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { recentsUpdated: true });
    return this.recents;
  }

  /**
   * Retrieves all recent files sorted by lastAccessed descending.
   * @returns {Array<{ name: string, path: string, lastAccessed: number }>}
   */
  getRecents() {
    return [...this.recents];
  }

  /**
   * Removes a file from recent files.
   * @param {string} path
   */
  removeRecent(path) {
    this.recents = this.recents.filter(r => r.path !== path);
    this.persist();
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { recentsUpdated: true });
  }

  /**
   * Clears the recent files list completely.
   */
  clearRecents() {
    this.recents = [];
    this.persist();
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { recentsUpdated: true });
  }

  /**
   * Updates an entry when a file is renamed.
   * @param {string} oldPath
   * @param {string} newPath
   * @param {string} newName
   */
  renameRecent(oldPath, newPath, newName) {
    let changed = false;
    for (const r of this.recents) {
      if (r.path === oldPath) {
        r.path = newPath;
        r.name = newName.endsWith('.md') ? newName : `${newName}.md`;
        r.lastAccessed = Date.now();
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      eventBus.emit(AppEvents.WORKSPACE_CHANGED, { recentsUpdated: true });
    }
  }

  /**
   * Verifies if a recent file still exists in workspace or virtual storage.
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async verifyFileExists(path) {
    if (!path) return false;
    // Check virtual storage
    if (fileSystemService.virtualStorage.has(path)) return true;
    // Check filesystem adapter
    try {
      const data = await fileSystemAdapter.readFile(path);
      return Boolean(data);
    } catch {
      return false;
    }
  }

  /**
   * Verifies all entries and prunes missing files.
   * @returns {Promise<number>} Number of pruned files
   */
  async pruneMissing() {
    const verified = [];
    let prunedCount = 0;

    for (const item of this.recents) {
      const exists = await this.verifyFileExists(item.path);
      if (exists) {
        verified.push(item);
      } else {
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      this.recents = verified;
      this.persist();
      eventBus.emit(AppEvents.WORKSPACE_CHANGED, { recentsPruned: prunedCount });
    }
    return prunedCount;
  }

  /**
   * Formats a relative human-readable timestamp.
   * @param {number} timestamp
   * @returns {string}
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  }
}

export const recentFilesService = new RecentFilesService();
