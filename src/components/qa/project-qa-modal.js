import { projectQaCoordinator } from '../../core/project-qa-coordinator.js';
import { qaReportWriter } from '../../services/qa-report-writer.js';
import { workspaceManager } from '../../core/workspace-manager.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * ProjectQaModalComponent
 * Interactive desktop modal for running, filtering, and exporting Documentation QA scans.
 */
export class ProjectQaModalComponent {
  constructor() {
    this.modalEl = null;
    this.currentReport = null;
    this.activeFilter = {
      severity: 'ALL',
      query: ''
    };
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.QA_MODAL_OPEN, () => {
      this.show();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl) {
        this.close();
      }
    });
  }

  /**
   * Opens the QA modal.
   */
  show() {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'publish-modal-backdrop';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px);';

    overlay.innerHTML = `
      <div class="publish-modal-container" role="dialog" aria-modal="true" style="width: 820px; max-width: 95vw; max-height: 85vh; background: var(--color-bg-panel, #1e1e2e); border: 1px solid var(--color-border-subtle, #313244); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="padding: 14px 18px; border-bottom: 1px solid var(--color-border-subtle, #313244); display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.15);">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #fff; font-size: 14px;">
            <span style="font-size: 16px;">🧪</span>
            <span>Documentation QA &amp; Verification</span>
            <span style="font-size: 11px; padding: 2px 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border-radius: 4px; font-weight: 500;">v0.7.0</span>
          </div>
          <button id="qaModalCloseX" style="background: transparent; border: none; color: #a6adc8; font-size: 18px; cursor: pointer; padding: 4px 8px;">×</button>
        </div>

        <!-- Controls Toolbar -->
        <div style="padding: 12px 18px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--color-border-subtle, #313244); display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 12px; color: var(--color-text-secondary, #a6adc8);">Profile:</label>
            <select id="qaProfileSelect" style="background: var(--color-bg-base, #11111b); color: #fff; border: 1px solid var(--color-border-subtle, #313244); border-radius: 4px; padding: 4px 8px; font-size: 12px;">
              <option value="docs-repo" selected>docs-repo (Comprehensive)</option>
              <option value="ci-blocking">ci-blocking (Strict Gating)</option>
              <option value="strict">strict (Warnings as Errors)</option>
              <option value="default">default (Single Doc Rules)</option>
            </select>
          </div>

          <button id="qaRunBtn" style="padding: 5px 14px; background: #38bdf8; color: #111; border: none; border-radius: 4px; font-weight: 600; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
            <span>▶ Run Scan</span>
          </button>

          <button id="qaCancelBtn" style="display: none; padding: 5px 12px; background: #f87171; color: #111; border: none; border-radius: 4px; font-weight: 600; font-size: 12px; cursor: pointer;">
            Cancel
          </button>

          <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
            <button id="qaExportJsonBtn" style="padding: 4px 10px; background: rgba(255,255,255,0.06); color: #cdd6f4; border: 1px solid var(--color-border-subtle, #313244); border-radius: 4px; font-size: 11px; cursor: pointer;">
              Export JSON
            </button>
            <button id="qaExportMdBtn" style="padding: 4px 10px; background: rgba(255,255,255,0.06); color: #cdd6f4; border: 1px solid var(--color-border-subtle, #313244); border-radius: 4px; font-size: 11px; cursor: pointer;">
              Export Markdown
            </button>
          </div>
        </div>

        <!-- Progress Indicator -->
        <div id="qaProgressContainer" style="display: none; padding: 8px 18px; background: rgba(56, 189, 248, 0.08); border-bottom: 1px solid rgba(56, 189, 248, 0.2); font-size: 12px; color: #38bdf8;">
          <span id="qaProgressText">Scanning workspace documents...</span>
        </div>

        <!-- Body / Content Area -->
        <div id="qaBody" style="flex: 1; overflow-y: auto; padding: 18px;">
          <div id="qaPlaceholder" style="text-align: center; padding: 40px 20px; color: var(--color-text-muted, #6c7086);">
            <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
            <div style="font-size: 14px; font-weight: 500; color: #cdd6f4; margin-bottom: 4px;">Run Project QA to Verify Documentation Quality</div>
            <div style="font-size: 12px;">Scans cross-document links, anchor slugs, coverage, and navigation integrity across the entire workspace.</div>
          </div>

          <!-- Results Container (Hidden initially) -->
          <div id="qaResults" style="display: none;">
            
            <!-- Metrics Summary Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px;">
              <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border-subtle, #313244);">
                <div style="font-size: 11px; color: #a6adc8; margin-bottom: 4px;">Status</div>
                <div id="qaStatusPill" style="font-weight: 600; font-size: 13px;">--</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border-subtle, #313244);">
                <div style="font-size: 11px; color: #a6adc8; margin-bottom: 4px;">Files Scanned</div>
                <div id="qaFilesCount" style="font-weight: 600; font-size: 13px; color: #fff;">0</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border-subtle, #313244);">
                <div style="font-size: 11px; color: #a6adc8; margin-bottom: 4px;">Errors</div>
                <div id="qaErrorsCount" style="font-weight: 600; font-size: 13px; color: #f87171;">0</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border-subtle, #313244);">
                <div style="font-size: 11px; color: #a6adc8; margin-bottom: 4px;">Warnings</div>
                <div id="qaWarningsCount" style="font-weight: 600; font-size: 13px; color: #fbbf24;">0</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border-subtle, #313244);">
                <div style="font-size: 11px; color: #a6adc8; margin-bottom: 4px;">Orphan Docs</div>
                <div id="qaOrphansCount" style="font-weight: 600; font-size: 13px; color: #cdd6f4;">0</div>
              </div>
            </div>

            <!-- Filter Controls -->
            <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center;">
              <input type="text" id="qaSearchInput" placeholder="Filter by message or file name..." 
                     style="flex: 1; background: var(--color-bg-base, #11111b); border: 1px solid var(--color-border-subtle, #313244); border-radius: 4px; padding: 6px 10px; color: #fff; font-size: 12px;" />
              
              <select id="qaSeverityFilter" style="background: var(--color-bg-base, #11111b); color: #fff; border: 1px solid var(--color-border-subtle, #313244); border-radius: 4px; padding: 6px 10px; font-size: 12px;">
                <option value="ALL">All Severities</option>
                <option value="ERROR">Errors Only</option>
                <option value="WARNING">Warnings Only</option>
                <option value="INFO">Info Only</option>
              </select>
            </div>

            <!-- Findings List -->
            <div id="qaFindingsList" style="display: flex; flex-direction: column; gap: 8px;">
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    // Attach listeners
    overlay.querySelector('#qaModalCloseX')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const runBtn = overlay.querySelector('#qaRunBtn');
    const cancelBtn = overlay.querySelector('#qaCancelBtn');
    const profileSelect = overlay.querySelector('#qaProfileSelect');
    const searchInput = overlay.querySelector('#qaSearchInput');
    const severityFilter = overlay.querySelector('#qaSeverityFilter');
    const exportJsonBtn = overlay.querySelector('#qaExportJsonBtn');
    const exportMdBtn = overlay.querySelector('#qaExportMdBtn');

    runBtn?.addEventListener('click', async () => {
      await this.runScan(profileSelect?.value || 'docs-repo');
    });

    cancelBtn?.addEventListener('click', () => {
      projectQaCoordinator.cancel();
      cancelBtn.style.display = 'none';
      runBtn.style.display = 'inline-flex';
    });

    searchInput?.addEventListener('input', (e) => {
      this.activeFilter.query = e.target.value.toLowerCase();
      this.renderFindings();
    });

    severityFilter?.addEventListener('change', (e) => {
      this.activeFilter.severity = e.target.value;
      this.renderFindings();
    });

    exportJsonBtn?.addEventListener('click', () => {
      if (!this.currentReport) {
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'warning', message: 'Run a QA scan first to export results.' });
        return;
      }
      const jsonStr = JSON.stringify(this.currentReport, null, 2);
      this.downloadFile('qa-report.json', jsonStr, 'application/json');
    });

    exportMdBtn?.addEventListener('click', () => {
      if (!this.currentReport) {
        eventBus.emit(AppEvents.NOTIFICATION, { type: 'warning', message: 'Run a QA scan first to export results.' });
        return;
      }
      const mdStr = qaReportWriter.formatMarkdown(this.currentReport);
      this.downloadFile('qa-report.md', mdStr, 'text/markdown');
    });
  }

  /**
   * Executes scan and updates UI.
   * @param {string} profileName
   */
  async runScan(profileName) {
    if (!this.modalEl) return;

    const runBtn = this.modalEl.querySelector('#qaRunBtn');
    const cancelBtn = this.modalEl.querySelector('#qaCancelBtn');
    const progressContainer = this.modalEl.querySelector('#qaProgressContainer');
    const progressText = this.modalEl.querySelector('#qaProgressText');
    const placeholder = this.modalEl.querySelector('#qaPlaceholder');
    const results = this.modalEl.querySelector('#qaResults');

    if (runBtn) runBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (progressContainer) progressContainer.style.display = 'block';

    // Gather workspace documents from workspaceManager / open documents
    const fileMap = new Map();
    const openDocs = documentStateManager.getAllDocuments ? documentStateManager.getAllDocuments() : [];
    for (const doc of openDocs) {
      if (doc && doc.path) {
        fileMap.set(doc.path, doc.content || '');
      }
    }

    // Subscribe to progress
    const offProgress = eventBus.on(AppEvents.QA_RUN_PROGRESS, (progress) => {
      if (progressText) {
        progressText.textContent = `Scanning [${progress.current}/${progress.total}] ${progress.currentFile}...`;
      }
    });

    try {
      const report = await projectQaCoordinator.runQa({
        workspaceRoot: '.',
        profile: profileName,
        fileMap
      });

      this.currentReport = report;
      offProgress();

      if (placeholder) placeholder.style.display = 'none';
      if (results) results.style.display = 'block';

      this.updateSummary(report);
      this.renderFindings();
    } catch (err) {
      offProgress();
      eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: `QA scan failed: ${err.message}` });
    } finally {
      if (runBtn) runBtn.style.display = 'inline-flex';
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  /**
   * Updates metric counters in the modal.
   * @param {Object} report
   */
  updateSummary(report) {
    if (!this.modalEl || !report) return;

    const statusPill = this.modalEl.querySelector('#qaStatusPill');
    const filesCount = this.modalEl.querySelector('#qaFilesCount');
    const errorsCount = this.modalEl.querySelector('#qaErrorsCount');
    const warningsCount = this.modalEl.querySelector('#qaWarningsCount');
    const orphansCount = this.modalEl.querySelector('#qaOrphansCount');

    if (statusPill) {
      statusPill.textContent = report.passed ? 'PASSED' : 'FAILED';
      statusPill.style.color = report.passed ? '#34d399' : '#f87171';
    }
    if (filesCount) filesCount.textContent = String(report.summary.filesScanned);
    if (errorsCount) errorsCount.textContent = String(report.summary.errors);
    if (warningsCount) warningsCount.textContent = String(report.summary.warnings);
    if (orphansCount) orphansCount.textContent = String(report.coverage?.orphanDocs?.length || 0);
  }

  /**
   * Renders findings filtered by severity and search query.
   */
  renderFindings() {
    if (!this.modalEl || !this.currentReport) return;

    const container = this.modalEl.querySelector('#qaFindingsList');
    if (!container) return;

    const diags = this.currentReport.diagnostics || [];
    const filtered = diags.filter(d => {
      if (this.activeFilter.severity !== 'ALL' && d.severity !== this.activeFilter.severity) {
        return false;
      }
      if (this.activeFilter.query) {
        const text = `${d.file || ''} ${d.message || ''} ${d.ruleId || ''}`.toLowerCase();
        if (!text.includes(this.activeFilter.query)) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: #a6adc8; font-size: 13px;">
          ✓ No matching findings for current filters.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(d => {
      const isError = d.severity === 'ERROR';
      const isWarn = d.severity === 'WARNING';
      const sevColor = isError ? '#f87171' : isWarn ? '#fbbf24' : '#38bdf8';
      const sevBadge = isError ? 'ERROR' : isWarn ? 'WARN' : 'INFO';
      const file = escapeHtml(d.file || '(workspace)');
      const line = d.line ? `:${d.line}` : '';
      const rule = escapeHtml(d.ruleId);
      const msg = escapeHtml(d.message);

      return `
        <div class="qa-finding-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--color-border-subtle, #313244); border-left: 3px solid ${sevColor}; padding: 10px 14px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: ${sevColor};">${sevBadge}</span>
              <span style="color: #cdd6f4; font-family: monospace;">${file}${line}</span>
            </div>
            <span style="color: #6c7086; font-family: monospace; font-size: 10px;">${rule}</span>
          </div>
          <div style="font-size: 12px; color: #fff; line-height: 1.4;">${msg}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Helper to download reports in the browser / web environment.
   */
  downloadFile(filename, text, mimeType) {
    try {
      const blob = new Blob([text], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      eventBus.emit(AppEvents.NOTIFICATION, { type: 'success', message: `Exported ${filename}` });
      eventBus.emit(AppEvents.QA_REPORT_EXPORTED, { filename, mimeType });
    } catch (err) {
      eventBus.emit(AppEvents.NOTIFICATION, { type: 'error', message: `Export failed: ${err.message}` });
    }
  }

  /**
   * Closes the modal.
   */
  close() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }
}

export const projectQaModalComponent = new ProjectQaModalComponent();
