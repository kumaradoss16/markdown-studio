import { AppEvents, eventBus } from '../app/events.js';
import { documentStateManager, DocumentState } from './document-state-manager.js';

const JOURNAL_STORAGE_KEY = 'devspirehub:recovery:journal';

/**
 * CrashRecoveryManager provides write-ahead snapshot journaling in local storage
 * to prevent draft loss across abrupt browser/desktop process termination.
 */
export class CrashRecoveryManager {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
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

  restorePendingEntries() {
    const recoveries = this.getPendingRecoveries();
    for (const item of recoveries) {
      const doc = documentStateManager.createDocument(item.name, item.content, item.path);
      // Mark as restored dirty draft
      documentStateManager.updateContent(doc.id, item.content);
    }
    this.clearAll();
    return recoveries.length;
  }

  clearAll() {
    if (!this.storage) return;
    this.storage.removeItem(JOURNAL_STORAGE_KEY);
  }
}

export const crashRecoveryManager = new CrashRecoveryManager();
