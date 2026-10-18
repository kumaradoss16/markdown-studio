import { revisionComparisonService, DiffClassification } from '../../services/revision-comparison-service.js';
import { AppEvents, eventBus } from '../../app/events.js';

/**
 * Three-Way Diff & Stale Base Modal Component.
 * Presents clear side-by-side / unified line differences between Base, Local, and Remote revisions.
 */
export class DiffModalComponent {
  constructor() {
    this.modalEl = null;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.GITHUB_DIFF_REQUESTED, ({ doc, comparison }) => {
      this.show(doc, comparison);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl) {
        this.close();
      }
    });
  }

  show(doc, comparison) {
    this.close();
    if (!doc || !doc.remoteMetadata) return;

    const meta = doc.remoteMetadata;
    const isStale = comparison.isStaleBase;

    const modal = document.createElement('div');
    modal.className = 'diff-modal-backdrop';
    modal.innerHTML = `
      <div class="diff-modal-container" role="dialog" aria-modal="true">
        <div class="diff-modal-header">
          <div class="diff-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
              <line x1="6" y1="9" x2="6" y2="21"></line>
            </svg>
            <span>Revision Comparison: <strong>${doc.name}</strong></span>
            <span class="diff-classification-badge ${comparison.classification.toLowerCase()}">${comparison.classification}</span>
          </div>
          <button class="diff-close-btn" id="diffModalCloseX">×</button>
        </div>

        <div class="diff-meta-strip">
          <div class="meta-item"><span>Repository:</span> <strong>${meta.owner}/${meta.repo}</strong></div>
          <div class="meta-item"><span>Branch:</span> <strong>${meta.branch}</strong></div>
          <div class="meta-item"><span>Base Commit:</span> <code class="commit-pill">${meta.baseCommitSha.slice(0, 7)}</code></div>
          <div class="meta-item"><span>Remote Commit:</span> <code class="commit-pill">${comparison.latestCommitSha.slice(0, 7)}</code></div>
        </div>

        ${isStale ? `
          <div class="diff-warning-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>Stale Base Detected:</strong> The remote branch has moved from your recorded base commit (${meta.baseCommitSha.slice(0, 7)}) to ${comparison.latestCommitSha.slice(0, 7)}. Review differences before overwriting.</span>
          </div>
        ` : ''}

        <div class="diff-content-scroll">
          <div class="diff-view-pane">
            <div class="diff-pane-header">Local Draft vs Remote Branch Revision</div>
            <div class="diff-lines-container">
              ${comparison.diffLocalVsRemote.map((line) => `
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
          <button class="diff-btn secondary" id="diffKeepLocalBtn">Keep Local Draft</button>
          <button class="diff-btn danger" id="diffOverwriteBtn">Overwrite Local with Remote</button>
          <button class="diff-btn primary" id="diffDoneBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Button event bindings
    modal.querySelector('#diffModalCloseX')?.addEventListener('click', () => this.close());
    modal.querySelector('#diffDoneBtn')?.addEventListener('click', () => this.close());
    
    modal.querySelector('#diffKeepLocalBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: 'Preserved local draft. Remote changes deferred.',
      });
      this.close();
    });

    modal.querySelector('#diffOverwriteBtn')?.addEventListener('click', () => {
      if (confirm(`Are you sure you want to discard local edits in "${doc.name}" and overwrite with remote revision ${comparison.latestCommitSha.slice(0, 7)}?`)) {
        revisionComparisonService.overwriteLocalWithRemote(doc.id, comparison.remoteContent, comparison.latestCommitSha);
        this.close();
      }
    });
  }

  close() {
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
}

export const diffModalComponent = new DiffModalComponent();
