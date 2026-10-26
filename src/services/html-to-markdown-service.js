import TurndownService from 'turndown';
import { gfm, tables, strikethrough, taskListItems } from 'turndown-plugin-gfm';
import createDOMPurify from 'dompurify';

export class HtmlToMarkdownService {
  constructor() {
    this.purify = null;
  }

  getPurify() {
    if (!this.purify) {
      if (typeof window !== 'undefined') {
        this.purify = createDOMPurify(window);
      } else if (typeof globalThis !== 'undefined' && globalThis.window) {
        this.purify = createDOMPurify(globalThis.window);
      } else {
        try {
          const instance = createDOMPurify();
          if (instance && typeof instance.sanitize === 'function') {
            this.purify = instance;
          } else {
            this.purify = { sanitize: (s) => String(s || '') };
          }
        } catch {
          this.purify = { sanitize: (s) => String(s || '') };
        }
      }
    }
    return this.purify;
  }

  /**
   * Converts HTML string to clean, standardized GitHub Flavored Markdown.
   * @param {string} rawHtml
   * @returns {{
   *   markdown: string,
   *   images: Array<{ index: number, src: string, alt: string, title: string }>,
   *   warnings: string[],
   *   counts: { headings: number, paragraphs: number, tables: number, codeBlocks: number, images: number, lists: number, links: number, diagrams: number }
   * }}
   */
  convert(rawHtml) {
    const warnings = [];
    const counts = {
      headings: 0,
      paragraphs: 0,
      tables: 0,
      codeBlocks: 0,
      images: 0,
      lists: 0,
      links: 0,
      diagrams: 0,
    };

    if (!rawHtml || typeof rawHtml !== 'string') {
      return {
        markdown: '',
        images: [],
        warnings: ['Empty HTML payload received.'],
        counts,
      };
    }

    // 1. Check for potentially dangerous tags prior to sanitization
    if (/<script/i.test(rawHtml)) {
      warnings.push('Dangerous <script> tags were detected and safely removed.');
    }
    if (/<iframe|<object|<embed/i.test(rawHtml)) {
      warnings.push('Embedded active frames/objects were detected and safely removed.');
    }
    if (/<style/i.test(rawHtml)) {
      warnings.push('Embedded <style> stylesheet blocks were detected and removed.');
    }
    if (/(?:href|src)\s*=\s*["'](?:javascript:|data:text\/html)/i.test(rawHtml)) {
      warnings.push('Executable javascript: or unsafe data: URI links were blocked.');
    }

    // 2. DOMPurify sanitization boundary
    const purify = this.getPurify();
    const cleanHtml = purify.sanitize(rawHtml, {
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'applet', 'base'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus',
        'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeypress', 'onkeyup'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/)/i,
      RETURN_DOM: false,
    });

    // 3. Inspect DOM elements for counts & diagram detection
    let doc;
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        doc = parser.parseFromString(`<body>${cleanHtml}</body>`, 'text/html');
      } catch {}
    }

    if (doc) {
      counts.headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
      counts.paragraphs = doc.querySelectorAll('p').length;
      counts.tables = doc.querySelectorAll('table').length;
      counts.codeBlocks = doc.querySelectorAll('pre').length;
      counts.images = doc.querySelectorAll('img').length;
      counts.lists = doc.querySelectorAll('ul, ol').length;
      counts.links = doc.querySelectorAll('a[href]').length;

      // Detect diagrams (mermaid classes or attributes)
      doc.querySelectorAll('.mermaid, [data-diagram="mermaid"], code[class*="mermaid"]').forEach(() => {
        counts.diagrams += 1;
      });
    }

    // 4. Configure Turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    // Apply GFM plugins (tables, strikethrough, task lists)
    if (gfm) {
      turndownService.use(gfm);
    } else {
      if (tables) turndownService.use(tables);
      if (strikethrough) turndownService.use(strikethrough);
      if (taskListItems) turndownService.use(taskListItems);
    }

    const imagesQueue = [];

    // Rule: Tables - Escape pipe characters inside table cells
    turndownService.addRule('tableCellWithEscapedPipes', {
      filter: ['th', 'td'],
      replacement: function (content, node) {
        const parent = node.parentNode;
        const siblings = parent ? Array.from(parent.childNodes).filter(n => n.nodeType === 1) : [node];
        const index = siblings.indexOf(node);
        let prefix = ' ';
        if (index === 0) prefix = '| ';
        // Escape unescaped pipes
        const escaped = content.replace(/\\\|/g, '__ESCAPED_PIPE__').replace(/\|/g, '\\|').replace(/__ESCAPED_PIPE__/g, '\\|').trim();
        return prefix + escaped + ' |';
      }
    });

    // Rule: Mermaid diagram blocks
    turndownService.addRule('mermaidBlock', {
      filter: function (node) {
        if (node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE') {
          const cls = (node.firstChild.className || '') + ' ' + (node.className || '');
          if (/(?:language|lang)-mermaid/i.test(cls)) return true;
        }
        const cls = node.className || '';
        if (typeof cls === 'string' && cls.split(/\s+/).includes('mermaid')) return true;
        if (node.getAttribute && node.getAttribute('data-diagram') === 'mermaid') return true;
        return false;
      },
      replacement: function (content, node) {
        const text = node.textContent || '';
        return '\n\n```mermaid\n' + text.trim() + '\n```\n\n';
      }
    });

    // Rule: Fenced code blocks with language extraction
    turndownService.addRule('fencedCodeBlock', {
      filter: function (node, options) {
        return (
          options.codeBlockStyle === 'fenced' &&
          node.nodeName === 'PRE' &&
          node.firstChild &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: function (content, node) {
        const code = node.firstChild;
        const className = (code.className || '') + ' ' + (node.className || '');
        let lang = '';
        const langAttr = code.getAttribute?.('data-language') || node.getAttribute?.('data-language');
        if (langAttr) {
          lang = langAttr;
        } else {
          const match = className.match(/(?:language|lang|highlight-source)-([a-zA-Z0-9_+-]+)/i);
          if (match) lang = match[1];
        }
        const text = code.textContent || '';
        const cleanText = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
        return '\n\n```' + lang + '\n' + cleanText + '\n```\n\n';
      }
    });

    // Rule: Images - queue collection and placeholder token
    turndownService.addRule('imgPlaceholder', {
      filter: 'img',
      replacement: function (content, node) {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'pasted-image';
        const title = node.getAttribute('title') || '';
        if (!src) return '';

        const index = imagesQueue.length;
        imagesQueue.push({ index, src, alt, title });
        return `![${alt}](__MARKFORGE_IMG_${index}__${title ? ` "${title}"` : ''})`;
      }
    });

    // Rule: Horizontal rule
    turndownService.addRule('horizontalRule', {
      filter: 'hr',
      replacement: function () {
        return '\n\n---\n\n';
      }
    });

    // 5. Convert clean HTML to Markdown
    let markdown = turndownService.turndown(cleanHtml);

    // 6. Post-process
    // Collapse > 2 consecutive newlines to 2 newlines
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    // Ensure trailing newline
    if (markdown.trim().length > 0 && !markdown.endsWith('\n')) {
      markdown += '\n';
    }

    return {
      markdown,
      images: imagesQueue,
      warnings,
      counts,
    };
  }
}

export const htmlToMarkdownService = new HtmlToMarkdownService();
