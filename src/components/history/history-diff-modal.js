import { restoreCoordinator } from '../../core/restore-coordinator.js';
import { AppEvents, eventBus } from '../../app/events.js';

/**
 * HistoryDiffModalComponent
 * Provides side-by-side / dual-pane line difference inspection between:
 * - Current working buffer vs Historical snapshot (Restore Preview Mode)
 * - Historical snapshot A vs Historical snapshot B (Comparison Mode)
 * Enforces Invariant 2 (Preview Isolation) and Invariant 3 (Explicit Restore Only).
 */
export class HistoryDiffModalComponent {
  constructor() {
    this.modalEl = null;
    this.activePreviewId = null;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl) {
        this.close();
      }
    });
  }

  /**
   * Opens the modal in Restore Preview mode.
   * @param {Object} preview - Output from restoreCoordinator.createPreview()
   */
  showRestorePreview(preview) {
    this.close();
    this.activePreviewId = preview.previewId;

    const snapshot = preview.targetSnapshot;
    const isDirty = preview.isDirty;

    let added = 0;
    let removed = 0;
    for (const line of preview.diff) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }

    const modal = document.createElement('div');
    modal.className = 'diff-modal-backdrop history-diff-backdrop';
    modal.innerHTML = `
      <div class="diff-modal-container" role="dialog" aria-modal="true">
        <div class="diff-modal-header">
          <div class="diff-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Restore Preview: <strong>Revision #${snapshot.revisionNumber || 1}</strong> vs Working Buffer</span>
            <span class="diff-classification-badge local_modified">+${added} / -${removed} lines</span>
          </div>
          <button class="diff-close-btn" id="histDiffCloseX">×</button>
        </div>

        <div class="diff-meta-strip">
          <div class="meta-item"><span>Target Revision:</span> <strong style="color: #38bdf8;">Rev #${snapshot.revisionNumber || 1}</strong></div>
          <div class="meta-item"><span>Recorded:</span> <strong>${this.formatDate(snapshot.createdAt)}</strong></div>
          <div class="meta-item"><span>Source:</span> <span class="history-source-badge ${snapshot.source}">${snapshot.source}</span></div>
          <div class="meta-item"><span>Content Hash:</span> <code class="commit-pill">#${snapshot.contentHash}</code></div>
        </div>

        ${isDirty ? `
          <div class="diff-warning-banner" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); padding: 8px 12px; margin: 8px 18px; border-radius: 4px; display: flex; align-items: center; gap: 8px; color: #f59e0b; font-size: 11.5px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>Unsaved Changes Warning:</strong> The active document contains unsaved modifications. Restoring will replace the working buffer with this revision snapshot.</span>
          </div>
        ` : ''}

        <div class="diff-content-scroll">
          <div class="diff-view-pane">
            <div class="diff-pane-header">
              <span>Working Buffer (Left) ➔ Historical Snapshot Rev #${snapshot.revisionNumber || 1} (Right)</span>
            </div>
            <div class="diff-lines-container">
              ${preview.diff.map((line) => `
                <div class="diff-line ${line.type}">
                  <span class="diff-ln">${line.newLineNo || line.oldLineNo || ''}</span>
                  <span class="diff-marker">${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                  <span class="diff-text">${this.escapeHtml(line.text)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="diff-modal-footer">
          <button class="diff-btn secondary" id="histDiffCancelBtn">Cancel</button>
          <button class="diff-btn primary" id="histConfirmRestoreBtn" style="background: #1e3a58; border-color: #38bdf8; color: #38bdf8;">
            Confirm Restore
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.querySelector('#histDiffCloseX')?.addEventListener('click', () => this.close());
    modal.querySelector('#histDiffCancelBtn')?.addEventListener('click', () => this.close());

    modal.querySelector('#histConfirmRestoreBtn')?.addEventListener('click', async () => {
      try {
        const confirmBtn = modal.querySelector('#histConfirmRestoreBtn');
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Restoring...';
        }
        await restoreCoordinator.confirmRestore({
          previewId: preview.previewId,
          forceIfDirty: true,
        });
        this.close();
      } catch (err) {
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'error',
          message: `Restore failed: ${err.message}`,
        });
        this.close();
      }
    });
  }

  /**
   * Opens the modal in Revision A vs B Comparison mode.
   * @param {Object} params
   * @param {string} params.title
   * @param {string} params.labelA
   * @param {string} params.labelB
   * @param {Array<Object>} params.diff
   */
  showDiffComparison({ title, labelA, labelB, diff }) {
    this.close();

    let added = 0;
    let removed = 0;
    for (const line of diff) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }

    const modal = document.createElement('div');
    modal.className = 'diff-modal-backdrop history-diff-backdrop';
    modal.innerHTML = `
      <div class="diff-modal-container" role="dialog" aria-modal="true">
        <div class="diff-modal-header">
          <div class="diff-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
            </svg>
            <span>${this.escapeHtml(title)}</span>
            <span class="diff-classification-badge local_modified">+${added} / -${removed} lines</span>
          </div>
          <button class="diff-close-btn" id="histDiffCloseX">×</button>
        </div>

        <div class="diff-meta-strip">
          <div class="meta-item"><span>Base (A):</span> <strong>${this.escapeHtml(labelA)}</strong></div>
          <div class="meta-item"><span>Target (B):</span> <strong>${this.escapeHtml(labelB)}</strong></div>
        </div>

        <div class="diff-content-scroll">
          <div class="diff-view-pane">
            <div class="diff-pane-header">
              <span>${this.escapeHtml(labelA)} (Left) ➔ ${this.escapeHtml(labelB)} (Right)</span>
            </div>
            <div class="diff-lines-container">
              ${diff.map((line) => `
                <div class="diff-line ${line.type}">
                  <span class="diff-ln">${line.newLineNo || line.oldLineNo || ''}</span>
                  <span class="diff-marker">${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                  <span class="diff-text">${this.escapeHtml(line.text)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="diff-modal-footer">
          <button class="diff-btn primary" id="histDiffCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.querySelector('#histDiffCloseX')?.addEventListener('click', () => this.close());
    modal.querySelector('#histDiffCloseBtn')?.addEventListener('click', () => this.close());
  }

  close() {
    if (this.activePreviewId) {
      restoreCoordinator.cancelPreview(this.activePreviewId);
      this.activePreviewId = null;
    }
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
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

export const historyDiffModalComponent = new HistoryDiffModalComponent();
