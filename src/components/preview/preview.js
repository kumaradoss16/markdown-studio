import { svgSanitizer } from '../../services/svg-sanitizer.js';
import { markdownPipeline } from '../../services/markdown-pipeline.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { resolveWorkspacePath } from '../../services/project-link-checker.js';
import { workspaceStore } from '../../services/workspace-store.js';

export class PreviewComponent {
  constructor(container) {
    this.container = container;
    this.renderTimer = null;
    this.syncScroll = workspaceStore.getSettings().syncScroll === true;
    this.currentRenderPass = 0;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_CHANGED, (doc) => {
      const active = documentStateManager.getActiveDocument();
      if (active && active.id === doc.id) {
        if (this.renderTimer) clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => {
          this.renderPreview(doc);
        }, 80);
      }
    });

    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.renderPreview(doc);
    });

    eventBus.on(AppEvents.SYNC_SCROLL_TOGGLED, ({ enabled }) => {
      this.syncScroll = Boolean(enabled);
      this.updateSyncScrollUI(this.syncScroll);
    });

    eventBus.on(AppEvents.SETTINGS_CHANGED, (settings) => {
      if (settings && settings.syncScroll !== undefined) {
        this.syncScroll = Boolean(settings.syncScroll);
        this.updateSyncScrollUI(this.syncScroll);
      }
    });
  }

  updateSyncScrollUI(enabled) {
    const btn = this.container.querySelector('#previewSyncScrollBtn');
    if (!btn) return;
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled
      ? 'Synchronized Scrolling: ON (Click to decouple panes)'
      : 'Synchronized Scrolling: OFF (Click to link scrolling)';
    const linkIcon = btn.querySelector('.sync-icon-link');
    const unlinkIcon = btn.querySelector('.sync-icon-unlink');
    if (linkIcon) linkIcon.style.display = enabled ? '' : 'none';
    if (unlinkIcon) unlinkIcon.style.display = enabled ? 'none' : '';
  }

  render() {
    this.container.innerHTML = `
      <div class="preview-header">
        <div class="preview-status-indicator">
          <span class="indicator-dot"></span>
          <span class="status-mono-text">LIVE RENDERED DOCUMENT</span>
        </div>
        <div class="preview-tools-group">
          <span class="parser-badge">PARSER: GFM + LATEX</span>
          <button class="tool-btn preview-sync-btn ${this.syncScroll ? 'active' : ''}" id="previewSyncScrollBtn" title="${this.syncScroll ? 'Synchronized Scrolling: ON (Click to decouple panes)' : 'Synchronized Scrolling: OFF (Click to link scrolling)'}" aria-label="Toggle Synchronized Scrolling" aria-pressed="${this.syncScroll}">
            <svg class="sync-icon-link" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="${this.syncScroll ? '' : 'display:none;'}">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <svg class="sync-icon-unlink" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="${this.syncScroll ? 'display:none;' : ''}">
              <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"></path>
              <line x1="2" y1="2" x2="22" y2="22"></line>
            </svg>
            <span>Sync</span>
          </button>
          <button class="preview-export-btn" id="previewExportBtn" title="Export HTML / Markdown">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="preview-scroll-area" id="previewScrollArea"></div>
    `;

    const syncBtn = this.container.querySelector('#previewSyncScrollBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        const current = workspaceStore.getSettings().syncScroll === true;
        const next = !current;
        workspaceStore.saveSettings({ syncScroll: next });
        this.syncScroll = next;
        this.updateSyncScrollUI(next);
        eventBus.emit(AppEvents.SETTINGS_CHANGED, { syncScroll: next });
        eventBus.emit(AppEvents.SYNC_SCROLL_TOGGLED, { enabled: next });
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'info',
          message: next ? 'Synchronized scrolling enabled' : 'Independent scrolling enabled (Panes decoupled)'
        });
      });
    }

    const exportBtn = this.container.querySelector('#previewExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'export' });
      });
    }

    const activeDoc = documentStateManager.getActiveDocument();
    this.renderPreview(activeDoc);
  }

  renderPreview(doc) {
    const scrollArea = this.container.querySelector('#previewScrollArea');
    if (!scrollArea) return;

    if (!doc) {
      scrollArea.innerHTML = `
        <div class="preview-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); font-size: 12px; text-align: center; padding: 40px;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 12px;">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <span>No document open to preview</span>
        </div>
      `;
      return;
    }

    if (doc.content === undefined || doc.content === null) {
      scrollArea.innerHTML = '<div style="padding: 40px; color: var(--color-text-muted); text-align: center;">Document content empty</div>';
      return;
    }

    const { html, frontmatter } = markdownPipeline.process(doc, { withHeadingIds: true });

    scrollArea.innerHTML = `
      <div class="preview-content">
        ${html}
      </div>
    `;

    // Intercept all links to enforce protocol lockdown and prevent unauthorized webview navigation
    scrollArea.querySelectorAll('a').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href') || '';
        const wikiTarget = anchor.getAttribute('data-wiki-target');

        // 1. Wiki-links
        if (anchor.classList.contains('wiki-link') || wikiTarget) {
          e.preventDefault();
          const target = decodeURIComponent(wikiTarget || href || '').trim();
          const targetFile = target.endsWith('.md') ? target : `${target}.md`;
          documentStateManager.openDocument(targetFile, `# ${target}\n\nLinked document for ${target}.`, targetFile);
          return;
        }

        // 2. Internal fragment anchor (#heading)
        if (href.startsWith('#')) {
          e.preventDefault();
          const targetId = href.slice(1);
          const targetEl = scrollArea.querySelector(`#${targetId}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
          return;
        }

        const lowerHref = href.trim().toLowerCase();

        // 3. Disallow dangerous or arbitrary execution schemes
        if (
          lowerHref.startsWith('javascript:') ||
          lowerHref.startsWith('data:') ||
          lowerHref.startsWith('vbscript:') ||
          lowerHref.startsWith('file:')
        ) {
          e.preventDefault();
          eventBus.emit(AppEvents.NOTIFICATION, {
            type: 'error',
            message: `Blocked unsafe link protocol: "${href.split(':')[0]}:"`
          });
          return;
        }

        // 4. Remote web links (http / https) -> open in system browser safely
        if (lowerHref.startsWith('http://') || lowerHref.startsWith('https://')) {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
          return;
        }

        // 5. Relative markdown links (.md or local doc)
        if (lowerHref.endsWith('.md') || !lowerHref.includes(':')) {
          e.preventDefault();
          const activeDoc = documentStateManager.getActiveDocument();
          const sourcePath = activeDoc ? activeDoc.path : '';
          const { resolved } = resolveWorkspacePath(sourcePath, href);
          documentStateManager.openDocument(resolved, `# ${href.replace(/\.md$/i, '')}\n`, resolved);
        }
      });
    });

    // Attach fenced code block copy button listeners
    this.currentRenderPass += 1;
    this.renderMermaidDiagrams(scrollArea, this.currentRenderPass);

    scrollArea.querySelectorAll('.fenced-code-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const container = btn.closest('.fenced-code-container');
        const codeEl = container?.querySelector('pre code');
        const codeText = codeEl ? codeEl.textContent : '';

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(codeText);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = codeText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
          }

          btn.classList.add('copied');
          btn.innerHTML = `
            <svg class="code-copy-icon check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span class="code-copy-label" style="color: #10B981; font-weight: 600;">Copied!</span>
          `;

          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = `
              <svg class="code-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="code-copy-label">Copy</span>
            `;
          }, 2000);
        } catch (err) {
          console.warn('Failed to copy preview code snippet:', err);
        }
      });
    });
  }

  async renderMermaidDiagrams(scrollArea, passToken) {
    const mermaidNodes = scrollArea.querySelectorAll('pre code.language-mermaid, pre.mermaid, div.mermaid, code.language-mermaid');
    if (!mermaidNodes || mermaidNodes.length === 0) return;

    try {
      const { default: mermaid } = await import('mermaid');
      if (passToken !== this.currentRenderPass) return;

      const theme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light') ? 'default' : 'dark';
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme,
      });

      for (let i = 0; i < mermaidNodes.length; i++) {
        if (passToken !== this.currentRenderPass) return;
        const node = mermaidNodes[i];
        const container = node.closest('.fenced-code-container') || node.parentElement;
        const source = (node.textContent || '').trim();
        if (!source) continue;

        const uniqueId = `mermaid-render-${Date.now()}-${i}`;
        try {
          const { svg } = await mermaid.render(uniqueId, source);
          if (passToken !== this.currentRenderPass) return;

          const { success, sanitized, error } = svgSanitizer.sanitize(svg);
          if (success) {
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-rendered-container';
            wrapper.setAttribute('data-source', source);
            wrapper.innerHTML = `
              <div class="mermaid-diagram">${sanitized}</div>
              <details class="mermaid-source-details" style="margin-top: 8px; font-size: 11px; opacity: 0.8;">
                <summary style="cursor: pointer; color: var(--color-text-muted);">View Diagram Source</summary>
                <pre style="margin-top: 4px; padding: 6px; background: var(--color-surface-sunken); border-radius: 4px;"><code>${source.replace(/</g, '&lt;')}</code></pre>
              </details>
            `;
            if (container && container.parentNode) {
              container.parentNode.replaceChild(wrapper, container);
            }
          } else {
            this.markMermaidError(container, error || 'SVG sanitization rejected rendered diagram');
          }
        } catch (err) {
          console.warn('[Mermaid] render failed for diagram:', err);
          this.markMermaidError(container, err.message || 'Diagram syntax error');
        }
      }
    } catch (err) {
      console.warn('[Mermaid] lazy import failed:', err);
    }
  }

  markMermaidError(container, errorMsg) {
    if (!container || container.querySelector('.mermaid-error-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'mermaid-error-badge';
    badge.style.cssText = 'color: var(--color-accent-rose, #f43f5e); font-size: 11px; padding: 6px 10px; background: rgba(244, 63, 94, 0.1); border-left: 3px solid #f43f5e; margin: 4px 0; border-radius: 2px;';
    badge.innerHTML = `⚠️ Diagram render fallback: ${errorMsg}`;
    container.prepend(badge);
  }
}
