import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreCoordinator } from '../../src/core/restore-coordinator.js';
import { DocumentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { RevisionHistoryStore } from '../../src/services/revision-history-store.js';
import { ChangeSummaryService } from '../../src/services/change-summary-service.js';
import { AuditLogService } from '../../src/services/audit-log-service.js';
import { ErrorCode } from '../../src/services/error-service.js';

describe('RestoreCoordinator (Release 0.6)', () => {
  let coordinator;
  let stateManager;
  let historyStore;
  let auditService;
  let summaryService;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      _data: {},
      getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    };

    stateManager = new DocumentStateManager();
    historyStore = new RevisionHistoryStore({ storage: mockStorage });
    auditService = new AuditLogService({ storage: mockStorage });
    summaryService = new ChangeSummaryService();

    coordinator = new RestoreCoordinator({
      stateManager,
      historyStore,
      summaryService,
      auditService,
    });
  });

  it('enforces Invariant 2: Preview Isolation (generating preview never mutates document state or content)', async () => {
    const doc = stateManager.openDocument('notes.md', 'Current working content', 'hash1', Date.now());
    const initialRevision = doc.revision;

    const snap = await historyStore.recordSnapshot({
      documentKey: 'notes.md',
      content: 'Past historical version',
      source: 'local_save',
    });

    const preview = await coordinator.createPreview({
      docId: doc.id,
      targetHistoryId: snap.historyId,
    });

    expect(preview).toBeDefined();
    expect(preview.previewId).toBeDefined();
    expect(preview.workingContent).toBe('Current working content');
    expect(preview.targetContent).toBe('Past historical version');
    expect(preview.diff.length).toBeGreaterThan(0);

    // Verify document was NOT modified in stateManager
    const liveDoc = stateManager.documents.get(doc.id);
    expect(liveDoc.content).toBe('Current working content');
    expect(liveDoc.revision).toBe(initialRevision);
    expect(liveDoc.state).toBe(DocumentState.CLEAN);
  });

  it('enforces Invariant 4: Stale Restore Rejection (rejects restore if document revision changes after preview opened)', async () => {
    const doc = stateManager.openDocument('notes.md', 'V1 content', 'hash1', Date.now());

    const snap = await historyStore.recordSnapshot({
      documentKey: 'notes.md',
      content: 'V0 ancient content',
      source: 'local_save',
    });

    const preview = await coordinator.createPreview({
      docId: doc.id,
      targetHistoryId: snap.historyId,
    });

    // User types in the editor while preview modal was open!
    stateManager.updateContent(doc.id, 'V1.1 newer user edits');

    // Confirming restore should fail with STALE_RESTORE
    await expect(coordinator.confirmRestore({ previewId: preview.previewId })).rejects.toMatchObject({
      code: ErrorCode.STALE_RESTORE,
    });

    // Content should remain the user's latest edit
    expect(stateManager.documents.get(doc.id).content).toBe('V1.1 newer user edits');
  });

  it('enforces Invariant 6: No Silent Disk Overwrite (requires forceIfDirty when document is dirty)', async () => {
    const doc = stateManager.openDocument('notes.md', 'Saved text', 'hash1', Date.now());
    stateManager.updateContent(doc.id, 'Unsaved dirty text');
    expect(doc.state).toBe(DocumentState.DIRTY);

    const snap = await historyStore.recordSnapshot({
      documentKey: 'notes.md',
      content: 'Old clean version',
      source: 'local_save',
    });

    const preview = await coordinator.createPreview({
      docId: doc.id,
      targetHistoryId: snap.historyId,
    });

    // Restore without forceIfDirty should reject
    await expect(coordinator.confirmRestore({ previewId: preview.previewId, forceIfDirty: false })).rejects.toMatchObject({
      code: ErrorCode.RESTORE_CONFLICT,
    });

    // Restore WITH forceIfDirty should succeed
    const result = await coordinator.confirmRestore({ previewId: preview.previewId, forceIfDirty: true });
    expect(result.success).toBe(true);
    expect(stateManager.documents.get(doc.id).content).toBe('Old clean version');
  });

  it('enforces Invariant 1: History Non-Mutation and Invariant 7: Audit Completeness', async () => {
    const doc = stateManager.openDocument('notes.md', 'Working text', 'hash1', Date.now());

    const snap1 = await historyStore.recordSnapshot({
      documentKey: 'notes.md',
      content: 'Historical Snapshot 1',
      source: 'local_save',
    });

    const preview = await coordinator.createPreview({
      docId: doc.id,
      targetHistoryId: snap1.historyId,
    });

    const result = await coordinator.confirmRestore({ previewId: preview.previewId });
    expect(result.success).toBe(true);

    // Verify Invariant 1: snap1 is intact and untouched, and a NEW snapshot with source 'restore' was recorded
    const history = await historyStore.getHistory('notes.md');
    expect(history.length).toBe(2);
    expect(history[0].source).toBe('restore');
    expect(history[1].historyId).toBe(snap1.historyId);
    expect(history[1].source).toBe('local_save');

    // Verify Invariant 7: Audit Completeness
    const auditEvents = auditService.getEvents({ action: 'RESTORE' });
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].outcome).toBe('SUCCESS');
    expect(auditEvents[0].details.restoredFromHistoryId).toBe(snap1.historyId);
  });
});
