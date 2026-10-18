import { revisionHistoryStore, computeContentHash } from '../services/revision-history-store.js';
import { changeSummaryService } from '../services/change-summary-service.js';
import { auditLogService } from '../services/audit-log-service.js';
import { documentStateManager, DocumentState } from './document-state-manager.js';
import { computeLineDiff } from '../services/revision-comparison-service.js';
import { ErrorCode, StudioError } from '../services/error-service.js';
import { AppEvents, eventBus } from '../app/events.js';

/**
 * RestoreCoordinator
 * Manages the secure, isolated restore workflow:
 * - Invariant 1: History Non-Mutation (reverts are recorded as new 'restore' entries)
 * - Invariant 2: Preview Isolation (generating preview never mutates document state)
 * - Invariant 3: Explicit Restore Only (no background restoration)
 * - Invariant 4: Stale Restore Rejection (rejects restore if document revision changes after preview)
 * - Invariant 5: Hash Integrity
 * - Invariant 6: No Silent Disk Overwrite (explicit conflict handling on dirty docs)
 * - Invariant 7: Audit Completeness
 * - Invariant 11: Local/Remote Segregation
 */
export class RestoreCoordinator {
  /**
   * @param {Object} [deps]
   * @param {import('./document-state-manager.js').DocumentStateManager} [deps.stateManager]
   * @param {import('../services/revision-history-store.js').RevisionHistoryStore} [deps.historyStore]
   * @param {import('../services/change-summary-service.js').ChangeSummaryService} [deps.summaryService]
   * @param {import('../services/audit-log-service.js').AuditLogService} [deps.auditService]
   */
  constructor(deps = {}) {
    this.stateManager = deps.stateManager || documentStateManager;
    this.historyStore = deps.historyStore || revisionHistoryStore;
    this.summaryService = deps.summaryService || changeSummaryService;
    this.auditService = deps.auditService || auditLogService;

    /** @type {Map<string, Object>} */
    this.activePreviews = new Map();
  }

  /**
   * Resolves canonical key for a document.
   * @param {Object} doc
   * @returns {string}
   */
  getDocumentKey(doc) {
    if (!doc) return '';
    return doc.path || doc.id;
  }

  /**
   * Generates a read-only restore preview comparing current working buffer with target revision.
   * Enforces Invariant 2: Preview Isolation (working doc is strictly unmutated).
   * 
   * @param {Object} params
   * @param {string} params.docId
   * @param {string} params.targetHistoryId
   * @returns {Promise<Object>} RestorePreviewSnapshot
   */
  async createPreview({ docId, targetHistoryId }) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${docId} not found.`);
    }

    const documentKey = this.getDocumentKey(doc);
    const targetSnapshot = this.historyStore.getSnapshot(documentKey, targetHistoryId);
    if (!targetSnapshot) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Revision snapshot "${targetHistoryId}" not found for "${doc.name}".`);
    }

    // Pin target historyId to protect it from eviction during in-flight preview
    this.historyStore.pinHistoryId(targetHistoryId);

    // Invariant 5: Hash Integrity enforced here
    const targetContent = await this.historyStore.getSnapshotContent(documentKey, targetHistoryId);

    // Capture working state snapshot without mutating live document (Invariant 2)
    const capturedWorkingRevision = doc.revision;
    const workingContent = doc.content || '';

    // Compute side-by-side diff (Current Working vs Target Revision)
    const diff = computeLineDiff(workingContent, targetContent);

    const previewId = 'prev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const preview = {
      previewId,
      docId,
      documentKey,
      targetHistoryId,
      targetSnapshot,
      capturedWorkingRevision,
      workingContent,
      targetContent,
      targetContentHash: targetSnapshot.contentHash,
      diff,
      isDirty: doc.state === DocumentState.DIRTY,
      createdAt: new Date().toISOString(),
    };

    this.activePreviews.set(previewId, preview);
    eventBus.emit(AppEvents.RESTORE_PREVIEW_OPENED, preview);

    return preview;
  }

  /**
   * Cancels an active preview and unpins the target revision.
   * @param {string} previewId
   */
  cancelPreview(previewId) {
    const preview = this.activePreviews.get(previewId);
    if (preview) {
      this.historyStore.unpinHistoryId(preview.targetHistoryId);
      this.activePreviews.delete(previewId);
    }
  }

  /**
   * Applies target revision to the live document after explicit confirmation.
   * 
   * @param {Object} params
   * @param {string} params.previewId
   * @param {boolean} [params.forceIfDirty=false]
   * @returns {Promise<Object>}
   */
  async confirmRestore({ previewId, forceIfDirty = false }) {
    const preview = this.activePreviews.get(previewId);
    if (!preview) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Restore preview session expired or not found. Please re-open preview.');
    }

    const doc = this.stateManager.documents.get(preview.docId);
    if (!doc) {
      this.cancelPreview(previewId);
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${preview.docId} is no longer open.`);
    }

    // Invariant 4: Stale Restore Rejection
    // If the document was modified while preview was open, reject restoration!
    if (doc.revision !== preview.capturedWorkingRevision) {
      this.cancelPreview(previewId);
      throw new StudioError(
        ErrorCode.STALE_RESTORE,
        `Document was modified after restore preview was opened (revision moved from ${preview.capturedWorkingRevision} to ${doc.revision}). Restore rejected to prevent overwriting newer changes. Please open a fresh preview.`
      );
    }

    // Invariant 6: No Silent Disk Overwrite
    // If document is dirty and user hasn't explicitly allowed overwriting unsaved changes
    if (doc.state === DocumentState.DIRTY && !forceIfDirty) {
      throw new StudioError(
        ErrorCode.RESTORE_CONFLICT,
        `Document has unsaved working changes. Explicit confirmation is required to overwrite unsaved changes.`
      );
    }

    try {
      // 1. Update live document content via StateManager (updates revision, marks dirty, notifies CodeMirror & Preview)
      this.stateManager.updateContent(doc.id, preview.targetContent);

      // 2. Invariant 1: History Non-Mutation
      // Record a new checkpoint snapshot representing the restore action
      const summary = this.summaryService.generateSummary({
        source: 'restore',
        oldText: preview.workingContent,
        newText: preview.targetContent,
        metadata: {
          restoredFromHistoryId: preview.targetHistoryId,
          restoredFromRevision: preview.targetSnapshot.revisionNumber,
        },
      });

      const newSnapshot = await this.historyStore.recordSnapshot({
        documentKey: preview.documentKey,
        content: preview.targetContent,
        source: 'restore',
        summary,
        metadata: {
          docId: doc.id,
          restoredFromHistoryId: preview.targetHistoryId,
          restoredFromRevision: preview.targetSnapshot.revisionNumber,
          appliedRevision: doc.revision,
        },
      });

      // 3. Invariant 7: Audit Completeness
      this.auditService.recordEvent({
        documentKey: preview.documentKey,
        action: 'RESTORE',
        outcome: 'SUCCESS',
        contentHash: preview.targetContentHash,
        summary,
        details: {
          restoredFromHistoryId: preview.targetHistoryId,
          restoredFromRevision: preview.targetSnapshot.revisionNumber,
          previousRevision: preview.capturedWorkingRevision,
          newRevision: doc.revision,
          newHistoryId: newSnapshot.historyId,
        },
      });

      // 4. Cleanup preview session
      this.historyStore.unpinHistoryId(preview.targetHistoryId);
      this.activePreviews.delete(previewId);

      eventBus.emit(AppEvents.RESTORE_APPLIED, {
        doc,
        restoredFromHistoryId: preview.targetHistoryId,
        newRevision: doc.revision,
      });

      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'success',
        message: `Restored "${doc.name}" to revision ${preview.targetSnapshot.revisionNumber || preview.targetHistoryId.slice(0, 8)}.`,
      });

      return {
        success: true,
        doc,
        newRevision: doc.revision,
        newSnapshot,
      };
    } catch (err) {
      this.cancelPreview(previewId);
      if (err instanceof StudioError) throw err;
      throw new StudioError(ErrorCode.UNKNOWN, `Restore application failed: ${err.message}`, err);
    }
  }
}

export const restoreCoordinator = new RestoreCoordinator();
