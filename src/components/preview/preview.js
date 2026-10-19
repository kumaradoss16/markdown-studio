import { markdownPipeline } from '../../services/markdown-pipeline.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { resolveWorkspacePath } from '../../services/project-link-checker.js';

export class PreviewComponent {
  constructor(container) {
    this.container = container;
    this.renderTimer = null;
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

    if (!doc || !doc.content) {
      scrollArea.innerHTML = '<div style="padding: 40px; color: var(--color-text-muted); text-align: center;">No preview available</div>';
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
}
