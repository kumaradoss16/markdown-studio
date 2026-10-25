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
   * Generates self-contained, sanitized HTML matching the filesystem-lab.pdf reference format.
   * Strips all corner text, page headers, footers, timestamps, URLs, copy buttons, and interactive artifacts.
   * @param {{ name?: string, content?: string, revision?: number }} docSnapshot
   * @param {Object} [options={}]
   * @param {string} [options.theme='light'] 'light' | 'dark'
   * @param {boolean} [options.embedAssets=true]
   * @param {Record<string, string>} [options.assetMap={}] Map of local asset path -> base64 data URI
   * @returns {string} Standalone HTML document string
   */
  generateStandaloneHtml(docSnapshot, options = {}) {
    const theme = options.theme || 'light'; // Force light theme for PDF/print layout
    const embedAssets = options.embedAssets !== false;
    const assetMap = options.assetMap || {};

    const pipelineResult = this.pipeline.process(docSnapshot, { withHeadingIds: true });
    let bodyHtml = pipelineResult.html;

    // If embedding assets, substitute local image sources with base64 data URIs or inline representations
    if (embedAssets) {
      bodyHtml = bodyHtml.replace(/<img([^>]+)src=["']([^"']+)["']([^>]*)>/g, (match, prefix, src, suffix) => {
        try {
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
        } catch (err) {
          console.warn(`Image processing failed for src="${src}": ${err.message}. Skipping image.`);
          return '';
        }
      });
    }

    // Remove all corner text, code block headers, buttons, and UI artifacts
    bodyHtml = bodyHtml
      .replace(/<(div|footer)[^>]*class="export-footer"[^>]*>[\s\S]*?<\/(div|footer)>/gi, '')
      .replace(/<div[^>]*class="fenced-code-header"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<button[^>]*class=".*?copy.*?"[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<span[^>]*class=".*?badge.*?"[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/\[Copy\]/gi, '')
      .replace(/http:\/\/localhost:\d+\//gi, '');

    const firstH1 = pipelineResult.headings.find(h => h.level === 1);
    const title = firstH1
      ? firstH1.text
      : (docSnapshot?.name ? docSnapshot.name.replace(/\.md$/i, '') : 'Documentation');
    const purify = this.pipeline.getPurify();
    const cleanTitle = purify.sanitize(title);

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
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="MarkForge Markdown Studio v1.0.0">
  <title>${cleanTitle}</title>
  <style>
    /* === FILESYSTEM-LAB REFERENCE STYLE === */
    :root {
      --primary-black: #000000;
      --primary-white: #ffffff;
      --text-color: #1e293b;
      --border-color: #cbd5e1;
      --code-bg: #f1f5f9;
      --code-text: #0f172a;
      --accent: ${accent};
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 
                   Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: var(--primary-black);
      background-color: var(--primary-white);
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    /* === TYPOGRAPHY === */
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      color: var(--primary-black);
      margin-top: 1.6em;
      margin-bottom: 0.6em;
      line-height: 1.25;
      page-break-after: avoid;
      break-after: avoid;
    }

    h1 {
      font-size: 24pt;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.3em;
      margin-top: 0;
    }

    h2 {
      font-size: 18pt;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.25em;
    }

    h3 {
      font-size: 14pt;
      font-weight: 700;
    }

    h4 {
      font-size: 12pt;
      font-weight: 700;
    }

    h5, h6 {
      font-size: 11pt;
      font-weight: 700;
    }

    p {
      margin: 0.8em 0;
      text-align: left;
    }

    /* === KBD === */
    kbd {
      font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 0.85em;
      padding: 2px 5px;
      background-color: #f1f5f9;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      box-shadow: 0 1px 0 rgba(0,0,0,0.08);
      white-space: nowrap;
    }

    /* === LINKS === */
    a {
      color: var(--primary-black);
      text-decoration: underline;
      word-break: break-word;
    }

    a:visited {
      color: var(--primary-black);
    }

    /* === CODE & PRE === */
    code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 9.5pt;
      background-color: var(--code-bg);
      color: var(--code-text);
      padding: 2px 5px;
      border-radius: 3px;
      border: none;
      word-break: break-word;
    }

    pre {
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 9.5pt;
      background-color: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px 16px;
      margin: 1em 0;
      line-height: 1.45;
      overflow: visible;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border: none;
      border-radius: 0;
      font-size: inherit;
    }

    /* === BLOCKQUOTE === */
    blockquote {
      border-left: 3px solid var(--border-color);
      background-color: #f8fafc;
      color: #334155;
      padding: 8px 14px;
      margin: 1em 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    blockquote p {
      margin: 0;
      text-align: left;
    }

    /* === LISTS === */
    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }

    li {
      margin: 0.4em 0;
      text-align: left;
    }

    li + li {
      margin-top: 0.4em;
    }

    /* === TABLES === */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    th, td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
      color: var(--primary-black);
    }

    th {
      background-color: #f8fafc;
      font-weight: 600;
      color: var(--primary-black);
    }

    td {
      background-color: var(--primary-white);
    }

    /* === IMAGES === */
    img {
      max-width: 100%;
      height: auto;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      margin: 1em 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* === HORIZONTAL RULE === */
    hr {
      border: none;
      border-top: 1px solid var(--border-color);
      height: 1px;
      margin: 2em 0;
      page-break-after: avoid;
    }

    /* === REMOVE INTERACTIVE ELEMENTS === */
    button, input, select, textarea {
      display: none !important;
    }

    .export-footer,
    .fenced-code-header,
    .fenced-code-copy-btn,
    .copy-btn,
    .badge,
    .metric-card,
    [class*="interactive"],
    [class*="toolbar"],
    .wiki-embed-media {
      display: none !important;
    }

    /* === PRINT STYLES === */
    @page {
      size: A4 portrait;
      margin: 0 !important;
      padding: 0;
      /* Disable all browser-generated headers/footers */
      @top-left { content: none !important; }
      @top-center { content: none !important; }
      @top-right { content: none !important; }
      @bottom-left { content: none !important; }
      @bottom-center { content: none !important; }
      @bottom-right { content: none !important; }
    }

    @media print {
      html, body {
        width: 100%;
        height: auto;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }

      body {
        padding: 16mm 20mm !important;
        max-width: 100% !important;
        font-size: 10.5pt !important;
        line-height: 1.55 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      p, li {
        text-align: left !important;
        orphans: 3;
        widows: 3;
      }

      li {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #000000 !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-inside: avoid !important;
      }

      h1 {
        margin-top: 0 !important;
        margin-bottom: 0.8em !important;
      }

      h2, h3 {
        margin-top: 1.2em !important;
        margin-bottom: 0.6em !important;
      }

      pre, blockquote, table, img, figure {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      pre {
        background-color: #f8fafc !important;
        color: #0f172a !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 4px !important;
        padding: 10px 14px !important;
        margin: 1em 0 !important;
        font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace !important;
        font-size: 9pt !important;
        line-height: 1.45 !important;
        tab-size: 2 !important;
        white-space: pre !important;
        overflow: visible !important;
        word-break: normal !important;
      }

      code {
        font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace !important;
        background-color: #f1f5f9 !important;
        color: #0f172a !important;
        padding: 2px 5px !important;
        border: none !important;
        border-radius: 3px !important;
        font-size: 9pt !important;
      }

      pre code {
        background-color: transparent !important;
        color: inherit !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        font-size: inherit !important;
        white-space: pre !important;
      }

      kbd {
        font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace !important;
        font-size: 8.5pt !important;
        padding: 1px 4px !important;
        background-color: #f8fafc !important;
        color: #0f172a !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 3px !important;
        box-shadow: none !important;
      }

      table {
        border-collapse: collapse !important;
        width: 100% !important;
        border: 1px solid #cbd5e1 !important;
      }

      th {
        background-color: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        font-weight: 600 !important;
      }

      td {
        border: 1px solid #cbd5e1 !important;
      }

      a {
        color: #000000 !important;
        text-decoration: underline !important;
      }

      /* === REMOVE ALL CORNER TEXT & HEADERS/FOOTERS === */
      header, footer,
      .export-footer,
      .page-header,
      .page-footer,
      [class*="corner"],
      [class*="metadata"],
      .timestamp,
      .url-display,
      .copy-button,
      .copy-btn,
      .fenced-code-header,
      .fenced-code-copy-btn,
      button {
        display: none !important;
      }

      @bottom-left { content: none !important; }
      @bottom-center { content: none !important; }
      @bottom-right { content: none !important; }
      @top-left { content: none !important; }
      @top-center { content: none !important; }
      @top-right { content: none !important; }
    }

    /* === PREVENT WIDOWS & ORPHANS === */
    article {
      orphans: 3;
      widows: 3;
    }
  </style>
</head>
<body>
  <article class="markdown-body">
    ${bodyHtml}
  </article>
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
        error: `Pre-flight validation failed with ${preflight.summary.errors} error(s).`
      };
    }

    const html = this.generateStandaloneHtml(docSnapshot, {
      ...options,
      theme: 'light',
      embedAssets: options.embedAssets !== false
    });

    const triggerPrint = options.triggerPrint !== false;
    const isBrowserEnv = typeof window !== 'undefined' && typeof document !== 'undefined';
    const isTestEnv = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST);

    if (triggerPrint && isBrowserEnv && !isTestEnv) {
      try {
        const firstH1 = this.pipeline.process(docSnapshot?.content || '').headings.find(h => h.level === 1);
        const resolvedTitle = options.documentTitle || (firstH1 ? firstH1.text : (docSnapshot?.name ? docSnapshot.name.replace(/\.md$/i, '') : 'Document'));
        const safeTitle = this.pipeline.getPurify().sanitize(resolvedTitle).replace(/[\\/:*?"<>|]/g, '_').trim() || 'Document';
        await this.printHtmlDocument(html, safeTitle);
      } catch (err) {
        return {
          success: false,
          format: ExportFormat.PDF,
          error: `PDF capture failed: ${err.message}`
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
            await doc.fonts.ready.catch((err) => {
              console.warn(`Font loading warning: ${err.message}`);
            });
          }

          // 2. Wait for all images to decode/load with bounded asset timeout
          const images = Array.from(doc.images || []);
          const imageLoadPromises = images.map((img) => {
            if (img.complete) {
              return Promise.resolve();
            }
            return new Promise((imgResolve) => {
              const timer = setTimeout(() => {
                console.warn(`Image load timeout: ${img.src}`);
                imgResolve();
              }, 3000);

              img.onload = () => {
                clearTimeout(timer);
                imgResolve();
              };

              img.onerror = () => {
                clearTimeout(timer);
                console.warn(`Image failed to load: ${img.src}`);
                imgResolve();
              };
            });
          });

          await Promise.all(imageLoadPromises).catch((err) => {
            console.warn(`Image batch processing error: ${err.message}`);
          });

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
            } catch (mathErr) {
              console.warn(`Math rendering warning: ${mathErr.message}`);
            }
          }

          // 4. Wait for paint frame settling
          if (typeof requestAnimationFrame === 'function') {
            await new Promise((frameResolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  frameResolve();
                });
              });
            }).catch((err) => {
              console.warn(`Animation frame error: ${err.message}`);
            });
          }

          // 5. Electron webContents.printToPDF or native window.print()
          try {
            if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
              const fileName = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
              await window.electronAPI.printToPDF({
                marginsType: 0,
                printBackground: true,
                pageSize: 'A4',
                landscape: false,
                headerTemplate: '',
                footerTemplate: '',
                preferCSSPageSize: true,
              }).then((pdfBuffer) => {
                this.savePdfToFile(pdfBuffer, fileName);
                cleanup();
                resolve();
              }).catch((err) => {
                console.warn(`Electron printToPDF error: ${err.message}`);
                cleanup();
                reject(err);
              });
              return;
            } else if (iframe.contentWindow && typeof iframe.contentWindow.print === 'function') {
              if (doc) {
                doc.title = ''; // Suppress document title in browser print header
              }
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
              cleanup();
              resolve();
            } else {
              cleanup();
              resolve();
            }
          } catch (printErr) {
            console.warn(`Print operation error: ${printErr.message}`);
            cleanup();
            resolve();
          }
        } catch (err) {
          console.warn(`Export pipeline error: ${err.message}`);
          cleanup();
          resolve();
        }
      };

      iframe.onerror = (err) => {
        console.warn(`Iframe load error: ${err.message}`);
        cleanup();
        resolve();
      };

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        try {
          doc.open();
          doc.write(html);
          doc.close();
        } catch (writeErr) {
          console.warn(`Document write error: ${writeErr.message}`);
          cleanup();
          reject(writeErr);
        }
      } else {
        cleanup();
        reject(new Error('Unable to access print frame context.'));
      }
    });
  }
  /**
   * Saves PDF buffer/blob to file with proper filename derived from document title.
   * @param {ArrayBuffer|Blob|Uint8Array} pdfData 
   * @param {string} [title='document'] 
   */
  savePdfToFile(pdfData, title = 'document') {
    const fileName = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
    
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.savePDF === 'function') {
      return window.electronAPI.savePDF(pdfData, `${fileName}.pdf`);
    }
    
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = pdfData instanceof Blob ? pdfData : new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 150);
    }
  }
}

export const exportEngine = new ExportEngine();
