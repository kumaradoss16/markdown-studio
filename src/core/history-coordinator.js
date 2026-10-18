import { revisionHistoryStore, computeContentHash } from '../services/revision-history-store.js';
import { changeSummaryService } from '../services/change-summary-service.js';
import { auditLogService } from '../services/audit-log-service.js';
import { documentStateManager } from './document-state-manager.js';
import { AppEvents, eventBus } from '../app/events.js';
import { ErrorCode, StudioError } from '../services/error-service.js';

/**
 * HistoryCoordinator
 * Central orchestrator connecting DocumentStateManager, SaveCoordinator,
 * RevisionHistoryStore, ChangeSummaryService, and AuditLogService.
 */
export class HistoryCoordinator {
  /**
   * @param {Object} [deps]
   * @param {import('../services/revision-history-store.js').RevisionHistoryStore} [deps.historyStore]
   * @param {import('../services/change-summary-service.js').ChangeSummaryService} [deps.summaryService]
   * @param {import('../services/audit-log-service.js').AuditLogService} [deps.auditService]
   * @param {import('./document-state-manager.js').DocumentStateManager} [deps.stateManager]
   */
  constructor(deps = {}) {
    this.historyStore = deps.historyStore || revisionHistoryStore;
    this.summaryService = deps.summaryService || changeSummaryService;
    this.auditService = deps.auditService || auditLogService;
    this.stateManager = deps.stateManager || documentStateManager;

    // Cache last content hash per documentKey to avoid redundant identical snapshots
    this.lastCapturedHashes = new Map();

    this.setupListeners();
  }

  setupListeners() {
    // 1. On successful save to disk
    eventBus.on(AppEvents.DOCUMENT_SAVED, async (doc) => {
      try {
        await this.onDocumentSaved(doc);
      } catch (err) {
        console.warn('HistoryCoordinator error on DOCUMENT_SAVED:', err);
      }
    });

    // 2. On document opened
    eventBus.on(AppEvents.DOCUMENT_OPENED, async (doc) => {
      try {
        if (!doc) return;
        const key = this.getDocumentKey(doc);
        this.auditService.recordEvent({
          documentKey: key,
          action: 'OPEN',
          outcome: 'SUCCESS',
          contentHash: doc.content ? computeContentHash(doc.content) : null,
          summary: `Opened document "${doc.name}"`,
          details: { path: doc.path, id: doc.id },
        });

        // If newly opened existing document has no history yet, record initial baseline
        const existing = this.historyStore.listHistory(key);
        if (existing.length === 0 && doc.content) {
          const contentHash = computeContentHash(doc.content);
          this.lastCapturedHashes.set(key, contentHash);
          await this.historyStore.recordSnapshot({
            documentKey: key,
            content: doc.content,
            source: 'local_save',
            summary: 'Initial document load',
            metadata: { isInitial: true, docId: doc.id },
          });
        }
      } catch (err) {
        console.warn('HistoryCoordinator error on DOCUMENT_OPENED:', err);
      }
    });

    // 3. On document closed
    eventBus.on(AppEvents.DOCUMENT_CLOSED, ({ id, name }) => {
      try {
        this.auditService.recordEvent({
          documentKey: id,
          action: 'CLOSE',
          outcome: 'SUCCESS',
          summary: `Closed document "${name || id}"`,
          details: { id, name },
        });
      } catch (_) {}
    });
  }

  /**
   * Resolves the canonical key for a document: path if saved, session id if untitled.
   * @param {Object} doc
   * @returns {string}
   */
  getDocumentKey(doc) {
    if (!doc) return '';
    return doc.path || doc.id;
  }

  /**
   * Handles document saved event: handles key re-keying and snapshots.
   * @param {Object} doc
   */
  async onDocumentSaved(doc) {
    if (!doc) return;

    const currentKey = this.getDocumentKey(doc);
    // If doc was previously keyed under its untitled session ID, rekey history to the new path
    if (doc.path && doc.id !== doc.path) {
      this.historyStore.rekeyDocumentHistory(doc.id, doc.path);
    }

    const currentContent = doc.content || '';
    const currentHash = computeContentHash(currentContent);

    // Retrieve previous snapshot to build deterministic diff summary
    const historyList = this.historyStore.listHistory(currentKey);
    let previousContent = '';
    if (historyList.length > 0) {
      const latestSnapshot = historyList[0];
      // If content is identical to latest recorded snapshot, do not duplicate snapshot
      if (latestSnapshot.contentHash === currentHash) {
        // Still record audit event
        this.auditService.recordEvent({
          documentKey: currentKey,
          action: 'SAVE',
          outcome: 'SUCCESS',
          contentHash: currentHash,
          summary: `Saved "${doc.name}" (no content changes)`,
          details: { path: doc.path, revision: doc.revision },
        });
        return;
      }
      try {
        previousContent = await this.historyStore.getSnapshotContent(currentKey, latestSnapshot.historyId);
      } catch (_) {
        previousContent = '';
      }
    }

    const summary = this.summaryService.generateSummary({
      source: 'local_save',
      oldText: previousContent,
      newText: currentContent,
      metadata: { isInitial: historyList.length === 0 },
    });

    const snapshot = await this.historyStore.recordSnapshot({
      documentKey: currentKey,
      content: currentContent,
      source: 'local_save',
      summary,
      metadata: { docId: doc.id, savedRevision: doc.savedRevision },
    });

    this.lastCapturedHashes.set(currentKey, currentHash);

    // Invariant 7: Audit Completeness
    this.auditService.recordEvent({
      documentKey: currentKey,
      action: 'SAVE',
      outcome: 'SUCCESS',
      contentHash: currentHash,
      summary,
      details: {
        path: doc.path,
        revision: doc.revision,
        historyId: snapshot.historyId,
      },
    });
  }

  /**
   * Creates an explicit user or system checkpoint.
   * @param {string} docId
   * @param {string} [customMessage]
   * @returns {Promise<Object>}
   */
  async createCheckpoint(docId, customMessage = null) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${docId} not found.`);
    }

    const key = this.getDocumentKey(doc);
    const content = doc.content || '';
    const currentHash = computeContentHash(content);

    const historyList = this.historyStore.listHistory(key);
    let previousContent = '';
    if (historyList.length > 0) {
      try {
        previousContent = await this.historyStore.getSnapshotContent(key, historyList[0].historyId);
      } catch (_) {}
    }

    const summary = this.summaryService.generateSummary({
      source: 'autosnapshot',
      oldText: previousContent,
      newText: content,
      customMessage,
    });

    const snapshot = await this.historyStore.recordSnapshot({
      documentKey: key,
      content,
      source: 'autosnapshot',
      summary,
      metadata: { docId: doc.id, revision: doc.revision },
    });

    this.lastCapturedHashes.set(key, currentHash);

    this.auditService.recordEvent({
      documentKey: key,
      action: 'SAVE',
      outcome: 'SUCCESS',
      contentHash: currentHash,
      summary: `Checkpoint: ${summary}`,
      details: { historyId: snapshot.historyId, revision: doc.revision },
    });

    return snapshot;
  }

  /**
   * Lists ordered revision history for a document.
   * @param {string} docId
   * @returns {Array<Object>}
   */
  getDocumentHistory(docId) {
    const doc = this.stateManager.documents.get(docId);
    const key = doc ? this.getDocumentKey(doc) : docId;
    return this.historyStore.listHistory(key);
  }

  /**
   * Retrieves content of a specific snapshot for a document.
   * @param {string} docId
   * @param {string} historyId
   * @returns {Promise<string>}
   */
  async getSnapshotContent(docId, historyId) {
    const doc = this.stateManager.documents.get(docId);
    const key = doc ? this.getDocumentKey(doc) : docId;
    return await this.historyStore.getSnapshotContent(key, historyId);
  }
}

export const historyCoordinator = new HistoryCoordinator();
