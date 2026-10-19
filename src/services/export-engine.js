import { markdownPipeline } from './markdown-pipeline.js';
import { qualityChecker, DiagnosticSeverity } from './quality-checker.js';
import { accentService } from './accent-service.js';

export const ExportFormat = {
  HTML: 'html',
  PDF: 'pdf',
  MARKDOWN: 'markdown'
};

/**
 * Technical Documentation Export Engine.
 * Enforces pre-flight quality checks, asset embedding, and deterministic output.
 */
export class ExportEngine {
  constructor(pipeline = markdownPipeline, checker = qualityChecker) {
    this.pipeline = pipeline;
    this.checker = checker;
  }

  /**
   * Performs pre-flight quality checks for a document before export.
   * @param {{ id?: string, content?: string, revision?: number, path?: string }} docSnapshot
   * @param {Object} [options={}]
   * @returns {{ canExport: boolean, hasBlockingErrors: boolean, diagnostics: Array, summary: Object }}
   */
  preflightCheck(docSnapshot, options = {}) {
    const diagnostics = this.checker.check(docSnapshot, options);
    const summary = this.checker.summarize(diagnostics);
    const hasBlockingErrors = summary.errors > 0;

    return {
      canExport: !hasBlockingErrors || !!options.force,
      hasBlockingErrors,
      diagnostics,
      summary
    };
  }

  /**
   * Generates self-contained, sanitized HTML.
   * @param {{ name?: string, content?: string, revision?: number }} docSnapshot
   * @param {Object} [options={}]
   * @param {string} [options.theme='dark'] 'dark' | 'light'
   * @param {boolean} [options.embedAssets=true]
   * @param {Record<string, string>} [options.assetMap={}] Map of local asset path -> base64 data URI
   * @returns {string} Standalone HTML document string
   */
  generateStandaloneHtml(docSnapshot, options = {}) {
    const theme = options.theme || 'dark';
    const embedAssets = options.embedAssets !== false;
    const assetMap = options.assetMap || {};

    const pipelineResult = this.pipeline.process(docSnapshot, { withHeadingIds: true });
    let bodyHtml = pipelineResult.html;

    // If embedding assets, substitute local image sources with base64 data URIs or inline representations
    if (embedAssets) {
      bodyHtml = bodyHtml.replace(/<img([^>]+)src=["']([^"']+)["']([^>]*)>/g, (match, prefix, src, suffix) => {
        const decodedSrc = decodeURIComponent(src);
        if (assetMap[decodedSrc] || assetMap[src]) {
          const base64Uri = assetMap[decodedSrc] || assetMap[src];
          return `<img${prefix}src="${base64Uri}"${suffix}>`;
        }
        // Handle local SVG paths
        if (src.endsWith('.svg') && !src.startsWith('http') && !src.startsWith('data:')) {
          const safeSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='24'><rect width='100%' height='100%' fill='%23f1f5f9'/><text x='6' y='16' font-size='10' font-family='monospace' fill='%2364748b'>[SVG: ${encodeURIComponent(src)}]</text></svg>`;
          return `<img${prefix}src="${safeSvg}"${suffix}>`;
        }
        return match;
      });
    }

    const firstH1 = pipelineResult.headings.find(h => h.level === 1);
    const title = firstH1
      ? firstH1.text
      : (docSnapshot?.name ? docSnapshot.name.replace(/\.md$/i, '') : 'MarkForge Documentation');
    const purify = this.pipeline.getPurify();
    const cleanTitle = purify.sanitize(title);

    const isDark = theme === 'dark';
    const bg = isDark ? '#0d1117' : '#ffffff';
    const text = isDark ? '#c9d1d9' : '#1f2328';
    const border = isDark ? '#30363d' : '#d0d7de';
    const headingColor = isDark ? '#f0f6fc' : '#1f2328';
    const codeBg = isDark ? '#161b22' : '#f6f8fa';
    let accent = '#00e5ff';
    if (typeof options.accent === 'string' && options.accent.trim()) {
      const maybePreset = accentService.getPreset(options.accent.trim());
      accent = maybePreset ? maybePreset.hex : options.accent.trim();
    } else {
      const activeId = accentService.getAccent();
      const preset = accentService.getPreset(activeId);
      accent = preset ? preset.hex : ((typeof document !== 'undefined' && document.documentElement)
        ? getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
        : '') || '#00e5ff';
    }

    return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="MarkForge Markdown Studio v1.0.0">
  <title>${cleanTitle}</title>
  <style>
    :root {
      --bg: ${bg};
      --text: ${text};
      --border: ${border};
      --heading: ${headingColor};
      --code-bg: ${codeBg};
      --accent: ${accent};
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      line-height: 1.65;
      max-width: 920px;
      margin: 40px auto;
      padding: 0 32px;
      color: var(--text);
      background: var(--bg);
    }
    h1, h2, h3, h4, h5, h6 {
      color: var(--heading);
      margin-top: 1.6em;
      margin-bottom: 0.6em;
      font-weight: 600;
      line-height: 1.25;
      scroll-margin-top: 24px;
    }
    h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }
    h3 { font-size: 1.25rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
      font-size: 85%;
      background: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      line-height: 1.45;
    }
    pre code { background: transparent; padding: 0; border: none; font-size: 0.9em; }
    blockquote {
      border-left: 4px solid var(--accent);
      margin: 16px 0;
      padding: 4px 16px;
      color: ${isDark ? '#8b949e' : '#57606a'};
      background: var(--border);
      border-radius: 0 4px 4px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 8px 14px;
      text-align: left;
    }
    th {
      background: var(--code-bg);
      font-weight: 600;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
    hr {
      border: 0;
      height: 1px;
      background: var(--border);
      margin: 32px 0;
    }
    ul, ol { padding-left: 2em; margin: 12px 0; }
    li + li { margin-top: 4px; }
    .wiki-embed-media { margin: 16px 0; }
    .export-footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 0.85rem;
      color: ${isDark ? '#8b949e' : '#57606a'};
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]):not([data-theme="dark"]) {
        --bg: #0d1117;
        --text: #c9d1d9;
        --border: #30363d;
        --heading: #f0f6fc;
        --code-bg: #161b22;
      }
    }

    @media (max-width: 768px) {
      body {
        padding: 0 16px;
        margin: 20px auto;
      }
      h1 { font-size: 1.65rem; }
      h2 { font-size: 1.35rem; }
    }

    @page {
      margin: 15mm;
      size: auto;
    }

    @media print {
      body {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        color: #1e293b !important;
        background: #ffffff !important;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 11pt !important;
        line-height: 1.5 !important;
      }
      h1 {
        font-size: 24pt !important;
        font-weight: 700 !important;
        color: #0f172a !important;
        margin-top: 0 !important;
        margin-bottom: 16px !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      h2 {
        font-size: 18pt !important;
        font-weight: 700 !important;
        color: #0f172a !important;
        margin-top: 28px !important;
        margin-bottom: 12px !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      h3, h4, h5, h6 {
        color: #0f172a !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      pre, blockquote, table, img, figure, tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      a {
        color: #1e293b !important;
        text-decoration: underline !important;
      }
      code {
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace !important;
        background: #f1f5f9 !important;
        color: #0f172a !important;
        border: none !important;
        border-radius: 3px !important;
        padding: 2px 5px !important;
      }
      pre {
        background: #ffffff !important;
        color: #334155 !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 6px !important;
        padding: 12px 16px !important;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace !important;
        font-size: 9.5pt !important;
        line-height: 1.45 !important;
        overflow: visible !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }
      pre code {
        background: transparent !important;
        color: inherit !important;
      }
      blockquote {
        border-left: 3px solid #cbd5e1 !important;
        background: #f8fafc !important;
        color: #334155 !important;
        padding: 8px 14px !important;
        margin: 14px 0 !important;
      }
      table {
        border: 1px solid #cbd5e1 !important;
        display: table !important;
        width: 100% !important;
      }
      th {
        background: #f8fafc !important;
        color: #0f172a !important;
        font-weight: 600 !important;
        border: 1px solid #cbd5e1 !important;
      }
      td {
        border: 1px solid #cbd5e1 !important;
        color: #1e293b !important;
      }
      .export-footer {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <article class="markdown-body">
    ${bodyHtml}
  </article>
  <footer class="export-footer">
    <span>Generated with MarkForge Markdown Studio</span>
    <span>Exported ${new Date().toISOString().split('T')[0]}</span>
  </footer>

</body>
</html>`;
  }

  /**
   * Executes a full export workflow.
   * @param {{ name?: string, content?: string, revision?: number, path?: string }} docSnapshot
   * @param {Object} options
   * @param {string} options.format 'html' | 'pdf' | 'markdown'
   * @param {boolean} [options.force=false]
   * @returns {Promise<{ success: boolean, format: string, output?: string, blocked?: boolean, diagnostics?: Array, summary?: Object, error?: string }>}
   */
  async exportDocument(docSnapshot, options = {}) {
    const format = options.format || ExportFormat.HTML;

    // 1. Run Pre-flight Diagnostic Check
    const preflight = this.preflightCheck(docSnapshot, options);
    if (!preflight.canExport) {
      return {
        success: false,
        blocked: true,
        format,
        diagnostics: preflight.diagnostics,
        summary: preflight.summary,
        error: `Pre-flight validation failed with ${preflight.summary.errors} error(s). Correct issues or use force override.`
      };
    }

    // 2. Perform export according to format
    try {
      if (format === ExportFormat.HTML) {
        const html = this.generateStandaloneHtml(docSnapshot, options);
        return {
          success: true,
          format: ExportFormat.HTML,
          output: html,
          diagnostics: preflight.diagnostics,
          summary: preflight.summary
        };
      }

      if (format === ExportFormat.MARKDOWN) {
        const content = docSnapshot?.content || '';
        return {
          success: true,
          format: ExportFormat.MARKDOWN,
          output: content,
          diagnostics: preflight.diagnostics,
          summary: preflight.summary
        };
      }

      if (format === ExportFormat.PDF) {
        return await this.exportToPdf(docSnapshot, options);
      }

      throw new Error(`Unsupported export format: ${format}`);
    } catch (err) {
      return {
        success: false,
        format,
        error: `Export failed: ${err.message}`
      };
    }
  }

  /**
   * Executes a robust PDF export or print sequence using an isolated, sandboxed DOM container.
   * Ensures styles, KaTeX/math typesetting, and images are fully resolved and rendered
   * before invoking the print dialog or headless PDF capture.
   * @param {{ name?: string, content?: string, revision?: number, path?: string }} docSnapshot
   * @param {Object} [options={}]
   * @param {boolean} [options.triggerPrint=true]
   * @returns {Promise<{ success: boolean, format: string, output?: string, blocked?: boolean, isPrintReady?: boolean, diagnostics?: Array, summary?: Object, error?: string }>}
   */
  async exportToPdf(docSnapshot, options = {}) {
    const preflight = this.preflightCheck(docSnapshot, options);
    if (!preflight.canExport) {
      return {
        success: false,
        blocked: true,
        format: ExportFormat.PDF,
        diagnostics: preflight.diagnostics,
        summary: preflight.summary,
        error: `Pre-flight validation failed with ${preflight.summary.errors} error(s). Correct issues or use force override.`
      };
    }

    const html = this.generateStandaloneHtml(docSnapshot, {
      ...options,
      theme: 'light', // Standard technical documentation PDF format
      embedAssets: options.embedAssets !== false
    });

    const triggerPrint = options.triggerPrint !== false;
    const isBrowserEnv = typeof window !== 'undefined' && typeof document !== 'undefined';
    const isTestEnv = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST);

    if (triggerPrint && isBrowserEnv && !isTestEnv) {
      try {
        await this.printHtmlDocument(html, docSnapshot?.name || 'Document');
      } catch (err) {
        return {
          success: false,
          format: ExportFormat.PDF,
          error: `PDF print capture failed: ${err.message}`
        };
      }
    }

    return {
      success: true,
      format: ExportFormat.PDF,
      output: html,
      html,
      isPrintReady: true,
      diagnostics: preflight.diagnostics,
      summary: preflight.summary
    };
  }

  /**
   * Prints an HTML document cleanly using a sandboxed hidden iframe,
   * waiting for fonts, syntax highlighting, and images to complete rendering.
   * @param {string} html
   * @param {string} [title='Document']
   * @returns {Promise<void>}
   */
  async printHtmlDocument(html, title = 'Document') {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
      iframe.title = `PDF Print Worker - ${title}`;

      document.body.appendChild(iframe);

      let isCleanedUp = false;
      let safetyTimeout = null;

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1200);
      };

      safetyTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('PDF Print operation timed out after 15000ms.'));
      }, 15000);

      iframe.onload = async () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc) {
            cleanup();
            resolve();
            return;
          }

          // 1. Wait for web fonts if supported
          if (doc.fonts && doc.fonts.ready) {
            await doc.fonts.ready.catch(() => {});
          }

          // 2. Wait for all images to decode/load with bounded asset timeout
          const images = Array.from(doc.images || []);
          await Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(r => {
              const timer = setTimeout(r, 3000);
              img.onload = () => { clearTimeout(timer); r(); };
              img.onerror = () => { clearTimeout(timer); r(); };
            });
          }));

          // 3. Render KaTeX / Math typesetting if KaTeX is globally available
          if (typeof window.renderMathInElement === 'function') {
            try {
              window.renderMathInElement(doc.body, {
                delimiters: [
                  { left: '$$', right: '$$', display: true },
                  { left: '$', right: '$', display: false }
                ],
                throwOnError: false
              });
            } catch (_) {}
          }

          // 4. Wait for paint frame settling
          if (typeof requestAnimationFrame === 'function') {
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          }

          // 5. Electron webContents.printToPDF or native window.print()
          if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
            await window.electronAPI.printToPDF({
              marginsType: 0,
              printBackground: true,
              pageSize: 'A4'
            });
            cleanup();
            resolve();
          } else if (iframe.contentWindow && typeof iframe.contentWindow.print === 'function') {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            cleanup();
            resolve();
          } else {
            cleanup();
            resolve();
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      } else {
        cleanup();
        reject(new Error('Unable to access print frame context.'));
      }
    });
  }
}

export const exportEngine = new ExportEngine();
