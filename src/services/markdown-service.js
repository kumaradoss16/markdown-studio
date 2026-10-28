import { exportEngine } from './export-engine.js';
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
        'code', 'pre', 'blockquote', 'kbd', 'sub', 'sup', 'mark',
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
    return exportEngine.generateStandaloneHtml(doc, options);
  }
}

export const markdownService = new MarkdownService();
