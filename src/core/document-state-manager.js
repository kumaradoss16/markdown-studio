import { AppEvents, eventBus } from '../app/events.js';
import { ErrorCode, StudioError } from '../services/error-service.js';

export const DocumentState = {
  CLEAN: 'CLEAN',
  DIRTY: 'DIRTY',
  SAVING: 'SAVING',
  SAVE_ERROR: 'SAVE_ERROR',
  EXTERNAL_CHANGE: 'EXTERNAL_CHANGE',
};

/**
 * Manages in-memory document models, revisions, active tabs, and dirty-state tracking.
 */
export class DocumentStateManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.documents = new Map();
    /** @type {string | null} */
    this.activeDocumentId = null;
    this.idCounter = 0;
  }

  /**
   * Generates a unique document ID.
   * @returns {string}
   */
  generateId() {
    this.idCounter += 1;
    return `doc-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Creates a new untitled or named document.
   * @param {string} [name='Untitled.md']
   * @param {string} [content='']
   * @param {string | null} [path=null]
   * @returns {any}
   */
  createDocument(name = 'Untitled.md', content = '', path = null) {
    const id = this.generateId();
    const doc = {
      id,
      name,
      path,
      content,
      revision: 0,
      savedRevision: 0,
      state: DocumentState.CLEAN,
      diskHash: null,
      mtime: Date.now(),
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    this.documents.set(id, doc);
    this.setActiveDocument(id);
    eventBus.emit(AppEvents.DOCUMENT_OPENED, doc);
    return doc;
  }

  /**
   * Opens an existing file as a document or focuses it if already open.
   * @param {string} filePath
   * @param {string} content
   * @param {string} diskHash
   * @param {number} mtime
   * @returns {any}
   */
  openDocument(filePath, content, diskHash, mtime = Date.now()) {
    // Check if file is already open
    for (const doc of this.documents.values()) {
      if (doc.path === filePath) {
        this.setActiveDocument(doc.id);
        return doc;
      }
    }

    const name = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    const id = this.generateId();
    const doc = {
      id,
      name,
      path: filePath,
      content,
      revision: 0,
      savedRevision: 0,
      state: DocumentState.CLEAN,
      diskHash,
      mtime,
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    this.documents.set(id, doc);
    this.setActiveDocument(id);
    eventBus.emit(AppEvents.DOCUMENT_OPENED, doc);
    return doc;
  }

  /**
   * Updates document content and increments revision.
   * @param {string} id
   * @param {string} newContent
   * @returns {any}
   */
  updateContent(id, newContent) {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${id} not found.`);
    }

    if (doc.content === newContent) {
      return doc;
    }

    doc.content = newContent;
    doc.revision += 1;
    doc.lastModified = Date.now();

    const previousState = doc.state;
    if (doc.revision !== doc.savedRevision) {
      doc.state = DocumentState.DIRTY;
    } else {
      doc.state = DocumentState.CLEAN;
    }

    if (previousState !== doc.state) {
      eventBus.emit(AppEvents.DOCUMENT_DIRTY_STATE, { doc, isDirty: doc.state === DocumentState.DIRTY });
    }

    eventBus.emit(AppEvents.DOCUMENT_CHANGED, doc);
    return doc;
  }

  /**
   * Marks a document as in-flight saving.
   * @param {string} id
   * @returns {number} The captured revision being saved
   */
  markSaving(id) {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${id} not found.`);
    }
    doc.state = DocumentState.SAVING;
    eventBus.emit(AppEvents.DOCUMENT_DIRTY_STATE, { doc, isDirty: true });
    return doc.revision;
  }

  /**
   * Updates state after a successful save.
   * @param {string} id
   * @param {number} savedRevision
   * @param {string} diskHash
   * @param {string} [newPath]
   */
  markSaved(id, savedRevision, diskHash, newPath = null) {
    const doc = this.documents.get(id);
    if (!doc) return;

    doc.savedRevision = savedRevision;
    doc.diskHash = diskHash;
    if (newPath) {
      doc.path = newPath;
      doc.name = newPath.replace(/\\/g, '/').split('/').pop() || doc.name;
    }

    // If newer edits were made while the save was in flight, keep dirty!
    if (doc.revision === savedRevision) {
      doc.state = DocumentState.CLEAN;
    } else {
      doc.state = DocumentState.DIRTY;
    }

    eventBus.emit(AppEvents.DOCUMENT_SAVED, doc);
    eventBus.emit(AppEvents.DOCUMENT_DIRTY_STATE, { doc, isDirty: doc.state === DocumentState.DIRTY });
  }

  /**
   * Marks document as having encountered a save error.
   * @param {string} id
   * @param {any} error
   */
  markSaveError(id, error) {
    const doc = this.documents.get(id);
    if (!doc) return;

    doc.state = DocumentState.SAVE_ERROR;
    doc.lastError = error;
    eventBus.emit(AppEvents.DOCUMENT_DIRTY_STATE, { doc, isDirty: true });
  }

  /**
   * Closes a document. If dirty, requires force flag.
   * @param {string} id
   * @param {boolean} [force=false]
   * @returns {boolean}
   */
  closeDocument(id, force = false) {
    const doc = this.documents.get(id);
    if (!doc) return true;

    if (doc.state === DocumentState.DIRTY && !force) {
      throw new StudioError(
        ErrorCode.SAVE_ABORTED,
        `Document "${doc.name}" has unsaved changes.`
      );
    }

    this.documents.delete(id);
    eventBus.emit(AppEvents.DOCUMENT_CLOSED, { id, name: doc.name });

    // Switch active document if closed document was active
    if (this.activeDocumentId === id) {
      const remaining = Array.from(this.documents.values());
      if (remaining.length > 0) {
        this.setActiveDocument(remaining[remaining.length - 1].id);
      } else {
        this.activeDocumentId = null;
        eventBus.emit(AppEvents.DOCUMENT_ACTIVATED, null);
      }
    }

    return true;
  }

  /**
   * Sets the active document.
   * @param {string | null} id
   */
  setActiveDocument(id) {
    if (id && !this.documents.has(id)) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${id} not found.`);
    }
    this.activeDocumentId = id;
    const doc = id ? this.documents.get(id) : null;
    eventBus.emit(AppEvents.DOCUMENT_ACTIVATED, doc);
  }

  /**
   * Gets the currently active document model.
   * @returns {any | null}
   */
  getActiveDocument() {
    return this.activeDocumentId ? this.documents.get(this.activeDocumentId) || null : null;
  }

  /**
   * Gets all currently open documents.
   * @returns {Array<any>}
   */
  getOpenDocuments() {
    return Array.from(this.documents.values());
  }
}

export const documentStateManager = new DocumentStateManager();
