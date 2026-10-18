import { publicationCoordinator } from '../../services/publication-coordinator.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { diffModalComponent } from './diff-modal.js';
import { revisionComparisonService } from '../../services/revision-comparison-service.js';

/**
 * PublishModalComponent
 * Provides the mandatory reviewed publication dialog enforcing:
 * - Invariant 1: Explicit user-initiated confirmation.
 * - Invariant 3: Exact destination display.
 * - Invariant 4: Review snapshot immutability.
 * - Invariant 14: Optional working-branch workflow.
 * - Invariant 15: Explicit Pull Request creation.
 */
export class PublishModalComponent {
  constructor() {
    this.modalEl = null;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on('publication:open_review', ({ doc, snapshot, attemptId }) => {
      this.show(doc, snapshot, attemptId);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl) {
        this.cancel();
      }
    });
  }

  show(doc, snapshot, attemptId) {
    this.close();
    if (!doc || !snapshot) return;

    const dest = snapshot.destination;

    const modal = document.createElement('div');
    modal.className = 'publish-modal-backdrop';
    modal.innerHTML = `
      <div class="publish-modal-container" role="dialog" aria-modal="true">
        <div class="publish-header">
          <div class="publish-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            <span>Review Changes Before Publishing to GitHub</span>
          </div>
          <button class="diff-close-btn" id="pubModalCloseX">×</button>
        </div>

        <div class="publish-body">
          <div class="publish-dest-card">
            <div class="publish-dest-item">
              <span class="publish-dest-label">Repository</span>
              <span class="publish-dest-val">${dest.owner}/${dest.repo}</span>
            </div>
            <div class="publish-dest-item">
              <span class="publish-dest-label">Destination Branch</span>
              <span class="publish-dest-val">${dest.branch}</span>
            </div>
            <div class="publish-dest-item">
              <span class="publish-dest-label">File Path</span>
              <span class="publish-dest-val">${dest.path}</span>
            </div>
            <div class="publish-dest-item">
              <span class="publish-dest-label">Base Commit</span>
              <span class="publish-dest-val">${dest.baseCommitSha ? dest.baseCommitSha.slice(0, 7) : '(none)'}</span>
            </div>
            <div class="publish-dest-item">
              <span class="publish-dest-label">Publication Mode</span>
              <span class="publish-dest-val">${dest.isNewFile ? 'Create New File' : 'Update Existing File'}</span>
            </div>
          </div>

          <div class="publish-diff-section">
            <div class="publish-diff-title">Reviewed Differences (Local Draft vs Remote Base)</div>
            <div class="publish-diff-container">
              ${snapshot.diff.map((line) => `
                <div class="diff-line ${line.type}">
                  <span class="diff-ln">${line.newLineNo || line.oldLineNo || ''}</span>
                  <span class="diff-marker">${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                  <span class="diff-text">${this.escapeHtml(line.text)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="publish-form-group">
            <label class="publish-label" for="pubCommitMessage">Commit Message</label>
            <input type="text" id="pubCommitMessage" class="publish-input" value="Update ${dest.path}" placeholder="Enter clear, descriptive commit message" />
          </div>

          <div class="publish-form-group">
            <label class="publish-checkbox-label">
              <input type="checkbox" id="pubUseWorkingBranch" />
              <span>Publish to a new working branch instead of directly to <strong>${dest.branch}</strong></span>
            </label>
          </div>

          <div class="publish-form-group" id="pubBranchInputGroup" style="display: none; padding-left: 20px;">
            <label class="publish-label" for="pubBranchName">Working Branch Name</label>
            <input type="text" id="pubBranchName" class="publish-input" placeholder="e.g. patch-${Date.now().toString(36)}" />
            <label class="publish-checkbox-label" style="margin-top: 6px;">
              <input type="checkbox" id="pubOpenPR" checked />
              <span>Open a Pull Request automatically after publishing</span>
            </label>
          </div>

          <div id="pubStatusBox" style="display: none;"></div>
        </div>

        <div class="publish-footer">
          <button class="diff-btn secondary" id="pubCancelBtn">Cancel</button>
          <button class="remote-banner-btn publish" id="pubConfirmBtn" style="padding: 6px 16px; font-size: 12px;">
            Publish Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Toggle working branch group
    const workingBranchCheckbox = modal.querySelector('#pubUseWorkingBranch');
    const branchInputGroup = modal.querySelector('#pubBranchInputGroup');
    const branchNameInput = modal.querySelector('#pubBranchName');
    const openPrCheckbox = modal.querySelector('#pubOpenPR');

    workingBranchCheckbox?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      branchInputGroup.style.display = isChecked ? 'flex' : 'none';
      if (isChecked && !branchNameInput.value) {
        branchNameInput.value = `patch-${Date.now().toString(36)}`;
      }
    });

    // Close & Cancel
    modal.querySelector('#pubModalCloseX')?.addEventListener('click', () => this.cancel());
    modal.querySelector('#pubCancelBtn')?.addEventListener('click', () => this.cancel());

    // Confirm & Publish
    const confirmBtn = modal.querySelector('#pubConfirmBtn');
    const commitInput = modal.querySelector('#pubCommitMessage');
    const statusBox = modal.querySelector('#pubStatusBox');

    confirmBtn?.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.6';
      modal.querySelector('#pubCancelBtn').disabled = true;

      statusBox.style.display = 'flex';
      statusBox.className = 'publish-status-box in-flight';
      statusBox.innerHTML = `
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Publishing commit and verifying remote state...</span>
      `;

      try {
        const commitMsg = commitInput.value.trim() || `Update ${dest.path}`;
        const workingBranch = workingBranchCheckbox.checked ? branchNameInput.value.trim() : null;
        const openPullRequest = workingBranchCheckbox.checked ? openPrCheckbox.checked : false;

        const result = await publicationCoordinator.confirmPublication({
          attemptId,
          commitMessage: commitMsg,
          workingBranch,
          openPullRequest,
        });

        if (result.success) {
          statusBox.className = 'publish-status-box success';
          statusBox.innerHTML = `
            <div>
              <strong>✓ Successfully Published & Verified</strong><br/>
              Commit: <code style="font-family: monospace;">${result.verifiedResult.commitSha.slice(0, 7)}</code>
              ${result.prResult ? `<br/>Pull Request opened: <a href="${result.prResult.html_url}" target="_blank" style="color: #38bdf8;">#${result.prResult.number}</a>` : ''}
            </div>
          `;
          confirmBtn.style.display = 'none';
          const cancelBtn = modal.querySelector('#pubCancelBtn');
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Done';
          cancelBtn.className = 'diff-btn primary';
        } else if (result.state === 'CONFLICT_REVIEW_REQUIRED') {
          statusBox.className = 'publish-status-box warning';
          statusBox.innerHTML = `
            <div>
              <strong>Concurrency Conflict:</strong> The target file on branch <em>${dest.branch}</em> was modified on GitHub. Publication blocked to prevent overwrite.
            </div>
          `;
          confirmBtn.style.display = 'none';
          const cancelBtn = modal.querySelector('#pubCancelBtn');
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Resolve Conflict in Diff Viewer';
          cancelBtn.className = 'diff-btn secondary';
          cancelBtn.onclick = async () => {
            this.close();
            const comp = await revisionComparisonService.refreshDraft(doc.id);
            diffModalComponent.show(doc, comp);
          };
        } else {
          statusBox.className = 'publish-status-box error';
          statusBox.innerHTML = `<span>${result.error || result.message || 'Publication was not completed.'}</span>`;
          confirmBtn.disabled = false;
          confirmBtn.style.opacity = '1';
          modal.querySelector('#pubCancelBtn').disabled = false;
        }
      } catch (pubErr) {
        statusBox.className = 'publish-status-box error';
        statusBox.innerHTML = `<span>Publication error: ${this.escapeHtml(pubErr.message)}</span>`;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        modal.querySelector('#pubCancelBtn').disabled = false;
      }
    });
  }

  cancel() {
    publicationCoordinator.cancelPublication();
    this.close();
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

export const publishModalComponent = new PublishModalComponent();
