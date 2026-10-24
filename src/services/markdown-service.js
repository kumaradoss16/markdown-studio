import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { accentService, DEFAULT_ACCENT } from './accent-service.js';

/**
 * Service for secure, deterministic parsing and sanitization of Markdown documents.
 */
export class MarkdownService {
  constructor() {
    this.configureMarked();
    this.initPurify();
  }

  initPurify() {
    if (typeof window !== 'undefined') {
      this.purify = createDOMPurify(window);
    } else if (typeof globalThis !== 'undefined' && globalThis.window) {
      this.purify = createDOMPurify(globalThis.window);
    } else {
      try {
        const instance = createDOMPurify();
        this.purify = (instance && typeof instance.sanitize === 'function') ? instance : { sanitize: (s) => String(s || '') };
      } catch {
        this.purify = { sanitize: (s) => String(s || '') };
      }
    }
  }

  getPurify() {
    if (!this.purify || typeof this.purify.sanitize !== 'function') {
      this.initPurify();
    }
    return this.purify;
  }

  configureMarked() {
    marked.setOptions({
      gfm: true,
      breaks: true,
      pedantic: false,
    });
  }

  /**
   * Extracts YAML frontmatter if present.
   * @param {string} rawMarkdown
   * @returns {{ frontmatter: Record<string, any> | null, content: string }}
   */
  extractFrontmatter(rawMarkdown) {
    if (!rawMarkdown || typeof rawMarkdown !== 'string') {
      return { frontmatter: null, content: '' };
    }

    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = rawMarkdown.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: null, content: rawMarkdown };
    }

    const rawYaml = match[1];
    const content = rawMarkdown.slice(match[0].length);
    const frontmatter = {};

    // Safe key-value and array parser for frontmatter
    const lines = rawYaml.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        let val = trimmed.slice(colonIdx + 1).trim();

        // Parse array syntax: [item1, item2]
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val
            .slice(1, -1)
            .split(',')
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else {
          val = val.replace(/^['"]|['"]$/g, '');
        }
        frontmatter[key] = val;
      }
    }

    return { frontmatter, content };
  }

  /**
   * Pre-processes Markdown for Obsidian-style WikiLinks [[Target]] and ![[Image]]
   * @param {string} markdown
   * @returns {string}
   */
  preprocessWikiLinks(markdown) {
    if (!markdown) return '';

    // Handle embedded image wiki links: ![[image.png]]
    let processed = markdown.replace(/!\[\[(.*?)\]\]/g, (match, path) => {
      const cleanPath = path.trim();
      return `\n<div class="wiki-embed-media"><img src="${encodeURI(cleanPath)}" alt="${cleanPath}" onerror="this.onerror=null;this.classList.add('broken-embed');this.alt='Media embed: ${cleanPath}'" /></div>\n`;
    });

    // Handle standard wiki links: [[Page Target|Display Name]] or [[Page Target]]
    processed = processed.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (match, target, display) => {
      const cleanTarget = target.trim();
      const text = display ? display.trim() : cleanTarget;
      const purify = this.getPurify();
      const safeTarget = encodeURIComponent(purify.sanitize(cleanTarget));
      const safeText = purify.sanitize(text);
      return `<a class="wiki-link" href="#" data-wiki-target="${safeTarget}">${safeText}</a>`;
    });

    return processed;
  }

  /**
   * Parses Markdown to sanitized HTML.
   * @param {string} rawMarkdown
   * @returns {{ html: string, frontmatter: Record<string, any> | null }}
   */
  /**
   * Preprocesses task list checkboxes safely into non-input custom HTML elements
   * (e.g. <span class="task-box">☐</span>) so task lists render properly without
   * exposing raw <input> elements to DOM injection or XSS vectors.
   * @param {string} markdown
   * @returns {string}
   */
  preprocessTaskLists(markdown) {
    if (!markdown || typeof markdown !== 'string') return markdown;
    return markdown
      .replace(/^([ \t]*[-*+]\s+)\[[ ]\]\s+/gm, '$1<span class="task-box">☐</span> ')
      .replace(/^([ \t]*[-*+]\s+)\[[xX]\]\s+/gm, '$1<span class="task-box checked">☑</span> ');
  }

  render(rawMarkdown) {
    if (!rawMarkdown) {
      return { html: '', frontmatter: null };
    }

    const { frontmatter, content } = this.extractFrontmatter(rawMarkdown);
    const withTaskLists = this.preprocessTaskLists(content);
    const preprocessed = this.preprocessWikiLinks(withTaskLists);
    
    // Parse using marked
    let rawHtml = '';
    try {
      rawHtml = marked.parse(preprocessed);
    } catch (err) {
      const purify = this.getPurify();
      rawHtml = `<div class="render-error">Error parsing markdown: ${purify.sanitize(err.message)}</div>`;
    }

    const purify = this.getPurify();
    // Sanitize output strictly
    // No form elements (input, textarea, select) or event handlers allowed for XSS prevention.
    // Event handlers are explicitly forbidden in FORBID_ATTR, and form elements are excluded from ALLOWED_TAGS.
    const sanitizedHtml = purify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'a', 'b', 'i', 'strong', 'em', 'strike', 's', 'del',
        'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'hr', 'br',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'span', 'div',
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'alt', 'src', 'class', 'style', 'id',
        'data-wiki-target',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'form', 'base', 'meta', 'link', 'applet', 'xml', 'template'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction', 'autofocus', 'xlink:href'],
    });

    return { html: sanitizedHtml, frontmatter };
  }

  /**
   * Computes statistics for document content.
   * @param {string} text
   * @returns {{ words: number, chars: number, readingMinutes: number }}
   */
  computeStats(text) {
    if (!text || typeof text !== 'string') {
      return { words: 0, chars: 0, readingMinutes: 0 };
    }
    const chars = text.length;
    const words = (text.trim().match(/\S+/g) || []).length;
    const readingMinutes = Math.max(1, Math.ceil(words / 225));
    return { words, chars, readingMinutes };
  }

  /**
   * Generates a complete standalone HTML document with embedded CSS.
   * @param {{ name?: string, content?: string }} doc
   * @returns {string}
   */
  generateStandaloneHtml(doc, options = {}) {
    if (!doc) return '';
    const { html } = this.render(doc.content || '');
    const title = doc.name ? doc.name.replace('.md', '') : 'MarkForge Document';
    const cleanTitle = this.getPurify().sanitize(title);

    let accentHex = '#00e5ff';
    if (typeof options.accent === 'string' && options.accent.trim()) {
      const maybePreset = accentService.getPreset(options.accent.trim());
      accentHex = maybePreset ? maybePreset.hex : options.accent.trim();
    } else {
      const activeId = accentService.getAccent();
      const preset = accentService.getPreset(activeId);
      accentHex = preset ? preset.hex : '#00e5ff';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle}</title>
  <style>
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      max-width: 860px;
      margin: 40px auto;
      padding: 0 24px;
      color: #1e293b;
      background: #ffffff;
    }
    h1 {
      font-size: 24pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 28px;
      margin-bottom: 12px;
    }
    h3 {
      font-size: 13pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    h4, h5, h6 {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 16px;
      margin-bottom: 6px;
    }
    p, ul, ol {
      color: #1e293b;
      margin: 10px 0;
      font-size: 11pt;
      line-height: 1.5;
    }
    code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 14px 0;
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 9.5pt;
      line-height: 1.45;
      overflow-x: auto;
    }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote {
      border-left: 3px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      padding: 8px 14px;
      margin: 14px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
      border: 1px solid #cbd5e1;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      color: #0f172a;
      font-weight: 600;
    }
    td {
      color: #1e293b;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .metric-card {
      display: inline-block;
      padding: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      margin-right: 8px;
      background: #ffffff;
    }
    .metric-card .val { font-size: 1.25rem; font-weight: bold; color: ${accentHex}; }

    @page {
      margin: 15mm;
      size: auto;
    }

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
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
      blockquote {
        border-left: 3px solid #cbd5e1 !important;
        background: #f8fafc !important;
        color: #334155 !important;
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
    }
  </style>
</head>
<body>
  <article class="markdown-body">
    ${html}
  </article>
</body>
</html>`;
  }
}

export const markdownService = new MarkdownService();
