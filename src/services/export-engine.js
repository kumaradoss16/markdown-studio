import { markdownPipeline } from './markdown-pipeline.js';
import { qualityChecker, DiagnosticSeverity } from './quality-checker.js';

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

    // If embedding assets, substitute local image sources with base64 data URIs
    if (embedAssets && Object.keys(assetMap).length > 0) {
      bodyHtml = bodyHtml.replace(/<img([^>]+)src=["']([^"']+)["']([^>]*)>/g, (match, prefix, src, suffix) => {
        const decodedSrc = decodeURIComponent(src);
        if (assetMap[decodedSrc] || assetMap[src]) {
          const base64Uri = assetMap[decodedSrc] || assetMap[src];
          return `<img${prefix}src="${base64Uri}"${suffix}>`;
        }
        return match;
      });
    }

    const firstH1 = pipelineResult.headings.find(h => h.level === 1);
    const title = firstH1
      ? firstH1.text
      : (docSnapshot?.name ? docSnapshot.name.replace(/\.md$/i, '') : 'DevspireHub Documentation');
    const purify = this.pipeline.getPurify();
    const cleanTitle = purify.sanitize(title);

    const isDark = theme === 'dark';
    const bg = isDark ? '#0d1117' : '#ffffff';
    const text = isDark ? '#c9d1d9' : '#1f2328';
    const border = isDark ? '#30363d' : '#d0d7de';
    const headingColor = isDark ? '#f0f6fc' : '#1f2328';
    const codeBg = isDark ? '#161b22' : '#f6f8fa';
    const accent = (typeof options.accent === 'string' && options.accent.trim())
      ? options.accent.trim()
      : ((typeof document !== 'undefined' && document.documentElement)
          ? getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
          : '') || '#00e5ff';

    return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="DevspireHub Markdown Studio v0.3.0">
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
      background: ${isDark ? 'rgba(0, 229, 255, 0.04)' : 'rgba(0, 229, 255, 0.08)'};
      border-radius: 0 4px 4px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      display: block;
      overflow-x: auto;
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
    }

    @media print {
      body {
        max-width: 100%;
        margin: 0;
        padding: 16mm 20mm;
        color: #000000 !important;
        background: #ffffff !important;
        font-size: 11pt;
      }
      h1, h2, h3 { color: #000000 !important; page-break-after: avoid; }
      pre, blockquote, table, img { page-break-inside: avoid; }
      a { color: #000000 !important; text-decoration: underline; }
      .export-footer { display: none; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <article class="markdown-body">
    ${bodyHtml}
  </article>
  <footer class="export-footer">
    <span>DevspireHub Markdown Studio</span>
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
        // PDF triggers print workflow
        const html = this.generateStandaloneHtml(docSnapshot, options);
        return {
          success: true,
          format: ExportFormat.PDF,
          output: html,
          isPrintReady: true,
          diagnostics: preflight.diagnostics,
          summary: preflight.summary
        };
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
}

export const exportEngine = new ExportEngine();
