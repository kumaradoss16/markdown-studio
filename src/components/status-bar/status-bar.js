import { documentStateManager } from '../../core/document-state-manager.js';
import { markdownService } from '../../services/markdown-service.js';
import { qualityChecker } from '../../services/quality-checker.js';
import { workspaceManager } from '../../core/workspace-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { fileSystemAdapter } from '../../services/filesystem-adapter.js';

export class StatusBarComponent {
  constructor(container) {
    this.container = container;
    this.cursor = { line: 1, col: 1 };
    this.viewMode = 'DUAL SPLIT';
    this.zenMode = false;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.CURSOR_CHANGED, (pos) => {
      this.cursor = pos;
      this.updateCursorDisplay();
    });

    eventBus.on(AppEvents.DOCUMENT_CHANGED, (doc) => {
      this.updateStatsDisplay(doc);
    });

    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      this.render();
    });

    eventBus.on(AppEvents.VIEW_MODE_CHANGED, (mode) => {
      this.viewMode = mode;
      this.render();
    });

    // Listen for virtual mode fallback notifications
    eventBus.on(AppEvents.NOTIFICATION, (notification) => {
      if (notification.type === 'warning' && notification.message.includes('File system unavailable')) {
        this.render();
      }
    });
  }

  render() {
    const activeDoc = documentStateManager.getActiveDocument();
    const docName = activeDoc ? activeDoc.name.replace('.md', '') : 'Habitat Design';
    const stats = markdownService.computeStats(activeDoc ? activeDoc.content : '');
    const diags = activeDoc ? qualityChecker.check(activeDoc) : [];
    const diagSummary = qualityChecker.summarize(diags);
    const diagColor = diagSummary.errors > 0 ? 'var(--color-accent-rose)' : (diagSummary.warnings > 0 ? '#fbbf24' : 'var(--color-accent-emerald)');
    
    // Check if in virtual mode
    const isVirtual = fileSystemAdapter.isVirtualMode();
    const virtualModeIndicator = isVirtual 
      ? `<span id="statusVirtualMode" title="File system unavailable. Using virtual storage. ${fileSystemAdapter.virtualModeReason}" style="cursor: pointer; display: flex; align-items: center; gap: 5px; color: var(--color-accent-rose); font-weight: bold;">
          <span>⚠️</span>
          <strong>VIRTUAL</strong>
        </span>
        <span style="color: var(--color-border-default);">|</span>`
      : '';

    this.container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px;">
        ${virtualModeIndicator}
        <span id="statusSidebarToggle" style="cursor: pointer; color: var(--color-text-secondary);">
          SIDEBAR: <strong style="color: var(--color-accent-cyan);">ON</strong> <span style="color: var(--color-text-muted);">(⌘B)</span>
        </span>
        <span style="color: var(--color-border-default);">|</span>
        <span style="display: flex; align-items: center; gap: 5px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <strong style="color: var(--color-text-primary);">${docName}</strong>
        </span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusDiagnosticsBtn" title="Documentation Quality Diagnostics (Click to inspect)" style="cursor: pointer; display: flex; align-items: center; gap: 5px; color: ${diagColor};">
          <span>🛡️</span>
          <strong>${diagSummary.errors} Err</strong> • <span>${diagSummary.warnings} Warn</span>
        </span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusProjectQaBtn" title="Project Documentation QA (Click to run workspace scan)" style="cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--color-accent-teal);">
          <span>🧪</span>
          <strong>QA</strong>
        </span>
        <span style="color: var(--color-border-default);">|</span>
        <span style="color: var(--color-accent-teal);">MODE: ${this.viewMode}</span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusZenToggle" style="cursor: pointer; color: ${this.zenMode ? 'var(--color-accent-violet)' : 'var(--color-text-muted)'};">
          ZEN: ${this.zenMode ? 'ON' : 'OFF'}
        </span>
      </div>

      <div style="display: flex; align-items: center; gap: 14px;">
        <span id="statusWords">${stats.words} words</span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusChars">${stats.chars} chars</span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusReadTime">${stats.readingMinutes} min read</span>
        <span style="color: var(--color-border-default);">|</span>
        <span style="color: var(--color-text-secondary);">UTF-8</span>
        <span style="color: var(--color-border-default);">|</span>
        <span id="statusCursor" style="color: var(--color-accent-cyan);">Ln ${this.cursor.line}, Col ${this.cursor.col}</span>
      </div>
    `;

    this.container.querySelector('#statusDiagnosticsBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'diagnostics' });
    });

    this.container.querySelector('#statusProjectQaBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'project-qa' });
    });

    // Click events
    this.container.querySelector('#statusSidebarToggle')?.addEventListener('click', () => {
      const sidebar = document.querySelector('.workspace-sidebar');
      sidebar?.classList.toggle('collapsed');
    });

    this.container.querySelector('#statusZenToggle')?.addEventListener('click', () => {
      this.zenMode = !this.zenMode;
      const sidebar = document.querySelector('.workspace-sidebar');
      const header = document.querySelector('.app-header');
      if (this.zenMode) {
        sidebar?.classList.add('collapsed');
        header?.style.setProperty('display', 'none');
      } else {
        sidebar?.classList.remove('collapsed');
        header?.style.removeProperty('display');
      }
      this.render();
    });
  }

  updateCursorDisplay() {
    const el = this.container.querySelector('#statusCursor');
    if (el) {
      el.textContent = `Ln ${this.cursor.line}, Col ${this.cursor.col}`;
    }
  }

  updateStatsDisplay(doc) {
    if (!doc) return;
    const stats = markdownService.computeStats(doc.content || '');
    const wEl = this.container.querySelector('#statusWords');
    const cEl = this.container.querySelector('#statusChars');
    const rEl = this.container.querySelector('#statusReadTime');
    if (wEl) wEl.textContent = `${stats.words} words`;
    if (cEl) cEl.textContent = `${stats.chars} chars`;
    if (rEl) rEl.textContent = `${stats.readingMinutes} min read`;
  }
}
