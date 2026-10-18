import { documentStateManager } from '../../core/document-state-manager.js';
import { historyCoordinator } from '../../core/history-coordinator.js';
import { restoreCoordinator } from '../../core/restore-coordinator.js';
import { auditLogService } from '../../services/audit-log-service.js';
import { computeLineDiff } from '../../services/revision-comparison-service.js';
import { historyDiffModalComponent } from './history-diff-modal.js';
import { AppEvents, eventBus } from '../../app/events.js';

/**
 * HistoryPanelComponent
 * Displays ordered document revisions, change summaries, and audit records.
 * Enables side-by-side diffing, explicit checkpoint creation, and restore previews.
 */
export class HistoryPanelComponent {
  constructor() {
    this.modalEl = null;
    this.activeDocId = null;
    this.activeTab = 'revisions'; // 'revisions' | 'audit'
    this.selectedHistoryIds = new Set();

    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.HISTORY_OPEN_REQUESTED, ({ docId }) => {
      this.show(docId);
    });

    eventBus.on(AppEvents.HISTORY_SNAPSHOT_RECORDED, () => {
      if (this.modalEl && this.activeDocId) {
        this.renderBody();
      }
    });

    eventBus.on(AppEvents.RESTORE_APPLIED, () => {
      if (this.modalEl && this.activeDocId) {
        this.renderBody();
      }
    });

    eventBus.on(AppEvents.AUDIT_RECORDED, () => {
      if (this.modalEl && this.activeDocId && this.activeTab === 'audit') {
        this.renderBody();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl) {
        this.close();
      }
    });
  }

  show(docId = null) {
    this.close();

    const targetDoc = docId
      ? documentStateManager.documents.get(docId)
      : documentStateManager.getActiveDocument();

    if (!targetDoc) {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'warning',
        message: 'No active document open to view version history.',
      });
      return;
    }

    this.activeDocId = targetDoc.id;
    this.selectedHistoryIds.clear();

    const modal = document.createElement('div');
    modal.className = 'diff-modal-backdrop history-modal-backdrop';
    modal.innerHTML = `
      <div class="diff-modal-container history-container" role="dialog" aria-modal="true" style="max-width: 780px;">
        <div class="diff-modal-header">
          <div class="diff-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Version History: <strong>${this.escapeHtml(targetDoc.name)}</strong></span>
          </div>
          <button class="diff-close-btn" id="historyModalCloseX">×</button>
        </div>

        <div class="history-tabs-strip">
          <div style="display: flex; gap: 8px;">
            <button class="history-tab-btn active" id="tabRevisionsBtn">Revisions</button>
            <button class="history-tab-btn" id="tabAuditBtn">Audit Log</button>
          </div>
          <button class="diff-btn secondary" id="btnCreateCheckpoint" style="font-size: 11px; padding: 4px 10px;">
            + Create Checkpoint
          </button>
        </div>

        <div id="historyModalBody" class="history-modal-body"></div>

        <div class="diff-modal-footer" style="justify-content: space-between;">
          <div id="historySelectionActions" style="display: none; align-items: center; gap: 8px;">
            <span id="historySelectionCount" style="font-size: 11px; color: #94a3b8;">2 selected</span>
            <button class="diff-btn secondary" id="btnCompareSelected" style="font-size: 11px;">
              Compare Selected (A vs B)
            </button>
          </div>
          <div style="margin-left: auto;">
            <button class="diff-btn primary" id="historyDoneBtn">Done</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Attach tab switches
    const tabRevisions = modal.querySelector('#tabRevisionsBtn');
    const tabAudit = modal.querySelector('#tabAuditBtn');

    tabRevisions?.addEventListener('click', () => {
      this.activeTab = 'revisions';
      tabRevisions.classList.add('active');
      tabAudit.classList.remove('active');
      this.renderBody();
    });

    tabAudit?.addEventListener('click', () => {
      this.activeTab = 'audit';
      tabAudit.classList.add('active');
      tabRevisions.classList.remove('active');
      this.renderBody();
    });

    // Create Checkpoint button
    modal.querySelector('#btnCreateCheckpoint')?.addEventListener('click', async () => {
      const msg = prompt('Enter a short checkpoint description (optional):');
      if (msg !== null) {
        try {
          await historyCoordinator.createCheckpoint(this.activeDocId, msg.trim() || null);
          this.renderBody();
          eventBus.emit(AppEvents.NOTIFICATION, {
            type: 'success',
            message: 'Recorded checkpoint revision.',
          });
        } catch (err) {
          alert(`Failed to create checkpoint: ${err.message}`);
        }
      }
    });

    // Close actions
    modal.querySelector('#historyModalCloseX')?.addEventListener('click', () => this.close());
    modal.querySelector('#historyDoneBtn')?.addEventListener('click', () => this.close());

    // Compare selected revisions
    modal.querySelector('#btnCompareSelected')?.addEventListener('click', async () => {
      await this.compareSelectedRevisions();
    });

    this.renderBody();
  }

  renderBody() {
    const bodyEl = this.modalEl?.querySelector('#historyModalBody');
    if (!bodyEl || !this.activeDocId) return;

    const doc = documentStateManager.documents.get(this.activeDocId);
    if (!doc) {
      bodyEl.innerHTML = '<div class="history-empty">Document closed.</div>';
      return;
    }

    if (this.activeTab === 'audit') {
      this.renderAuditView(bodyEl, doc);
    } else {
      this.renderRevisionsView(bodyEl, doc);
    }
  }

  renderRevisionsView(container, doc) {
    const historyList = historyCoordinator.getDocumentHistory(doc.id);
    this.updateSelectionBar();

    if (historyList.length === 0) {
      container.innerHTML = `
        <div class="history-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div style="font-weight: 500; font-size: 13px; color: #cbd5e1; margin-top: 6px;">No checkpoints recorded yet</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Save the document or click "+ Create Checkpoint" above to record revision history.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="history-list">
        ${historyList.map((item) => {
          const isSelected = this.selectedHistoryIds.has(item.historyId);
          return `
            <div class="history-item-card ${isSelected ? 'selected' : ''}" data-history-id="${item.historyId}">
              <div class="history-item-top">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" class="history-select-chk" data-chk-id="${item.historyId}" ${isSelected ? 'checked' : ''} title="Select to compare revisions" />
                  <span class="history-rev-number">Rev #${item.revisionNumber || 1}</span>
                  <span class="history-source-badge ${item.source}">${item.source}</span>
                  <span class="history-timestamp">${this.formatDate(item.createdAt)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <code class="commit-pill">#${item.contentHash}</code>
                </div>
              </div>
              <div class="history-item-summary">
                ${this.escapeHtml(item.summary)}
              </div>
              <div class="history-item-actions">
                <button class="diff-btn secondary btn-compare-working" data-hist-id="${item.historyId}">
                  👁 Compare with Working
                </button>
                <button class="diff-btn primary btn-preview-restore" data-hist-id="${item.historyId}">
                  ↺ Preview Restore...
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind item selection checkboxes
    container.querySelectorAll('.history-select-chk').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const hid = chk.getAttribute('data-chk-id');
        if (e.target.checked) {
          if (this.selectedHistoryIds.size >= 2) {
            // Keep at most 2 selections
            const first = this.selectedHistoryIds.values().next().value;
            this.selectedHistoryIds.delete(first);
          }
          this.selectedHistoryIds.add(hid);
        } else {
          this.selectedHistoryIds.delete(hid);
        }
        this.renderBody();
      });
    });

    // Compare with Working buttons
    container.querySelectorAll('.btn-compare-working').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hid = btn.getAttribute('data-hist-id');
        await this.compareWithWorking(hid);
      });
    });

    // Preview Restore buttons
    container.querySelectorAll('.btn-preview-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hid = btn.getAttribute('data-hist-id');
        await this.previewRestore(hid);
      });
    });
  }

  renderAuditView(container, doc) {
    const key = historyCoordinator.getDocumentKey(doc);
    const events = auditLogService.queryEvents({ documentKey: key });

    if (events.length === 0) {
      container.innerHTML = `
        <div class="history-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div style="font-weight: 500; font-size: 13px; color: #cbd5e1; margin-top: 6px;">No audit records found</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Local and remote document operations will be recorded here automatically.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="history-audit-list">
        ${events.map((ev) => `
          <div class="history-audit-item">
            <div class="history-audit-top">
              <span class="audit-action-badge ${ev.action.toLowerCase()}">${ev.action}</span>
              <span class="audit-outcome-badge ${ev.outcome.toLowerCase()}">${ev.outcome}</span>
              <span class="history-timestamp">${this.formatDate(ev.timestamp)}</span>
              <span style="font-size: 10.5px; color: #64748b; margin-left: auto;">by <strong>${this.escapeHtml(ev.actor)}</strong></span>
            </div>
            <div class="history-audit-summary">${this.escapeHtml(ev.summary)}</div>
            ${ev.contentHash ? `<div style="font-size: 10px; color: #64748b; margin-top: 3px;">Hash: <code class="commit-pill">#${ev.contentHash}</code></div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  updateSelectionBar() {
    const bar = this.modalEl?.querySelector('#historySelectionActions');
    const countEl = this.modalEl?.querySelector('#historySelectionCount');
    if (!bar) return;

    if (this.selectedHistoryIds.size === 2) {
      bar.style.display = 'flex';
      if (countEl) countEl.textContent = '2 revisions selected';
    } else if (this.selectedHistoryIds.size === 1) {
      bar.style.display = 'flex';
      if (countEl) countEl.textContent = 'Select 1 more revision to compare';
    } else {
      bar.style.display = 'none';
    }
  }

  async compareWithWorking(historyId) {
    const doc = documentStateManager.documents.get(this.activeDocId);
    if (!doc) return;

    try {
      const historicalContent = await historyCoordinator.getSnapshotContent(doc.id, historyId);
      const snapshot = historyCoordinator.getDocumentHistory(doc.id).find((s) => s.historyId === historyId);
      const diff = computeLineDiff(historicalContent, doc.content || '');

      historyDiffModalComponent.showDiffComparison({
        title: `Compare: Historical Rev #${snapshot?.revisionNumber || 1} vs Working Buffer`,
        labelA: `Historical Rev #${snapshot?.revisionNumber || 1} (${this.formatDate(snapshot?.createdAt)})`,
        labelB: `Current Working Buffer (Rev #${doc.revision})`,
        diff,
      });
    } catch (err) {
      alert(`Could not load revision content: ${err.message}`);
    }
  }

  async compareSelectedRevisions() {
    if (this.selectedHistoryIds.size !== 2) return;
    const doc = documentStateManager.documents.get(this.activeDocId);
    if (!doc) return;

    const [idA, idB] = Array.from(this.selectedHistoryIds);
    try {
      const contentA = await historyCoordinator.getSnapshotContent(doc.id, idA);
      const contentB = await historyCoordinator.getSnapshotContent(doc.id, idB);
      const snapA = historyCoordinator.getDocumentHistory(doc.id).find((s) => s.historyId === idA);
      const snapB = historyCoordinator.getDocumentHistory(doc.id).find((s) => s.historyId === idB);

      const diff = computeLineDiff(contentA, contentB);
      historyDiffModalComponent.showDiffComparison({
        title: `Compare Revisions: Rev #${snapA?.revisionNumber || 1} vs Rev #${snapB?.revisionNumber || 2}`,
        labelA: `Rev #${snapA?.revisionNumber || 1} (${this.formatDate(snapA?.createdAt)})`,
        labelB: `Rev #${snapB?.revisionNumber || 2} (${this.formatDate(snapB?.createdAt)})`,
        diff,
      });
    } catch (err) {
      alert(`Comparison error: ${err.message}`);
    }
  }

  async previewRestore(historyId) {
    try {
      const preview = await restoreCoordinator.createPreview({
        docId: this.activeDocId,
        targetHistoryId: historyId,
      });
      historyDiffModalComponent.showRestorePreview(preview);
    } catch (err) {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'error',
        message: `Restore preview failed: ${err.message}`,
      });
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    this.activeDocId = null;
    this.selectedHistoryIds.clear();
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoStr;
    }
  }
}

export const historyPanelComponent = new HistoryPanelComponent();
