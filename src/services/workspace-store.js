import { AppEvents, eventBus } from '../app/events.js';
import { documentStateManager, DocumentState } from '../core/document-state-manager.js';
import { fileSystemService } from './filesystem-service.js';
import { accentService, DEFAULT_ACCENT } from './accent-service.js';

const SETTINGS_KEY = 'devspirehub:settings';
const WORKSPACE_STATE_KEY = 'devspirehub:workspace:state';

export const DEFAULT_SETTINGS = {
  theme: 'cyberpunk',
  accent: DEFAULT_ACCENT,
  fontSize: '13px',
  fontFamily: 'JetBrains Mono',
  editorFontFamily: 'JetBrains Mono',
  editorFontSize: '13px',
  editorFontColor: '', // '' = inherit theme
  editorLineHeight: 1.6,
  previewFontFamily: 'Inter',
  previewFontSize: '13.5px',
  previewFontColor: '',
  previewLineHeight: 1.65,
  graphFontFamily: '', // '' = inherit UI font
  graphFontSize: 11,
  tabSize: 2,
  wordWrap: true,
  showLineNumbers: true,
  syncScroll: false,
  splitRatio: 50,
  viewMode: 'DUAL SPLIT',
  graph: {
    showGhostNotes: true,
    showOrphanNotes: true,
    showTags: true,
    onlyNeighbours: false,
    repulsion: 220,
    linkDistance: 75,
    gravity: 0.04,
  }
};

/**
 * WorkspaceStore manages robust persistence for application preferences,
 * editor layout configuration, split ratios, active tabs, and unsaved draft buffers.
 */
export class WorkspaceStore {
  constructor() {
    this.memoryStorage = new Map();
    this.debounceTimer = null;
    this.isRestoring = false;
  }

  isStorageAvailable() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  getItem(key) {
    if (this.isStorageAvailable()) {
      try {
        return localStorage.getItem(key);
      } catch {
        return this.memoryStorage.get(key) || null;
      }
    }
    return this.memoryStorage.get(key) || null;
  }

  setItem(key, value) {
    if (this.isStorageAvailable()) {
      try {
        localStorage.setItem(key, value);
      } catch {
        this.memoryStorage.set(key, value);
      }
    } else {
      this.memoryStorage.set(key, value);
    }
  }

  removeItem(key) {
    if (this.isStorageAvailable()) {
      try {
        localStorage.removeItem(key);
      } catch {
        this.memoryStorage.delete(key);
      }
    } else {
      this.memoryStorage.delete(key);
    }
  }

  /**
   * Retrieves application & theme settings.
   * @returns {typeof DEFAULT_SETTINGS}
   */
  getSettings() {
    try {
      const raw = this.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Updates and persists application settings.
   * @param {Partial<typeof DEFAULT_SETTINGS>} partialSettings
   * @returns {typeof DEFAULT_SETTINGS}
   */
  saveSettings(partialSettings = {}) {
    const current = this.getSettings();
    const updated = { ...current, ...partialSettings };
    if (partialSettings.fontSize !== undefined && partialSettings.editorFontSize === undefined) {
      updated.editorFontSize = partialSettings.fontSize;
    }
    if (partialSettings.editorFontSize !== undefined && partialSettings.fontSize === undefined) {
      updated.fontSize = partialSettings.editorFontSize;
    }
    if (partialSettings.fontFamily !== undefined && partialSettings.editorFontFamily === undefined) {
      updated.editorFontFamily = partialSettings.fontFamily;
    }
    if (partialSettings.editorFontFamily !== undefined && partialSettings.fontFamily === undefined) {
      updated.fontFamily = partialSettings.editorFontFamily;
    }
    try {
      this.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
    return updated;
  }

  /**
   * Resets application settings to initial studio defaults.
   * @returns {typeof DEFAULT_SETTINGS}
   */
  resetSettings() {
    try {
      this.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS }));
    } catch (e) {
      console.warn('Failed to reset settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Retrieves persisted workspace state (open files, active file, scroll positions, draft buffers).
   * @returns {{ openFiles: Array<{ path: string, name: string, isDirty?: boolean, unsavedContent?: string }>, activePath: string | null }}
   */
  getWorkspaceState() {
    try {
      const raw = this.getItem(WORKSPACE_STATE_KEY);
      if (!raw) return { openFiles: [], activePath: null };
      const parsed = JSON.parse(raw);
      return {
        openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles : [],
        activePath: parsed.activePath || null
      };
    } catch {
      return { openFiles: [], activePath: null };
    }
  }

  /**
   * Persists workspace state.
   * @param {{ openFiles?: Array<any>, activePath?: string | null }} state
   */
  saveWorkspaceState(state = {}) {
    const current = this.getWorkspaceState();
    const merged = { ...current, ...state };
    try {
      this.setItem(WORKSPACE_STATE_KEY, JSON.stringify(merged));
    } catch (e) {
      console.warn('Failed to persist workspace state:', e);
    }
  }

  /**
   * Schedules a debounced snapshot of the active workspace documents.
   */
  snapshotOpenDocuments() {
    if (this.isRestoring) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const docs = documentStateManager.getOpenDocuments();
      const active = documentStateManager.getActiveDocument();

      const openFiles = docs.map(d => ({
        path: d.path,
        name: d.name,
        isDirty: d.state === DocumentState.DIRTY,
        unsavedContent: d.state === DocumentState.DIRTY ? d.content : undefined
      }));

      this.saveWorkspaceState({
        openFiles,
        activePath: active ? active.path : null
      });
    }, 200);
  }

  /**
   * Restores workspace state into documentStateManager on startup.
   * @returns {Promise<boolean>} True if workspace files were restored, false if defaults should load
   */
  async restoreWorkspace() {
    this.isRestoring = true;
    try {
      const state = this.getWorkspaceState();
      if (!state.openFiles || state.openFiles.length === 0) {
        this.isRestoring = false;
        return false;
      }

      for (const item of state.openFiles) {
        if (!item.path) continue;
        try {
          const fileData = await fileSystemService.readFile(item.path);
          const doc = documentStateManager.openDocument(
            fileData.path,
            fileData.content,
            fileData.hash,
            fileData.mtime
          );

          // Restore unsaved draft buffer if dirty
          if (item.isDirty && typeof item.unsavedContent === 'string' && item.unsavedContent !== fileData.content) {
            documentStateManager.updateContent(doc.id, item.unsavedContent);
          }
        } catch {
          // File may have been removed outside editor, create fallback in memory
          if (item.unsavedContent) {
            documentStateManager.createDocument(item.name || 'Untitled.md', item.unsavedContent, item.path);
          }
        }
      }

      // Activate active document if known
      if (state.activePath) {
        const target = documentStateManager.getOpenDocuments().find(d => d.path === state.activePath);
        if (target) {
          documentStateManager.setActiveDocument(target.id);
        }
      }

      this.isRestoring = false;
      return true;
    } catch (err) {
      console.warn('Could not restore workspace state:', err);
      this.isRestoring = false;
      return false;
    }
  }

  /**
   * Initializes event listeners for auto-saving workspace state.
   */
  initAutoSync() {
    eventBus.on(AppEvents.DOCUMENT_OPENED, () => this.snapshotOpenDocuments());
    eventBus.on(AppEvents.DOCUMENT_CLOSED, () => this.snapshotOpenDocuments());
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, () => this.snapshotOpenDocuments());
    eventBus.on(AppEvents.DOCUMENT_CHANGED, () => this.snapshotOpenDocuments());
    eventBus.on(AppEvents.DOCUMENT_SAVED, () => this.snapshotOpenDocuments());
    eventBus.on(AppEvents.VIEW_MODE_CHANGED, (mode) => {
      this.saveSettings({ viewMode: mode });
    });
  }
}

export const workspaceStore = new WorkspaceStore();
