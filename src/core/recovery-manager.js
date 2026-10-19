import { AppEvents, eventBus } from '../app/events.js';
import { documentStateManager, DocumentState } from './document-state-manager.js';

const JOURNAL_STORAGE_KEY = 'devspirehub:recovery:journal';
const JOURNAL_BACKUP_KEY = 'devspirehub:recovery:last_backup';

/**
 * CrashRecoveryManager provides write-ahead snapshot journaling in local storage
 * to prevent draft loss across abrupt browser/desktop process termination.
 */
export class CrashRecoveryManager {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.timer = null;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_CHANGED, (doc) => {
      this.recordJournalEntry(doc);
    });

    eventBus.on(AppEvents.DOCUMENT_SAVED, (doc) => {
      this.clearJournalEntry(doc.id);
    });

    eventBus.on(AppEvents.DOCUMENT_CLOSED, ({ id }) => {
      this.clearJournalEntry(id);
    });
  }

  startPeriodicJournaling(intervalMs = 3000) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.snapshotAllDirtyDocuments();
    }, intervalMs);
  }

  stopPeriodicJournaling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshotAllDirtyDocuments() {
    try {
      const openDocs = documentStateManager.getOpenDocuments();
      for (const doc of openDocs) {
        if (doc && doc.state === DocumentState.DIRTY) {
          this.recordJournalEntry(doc);
        }
      }
    } catch (e) {
      console.warn('Error during periodic document snapshotting:', e);
    }
  }

  getJournal() {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(JOURNAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveJournal(journal) {
    if (!this.storage) return;
    try {
      this.storage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
    } catch (e) {
      console.warn('Failed to write recovery journal to storage:', e);
    }
  }

  recordJournalEntry(doc) {
    if (!doc || doc.state !== DocumentState.DIRTY) return;
    const journal = this.getJournal();
    journal[doc.id] = {
      id: doc.id,
      name: doc.name,
      path: doc.path,
      content: doc.content,
      revision: doc.revision,
      timestamp: Date.now(),
      remoteMetadata: doc.remoteMetadata || null,
    };
    this.saveJournal(journal);
  }

  clearJournalEntry(id) {
    const journal = this.getJournal();
    if (journal[id]) {
      delete journal[id];
      this.saveJournal(journal);
    }
  }

  hasPendingRecoveries() {
    const journal = this.getJournal();
    return Object.keys(journal).length > 0;
  }

  getPendingRecoveries() {
    return Object.values(this.getJournal());
  }

  /**
   * Restores pending crash journal entries safely into document state manager.
   * Creates a non-destructive backup in local storage before clearing the journal.
   * @returns {number} Count of successfully restored documents
   */
  restorePendingEntries() {
    const recoveries = this.getPendingRecoveries();
    if (recoveries.length === 0) return 0;

    // Preserve non-destructive copy of journal
    if (this.storage) {
      try {
        const raw = this.storage.getItem(JOURNAL_STORAGE_KEY);
        if (raw) this.storage.setItem(JOURNAL_BACKUP_KEY, raw);
      } catch (err) {
        console.warn('Failed to preserve recovery backup:', err);
      }
    }

    let restoredCount = 0;
    for (const item of recoveries) {
      try {
        if (!item || !item.name) continue;
        const existing = documentStateManager.getOpenDocuments().find(d => d.path === item.path);
        if (existing) {
          if (existing.content !== item.content) {
            documentStateManager.updateContent(existing.id, item.content);
          }
        } else {
          const doc = documentStateManager.createDocument(item.name, item.content || '', item.path || '');
          if (item.remoteMetadata) {
            doc.remoteMetadata = item.remoteMetadata;
          }
          documentStateManager.updateContent(doc.id, item.content || '');
        }
        restoredCount++;
      } catch (err) {
        console.warn('Failed restoring specific journal entry:', item, err);
      }
    }

    this.clearAll();
    return restoredCount;
  }

  clearAll() {
    if (!this.storage) return;
    this.storage.removeItem(JOURNAL_STORAGE_KEY);
  }
}

export const crashRecoveryManager = new CrashRecoveryManager();
