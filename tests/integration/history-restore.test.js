import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryCoordinator } from '../../src/core/history-coordinator.js';
import { RestoreCoordinator } from '../../src/core/restore-coordinator.js';
import { DocumentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { RevisionHistoryStore } from '../../src/services/revision-history-store.js';
import { ChangeSummaryService } from '../../src/services/change-summary-service.js';
import { AuditLogService } from '../../src/services/audit-log-service.js';
import { AppEvents, eventBus } from '../../src/app/events.js';

describe('Document Revision History & Restore Lifecycle Integration (Release 0.6)', () => {
  let stateManager;
  let historyStore;
  let auditService;
  let summaryService;
  let historyCoord;
  let restoreCoord;
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

    historyCoord = new HistoryCoordinator({
      historyStore,
      summaryService,
      auditService,
      stateManager,
    });

    restoreCoord = new RestoreCoordinator({
      stateManager,
      historyStore,
      summaryService,
      auditService,
    });
  });

  it('runs full lifecycle: open -> edit -> save -> checkpoint -> restore preview -> confirmed restore -> audit verified', async () => {
    // 1. Open a document
    const doc = stateManager.openDocument('guides/getting-started.md', '# Getting Started\nStep 1: Install', 'hash1', Date.now());
    eventBus.emit(AppEvents.DOCUMENT_OPENED, doc);

    // Initial baseline recorded
    let history = historyCoord.getDocumentHistory(doc.id);
    expect(history.length).toBe(1);
    expect(history[0].summary).toBe('Initial document load');
    const v1HistoryId = history[0].historyId;

    // 2. User edits document and saves (Save 1)
    stateManager.updateContent(doc.id, '# Getting Started\nStep 1: Install\nStep 2: Configure');
    doc.state = DocumentState.CLEAN; // simulated save
    await historyCoord.onDocumentSaved(doc);

    history = historyCoord.getDocumentHistory(doc.id);
    expect(history.length).toBe(2);
    expect(history[0].source).toBe('local_save');
    expect(history[0].summary).toContain('Saved to disk');
    const v2HistoryId = history[0].historyId;

    // 3. User edits again and creates manual checkpoint
    stateManager.updateContent(doc.id, '# Getting Started\nStep 1: Install\nStep 2: Configure\nStep 3: Run');
    await historyCoord.createCheckpoint(doc.id, 'Pre-release checkpoint');

    history = historyCoord.getDocumentHistory(doc.id);
    expect(history.length).toBe(3);
    expect(history[0].summary).toBe('Pre-release checkpoint');

    // 4. User opens restore preview to inspect V1
    const preview = await restoreCoord.createPreview({
      docId: doc.id,
      targetHistoryId: v1HistoryId,
    });

    expect(preview.workingContent).toBe('# Getting Started\nStep 1: Install\nStep 2: Configure\nStep 3: Run');
    expect(preview.targetContent).toBe('# Getting Started\nStep 1: Install');
    expect(preview.diff.length).toBeGreaterThan(0);

    // Document remains unmutated (Invariant 2)
    expect(stateManager.documents.get(doc.id).content).toBe('# Getting Started\nStep 1: Install\nStep 2: Configure\nStep 3: Run');

    // 5. User confirms restore
    const restoreResult = await restoreCoord.confirmRestore({
      previewId: preview.previewId,
      forceIfDirty: true,
    });

    expect(restoreResult.success).toBe(true);

    // Document in stateManager now holds V1 content
    expect(stateManager.documents.get(doc.id).content).toBe('# Getting Started\nStep 1: Install');

    // 6. Invariant 1: History is append-only, new snapshot with source 'restore' created
    const finalHistory = historyCoord.getDocumentHistory(doc.id);
    expect(finalHistory.length).toBe(4);
    expect(finalHistory[0].source).toBe('restore');
    expect(finalHistory[0].summary).toContain('Restored');

    // 7. Invariant 7: Audit Completeness: Verify audit log recorded OPEN, SAVE, and RESTORE
    const allAudits = auditService.getAllEvents();
    const actions = allAudits.map(a => a.action);
    expect(actions).toContain('OPEN');
    expect(actions).toContain('SAVE');
    expect(actions).toContain('RESTORE');
  });
});
