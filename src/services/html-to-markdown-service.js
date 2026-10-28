import TurndownService from 'turndown';
import { gfm, tables, strikethrough, taskListItems } from 'turndown-plugin-gfm';
import createDOMPurify from 'dompurify';

/**
 * Checks whether an element has bold font weight via Tailwind classes or CSS styles.
 * @param {Element} el
 * @returns {boolean}
 */
function isBoldElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const cls = (el.className || '').toLowerCase();
  const style = (el.getAttribute('style') || '').toLowerCase();
  return (
    /(?:^|\s)(?:font-(?:semibold|bold|extrabold|black)|text-bold|bold|font-weight-bold)(?:\s|$)/.test(cls) ||
    /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style)
  );
}

/**
 * Checks whether an element has italic font style via Tailwind classes or CSS styles.
 * @param {Element} el
 * @returns {boolean}
 */
function isItalicElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const cls = (el.className || '').toLowerCase();
  const style = (el.getAttribute('style') || '').toLowerCase();
  return (
    /(?:^|\s)(?:italic|font-italic)(?:\s|$)/.test(cls) ||
    /font-style\s*:\s*italic/.test(style)
  );
}

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
   * Preprocesses DOM to preserve rich structure, cards, lists, and emphasis
   * before passing the node tree to Turndown.
   * @param {Document} doc
   */
  preprocessDom(doc) {
    if (!doc || !doc.body) return;

    // 1. Remove interactive UI buttons, feedback controls, and non-inline SVGs (ChatGPT & Claude copy bars)
    doc.body.querySelectorAll('button, [role="button"]').forEach((btn) => btn.remove());
    doc.body.querySelectorAll('svg').forEach((svg) => {
      if (!svg.closest('p, span, li')) {
        svg.remove();
      }
    });

    // 2. Clean up code block language headers and prevent duplicate text above code fences
    doc.body.querySelectorAll('pre').forEach((pre) => {
      let container = pre.parentElement;
      if (container && container.tagName === 'DIV' && container.children.length === 1) {
        container = container.parentElement;
      }
      if (container) {
        const header = container.querySelector('.code-block__header, [class*="bg-token-main-surface-secondary"], [class*="rounded-t-"]');
        if (header && header !== pre && !header.contains(pre)) {
          const headerText = header.textContent.trim().toLowerCase();
          if (headerText.length > 0 && headerText.length < 30) {
            const code = pre.querySelector('code');
            if (code && !code.className.includes('language-')) {
              code.className = `language-${headerText} ${code.className}`.trim();
            }
          }
          header.remove();
        }
      }
    });

    // 3. KaTeX and MathML formula preservation into $math$ or $$math$$
    doc.body.querySelectorAll('.katex, .math, math').forEach((mathEl) => {
      const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="tex"]');
      const isDisplay = mathEl.classList.contains('katex-display') || mathEl.closest('.katex-display') || mathEl.getAttribute('display') === 'block';
      let tex = '';
      if (annotation) {
        tex = (annotation.textContent || '').trim();
      } else {
        tex = mathEl.getAttribute('data-tex') || mathEl.getAttribute('data-latex') || '';
      }

      if (tex) {
        const delimiter = isDisplay ? '$$' : '$';
        const replacement = doc.createTextNode(isDisplay ? `\n\n${delimiter}\n${tex}\n${delimiter}\n\n` : `${delimiter}${tex}${delimiter}`);
        const displayWrapper = mathEl.closest('.katex-display');
        const target = (isDisplay && displayWrapper) ? displayWrapper : mathEl;
        target.parentNode?.replaceChild(replacement, target);
      }
    });

    // 4. Promote spans with bold / italic styling to semantic strong / em
    doc.body.querySelectorAll('span').forEach((el) => {
      if (isBoldElement(el)) {
        const strong = doc.createElement('strong');
        while (el.firstChild) {
          strong.appendChild(el.firstChild);
        }
        el.parentNode?.replaceChild(strong, el);
      } else if (isItalicElement(el)) {
        const em = doc.createElement('em');
        while (el.firstChild) {
          em.appendChild(el.firstChild);
        }
        el.parentNode?.replaceChild(em, el);
      }
    });

    // 5. Identify and transform summary cards / callout containers into <blockquote>
    const isSummaryCard = (el) => {
      if (!el || !['DIV', 'SECTION', 'ASIDE'].includes(el.tagName)) return false;
      const cls = (el.className || '').toLowerCase();
      // Ignore root content containers
      if (cls.includes('prose') || cls.includes('markdown') || el.id === 'app' || el.tagName === 'BODY') return false;
      if (el.closest('blockquote')) return false;

      // Do not convert if element primarily wraps code block or table without text
      if (el.querySelector('pre') && !el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol')) return false;
      if (el.querySelector('table') && !el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol')) return false;

      const style = (el.getAttribute('style') || '').toLowerCase();
      const hasBorderClass = /(?:^|\s)(?:border|border-[\w-]+|rounded|rounded-[\w-]+|card|callout|summary-box|admonition)(?:\s|$)/.test(cls);
      const hasBgSurface = /bg-token-main-surface|bg-token-sidebar|bg-bg-/.test(cls);
      const hasBorderStyle = /border\s*:|border-width\s*:|border-left\s*:|border-color\s*:/.test(style);

      const firstChildText = (el.firstElementChild?.textContent || '').trim().toLowerCase();
      const hasSummaryHeading = /^(?:roadmap\s+at\s+a\s+glance|at\s+a\s+glance|summary|key\s+takeaways|takeaways|overview|highlights|note|tip|important|warning)\b/i.test(firstChildText);

      return (hasBorderClass || hasBorderStyle || hasBgSurface || hasSummaryHeading);
    };

    doc.body.querySelectorAll('div, section, aside').forEach((el) => {
      if (isSummaryCard(el)) {
        const bq = doc.createElement('blockquote');
        while (el.firstChild) {
          bq.appendChild(el.firstChild);
        }
        el.parentNode?.replaceChild(bq, el);
      }
    });

    // 6. Identify and transform labeled rows into clean <ul> / <ol> lists
    const parseLabeledRow = (node) => {
      if (!node || node.nodeType !== 1) return null;
      if (!['P', 'DIV'].includes(node.tagName)) return null;

      const children = Array.from(node.children);

      // Check if child has title div/heading + desc div: e.g. <div class="phase-item"><div class="font-bold">Title</div><div>Desc</div></div>
      if (children.length === 2 && children[0].tagName === 'DIV' && children[1].tagName === 'DIV') {
        const titleText = (children[0].textContent || '').trim();
        const descText = (children[1].textContent || '').trim();
        if (titleText && descText && (isBoldElement(children[0]) || children[0].querySelector('strong, b'))) {
          return { html: `<strong>${titleText}</strong> — ${descText}`, number: null };
        }
      }

      // Check if node contains strong/b
      const strong = node.querySelector('strong, b');
      if (strong) {
        let rawStrongText = (strong.textContent || '').trim();
        const fullText = (node.textContent || '').trim();
        const strongIndex = fullText.indexOf(rawStrongText);

        if (strongIndex >= 0 && rawStrongText.length > 0 && rawStrongText.length < 120) {
          const before = fullText.substring(0, strongIndex).trim();
          // Allowed prefix: empty or icon/emoji/bullet/number
          const isIconOrShort = !before || before.length <= 6 || /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s•·⁃◦‣\-\d.]+$/u.test(before);

          if (isIconOrShort) {
            let number = null;
            let cleanBefore = before.replace(/[•·⁃◦‣*\-–—]/g, '').trim();
            const beforeNumMatch = cleanBefore.match(/^(\d+)[\.\)]$/);
            if (beforeNumMatch) {
              number = parseInt(beforeNumMatch[1], 10);
              cleanBefore = '';
            }

            let cleanStrongText = rawStrongText;
            const strongNumMatch = cleanStrongText.match(/^(\d+)[\.\)]\s*(.*)$/);
            if (strongNumMatch) {
              number = parseInt(strongNumMatch[1], 10);
              cleanStrongText = strongNumMatch[2];
            }

            // Strip trailing colon from strong text
            cleanStrongText = cleanStrongText.replace(/[:：]\s*$/, '').trim();

            let after = fullText.substring(strongIndex + rawStrongText.length).trim();
            let sep = '—';
            if (/^[—–\-]\s*/.test(after)) {
              after = after.replace(/^[—–\-]\s*/, '').trim();
              sep = '—';
            } else if (/^[:：]\s*/.test(after)) {
              after = after.replace(/^[:：]\s*/, '').trim();
              sep = ':';
            }

            if (after.length > 0) {
              const prefix = cleanBefore ? `${cleanBefore} ` : '';
              return {
                html: `${prefix}<strong>${cleanStrongText}</strong> ${sep} ${after}`,
                number,
              };
            }
          }
        }
      }

      return null;
    };

    const convertChildRowsToList = (parent) => {
      const children = Array.from(parent.children);
      let currentGroup = [];

      const flushGroup = () => {
        const minRows = parent.tagName === 'BLOCKQUOTE' ? 1 : 2;
        if (currentGroup.length >= minRows) {
          const isOrdered = currentGroup.length >= 2 && currentGroup.every((item, i) => item.number === (i + 1));
          const listEl = doc.createElement(isOrdered ? 'ol' : 'ul');
          for (const item of currentGroup) {
            const li = doc.createElement('li');
            li.innerHTML = item.html;
            listEl.appendChild(li);
          }
          parent.insertBefore(listEl, currentGroup[0].node);
          for (const item of currentGroup) {
            parent.removeChild(item.node);
          }
        }
        currentGroup = [];
      };

      for (const child of children) {
        const rowData = parseLabeledRow(child);
        if (rowData) {
          currentGroup.push({ node: child, ...rowData });
        } else {
          flushGroup();
          if (child.children.length > 0 && child.tagName !== 'UL' && child.tagName !== 'OL' && child.tagName !== 'TABLE' && child.tagName !== 'PRE') {
            convertChildRowsToList(child);
          }
        }
      }
      flushGroup();
    };

    convertChildRowsToList(doc.body);

    // 7. Promote remaining standalone title divs inside containers
    doc.body.querySelectorAll('div').forEach((el) => {
      const cls = (el.className || '').toLowerCase();
      const text = (el.textContent || '').trim();
      const hasTitleClass = /(?:font-(?:semibold|bold|extrabold)|text-(?:base|lg|xl|2xl))/.test(cls);
      const isCardHeader = cls.includes('header') || cls.includes('title');
      const isShort = text.length > 0 && text.length < 90 && !text.endsWith('.');

      if ((hasTitleClass || isCardHeader || isBoldElement(el)) && isShort && el.children.length === 0) {
        const h3 = doc.createElement('h3');
        h3.textContent = text;
        el.parentNode?.replaceChild(h3, el);
      }
    });

    // 8. Clean up <br> immediately following <strong>
    doc.body.querySelectorAll('strong, b').forEach((st) => {
      const next = st.nextSibling;
      if (next && next.nodeName === 'BR') {
        const space = doc.createTextNode(' — ');
        st.parentNode?.replaceChild(space, next);
      }
    });

    // 9. Whitespace inside strong / em: pull whitespace out
    doc.body.querySelectorAll('strong, b, em, i').forEach((el) => {
      if (el.firstChild && el.firstChild.nodeType === 3) {
        const val = el.firstChild.nodeValue;
        const leadingMatch = val.match(/^(\s+)/);
        if (leadingMatch) {
          el.firstChild.nodeValue = val.substring(leadingMatch[1].length);
          el.parentNode?.insertBefore(doc.createTextNode(leadingMatch[1]), el);
        }
      }
      if (el.lastChild && el.lastChild.nodeType === 3) {
        const val = el.lastChild.nodeValue;
        const trailingMatch = val.match(/(\s+)$/);
        if (trailingMatch) {
          el.lastChild.nodeValue = val.substring(0, val.length - trailingMatch[1].length);
          el.parentNode?.insertBefore(doc.createTextNode(trailingMatch[1]), el.nextSibling);
        }
      }
    });
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
      ADD_TAGS: ['annotation', 'semantics'],
      ADD_ATTR: ['encoding'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus',
        'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeypress', 'onkeyup'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/)/i,
      RETURN_DOM: false,
    });

    // 3. Inspect DOM elements for counts & diagram detection
    let doc;
    const ParserClass = typeof DOMParser !== 'undefined'
      ? DOMParser
      : (typeof globalThis !== 'undefined' && globalThis.DOMParser ? globalThis.DOMParser : null);
    if (ParserClass) {
      try {
        const parser = new ParserClass();
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

      // Preprocess DOM to preserve structure, hierarchy, and emphasis
      this.preprocessDom(doc);
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

    // Rule: Strong emphasis with trimmed delimiters
    turndownService.addRule('strongEmphasis', {
      filter: ['strong', 'b'],
      replacement: function (content, node, options) {
        const trimmed = content.trim();
        if (!trimmed) return '';
        const leading = /^\s+/.test(content) ? ' ' : '';
        const trailing = /\s+$/.test(content) ? ' ' : '';
        return leading + options.strongDelimiter + trimmed + options.strongDelimiter + trailing;
      }
    });

    // Rule: Italic emphasis with trimmed delimiters
    turndownService.addRule('emEmphasis', {
      filter: ['em', 'i'],
      replacement: function (content, node, options) {
        const trimmed = content.trim();
        if (!trimmed) return '';
        const leading = /^\s+/.test(content) ? ' ' : '';
        const trailing = /\s+$/.test(content) ? ' ' : '';
        return leading + options.emDelimiter + trimmed + options.emDelimiter + trailing;
      }
    });

    // Rule: Clean blockquote formatting
    turndownService.addRule('cleanBlockquote', {
      filter: 'blockquote',
      replacement: function (content) {
        const clean = content.trim().replace(/\n{3,}/g, '\n\n');
        const lines = clean.split('\n');
        const quoted = lines.map(line => line.trim().length > 0 ? `> ${line}` : '>').join('\n');
        return '\n\n' + quoted + '\n\n';
      }
    });

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

    // 5. Convert clean HTML or preprocessed DOM to Markdown
    let markdown = turndownService.turndown(doc ? doc.body : cleanHtml);

    // 6. Post-process
    // Collapse consecutive empty blockquote lines
    markdown = markdown.replace(/(?:^>\s*\n){2,}/gm, '>\n');

    // Normalize spacing around punctuation immediately following bold:
    markdown = markdown.replace(/(\*\*[^*]+\*\*)\s+([,:;.!?])/g, '$1$2');

    // Preserve Unicode characters without degradation: ensure entities were not left raw
    markdown = markdown
      .replace(/&rarr;/g, '→')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&bull;/g, '•');

    // Collapse > 2 consecutive newlines to 2 newlines (preserve readable section spacing)
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
