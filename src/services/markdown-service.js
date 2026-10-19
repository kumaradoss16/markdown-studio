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
    } else {
      this.purify = createDOMPurify();
    }
  }

  getPurify() {
    if (!this.purify && typeof window !== 'undefined') {
      this.purify = createDOMPurify(window);
    }
    return this.purify || createDOMPurify();
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
      return `<a class="wiki-link" href="#" data-wiki-target="${encodeURIComponent(cleanTarget)}">${text}</a>`;
    });

    return processed;
  }

  /**
   * Parses Markdown to sanitized HTML.
   * @param {string} rawMarkdown
   * @returns {{ html: string, frontmatter: Record<string, any> | null }}
   */
  render(rawMarkdown) {
    if (!rawMarkdown) {
      return { html: '', frontmatter: null };
    }

    const { frontmatter, content } = this.extractFrontmatter(rawMarkdown);
    const preprocessed = this.preprocessWikiLinks(content);
    
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
    const sanitizedHtml = purify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'a', 'b', 'i', 'strong', 'em', 'strike', 's', 'del',
        'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'hr', 'br',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'span', 'div',
        'input',
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'alt', 'src', 'class', 'style', 'id',
        'type', 'checked', 'disabled', 'data-wiki-target',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
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
    const title = doc.name ? doc.name.replace('.md', '') : 'DevspireHub Document';
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 860px;
      margin: 40px auto;
      padding: 0 24px;
      color: #1e293b;
      background: #ffffff;
    }
    h1, h2, h3, h4 { color: #0f172a; margin-top: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    code { font-family: 'JetBrains Mono', Consolas, monospace; background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote { border-left: 4px solid ${accentHex}; margin: 16px 0; padding-left: 14px; color: #475569; }
    table { border-collapse: collapse; width: 100%; margin: 18px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    .metric-card { display: inline-block; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; margin-right: 8px; }
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
        color: #000000 !important;
        background: #ffffff !important;
        font-size: 11pt !important;
        line-height: 1.5 !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: #000000 !important;
        page-break-after: avoid;
        break-after: avoid;
      }
      pre, blockquote, table, img, figure {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      a {
        color: #000000 !important;
        text-decoration: underline !important;
      }
      code {
        background: #f1f5f9 !important;
        color: #000000 !important;
      }
      pre {
        background: #f8fafc !important;
        color: #000000 !important;
        border: 1px solid #e2e8f0 !important;
      }
      blockquote {
        border-left: 3px solid #cbd5e1 !important;
        color: #334155 !important;
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
