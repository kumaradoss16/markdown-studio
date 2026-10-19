import { Marked } from 'marked';
import createDOMPurify from 'dompurify';

/**
 * Deterministically converts heading text into a URL-friendly anchor slug.
 * @param {string} text
 * @param {number} [occurrence=0]
 * @returns {string}
 */
export function generateAnchor(text, occurrence = 0) {
  if (!text || typeof text !== 'string') {
    return occurrence > 0 ? `section-${occurrence}` : 'section';
  }

  // Strip markdown formatting like **bold**, *italic*, `code`, [[wiki]]
  const stripped = text
    .replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (match, p1, p2) => p2 || p1)
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[`*_~#]/g, '')
    .trim();

  let slug = stripped
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric except space and hyphen
    .replace(/\s+/g, '-')          // replace spaces with single hyphen
    .replace(/-+/g, '-')           // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');      // trim leading/trailing hyphens

  if (!slug) {
    slug = 'section';
  }

  return occurrence > 0 ? `${slug}-${occurrence}` : slug;
}

/**
 * Shared, versioned Markdown Processing Pipeline.
 * Powers live preview, table of contents generator, document outline,
 * quality diagnostics, link/asset validation, and export engine.
 */
export class MarkdownPipeline {
  constructor() {
    this.pipelineVersion = '0.3.0';
    this.cache = new Map(); // key: `${docId}:${revision}:${contentLength}` -> parsed pipeline state
    this.purify = null;
  }

  getPurify() {
    if (!this.purify) {
      if (typeof window !== 'undefined') {
        this.purify = createDOMPurify(window);
      } else {
        try {
          // In Node.js testing/CLI environment
          const { JSDOM } = require('jsdom');
          this.purify = createDOMPurify(new JSDOM('').window);
        } catch {
          try {
            this.purify = createDOMPurify();
          } catch {
            this.purify = { sanitize: (s) => s };
          }
        }
      }
    }
    return this.purify;
  }

  /**
   * Extracts frontmatter and splits out content body.
   * @param {string} rawMarkdown
   * @returns {{ frontmatter: Record<string, any> | null, content: string, frontmatterRaw: string }}
   */
  extractFrontmatter(rawMarkdown) {
    if (!rawMarkdown || typeof rawMarkdown !== 'string') {
      return { frontmatter: null, content: '', frontmatterRaw: '' };
    }

    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = rawMarkdown.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: null, content: rawMarkdown, frontmatterRaw: '' };
    }

    const frontmatterRaw = match[1];
    const content = rawMarkdown.slice(match[0].length);
    const frontmatter = {};

    const lines = frontmatterRaw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        let val = trimmed.slice(colonIdx + 1).trim();

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

    return { frontmatter, content, frontmatterRaw };
  }

  /**
   * Primary pipeline entry point. Parses an immutable document snapshot.
   * @param {{ id?: string, content?: string, revision?: number, path?: string }} docSnapshot
   * @param {{ withHeadingIds?: boolean }} [options={ withHeadingIds: true }]
   * @returns {PipelineResult}
   */
  process(docSnapshot, options = { withHeadingIds: true }) {
    const docId = docSnapshot?.id || null;
    const revision = docSnapshot?.revision ?? 0;
    const rawMarkdown = docSnapshot?.content || '';
    const withHeadingIds = options?.withHeadingIds !== false;
    const cacheKey = docId ? `${docId}:${revision}:${withHeadingIds}` : null;

    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const { frontmatter, content, frontmatterRaw } = this.extractFrontmatter(rawMarkdown);
    const lineOffset = frontmatterRaw ? frontmatterRaw.split(/\r?\n/).length + 2 : 0;

    // 1. Structural extraction
    const headings = [];
    const links = [];
    const images = [];
    const codeBlocks = [];
    const occurrences = new Map();

    const lines = content.split(/\r?\n/);
    let inFencedBlock = false;
    let fencedBlockStartLine = 0;
    let fencedLang = '';
    let fencedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const currentLineNum = i + 1 + lineOffset;

      // Check fenced code block
      const fenceMatch = lineText.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        if (!inFencedBlock) {
          inFencedBlock = true;
          fencedBlockStartLine = currentLineNum;
          fencedLang = fenceMatch[3].trim();
          fencedLines = [];
        } else {
          inFencedBlock = false;
          codeBlocks.push({
            lang: fencedLang,
            code: fencedLines.join('\n'),
            line: fencedBlockStartLine,
            isClosed: true
          });
        }
        continue;
      }

      if (inFencedBlock) {
        fencedLines.push(lineText);
        continue;
      }

      // Heading detection: ATX headings (# ...)
      const headingMatch = lineText.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const baseSlug = generateAnchor(text, 0);
        const occurrence = occurrences.get(baseSlug) || 0;
        occurrences.set(baseSlug, occurrence + 1);

        const anchor = generateAnchor(text, occurrence);

        headings.push({
          level,
          text,
          anchor,
          occurrence,
          line: currentLineNum,
          raw: lineText
        });
        continue;
      }

      // Link and image detection
      // Standard markdown image: ![alt](url)
      const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
      let imgMatch;
      while ((imgMatch = imageRegex.exec(lineText)) !== null) {
        const alt = imgMatch[1];
        const src = imgMatch[2].trim();
        images.push({
          alt,
          src,
          line: currentLineNum,
          raw: imgMatch[0],
          isLocal: !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')
        });
      }

      // Wiki image: ![[image.png]]
      const wikiImgRegex = /!\[\[(.*?)\]\]/g;
      let wikiImgMatch;
      while ((wikiImgMatch = wikiImgRegex.exec(lineText)) !== null) {
        const src = wikiImgMatch[1].trim();
        images.push({
          alt: src,
          src,
          line: currentLineNum,
          raw: wikiImgMatch[0],
          isLocal: true,
          isWiki: true
        });
      }

      // Standard markdown link: [text](url) (exclude if preceded by !)
      const linkRegex = /(^|[^!])\[(.*?)\]\((.*?)\)/g;
      let lMatch;
      while ((lMatch = linkRegex.exec(lineText)) !== null) {
        const text = lMatch[2];
        const href = lMatch[3].trim();
        const isAnchor = href.startsWith('#');
        const isRemote = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');
        links.push({
          text,
          href,
          line: currentLineNum,
          raw: `[${text}](${href})`,
          isAnchor,
          isRemote,
          isLocal: !isAnchor && !isRemote,
          targetAnchor: isAnchor ? href.slice(1) : null
        });
      }

      // Wiki link: [[Target|Text]] or [[Target]]
      const wikiLinkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
      let wMatch;
      while ((wMatch = wikiLinkRegex.exec(lineText)) !== null) {
        const target = wMatch[1].trim();
        const text = wMatch[2] ? wMatch[2].trim() : target;
        links.push({
          text,
          href: `${target}.md`,
          line: currentLineNum,
          raw: wMatch[0],
          isAnchor: false,
          isRemote: false,
          isLocal: true,
          isWiki: true
        });
      }
    }

    // Unclosed fenced block check
    if (inFencedBlock) {
      codeBlocks.push({
        lang: fencedLang,
        code: fencedLines.join('\n'),
        line: fencedBlockStartLine,
        isClosed: false
      });
    }

    // 2. Coordinated HTML rendering
    let preprocessed = content.replace(/!\[\[(.*?)\]\]/g, (match, path) => {
      const cleanPath = path.trim();
      return `\n<div class="wiki-embed-media"><img src="${encodeURI(cleanPath)}" alt="${cleanPath}" onerror="this.onerror=null;this.classList.add('broken-embed');this.alt='Media embed: ${cleanPath}'" /></div>\n`;
    });

    preprocessed = preprocessed.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (match, target, display) => {
      const cleanTarget = target.trim();
      const text = display ? display.trim() : cleanTarget;
      return `<a class="wiki-link" href="#" data-wiki-target="${encodeURIComponent(cleanTarget)}">${text}</a>`;
    });

    const markedInstance = new Marked({
      gfm: true,
      breaks: true,
      pedantic: false
    });

    let headingIndex = 0;
    markedInstance.use({
      renderer: {
        ...(withHeadingIds ? {
          heading({ tokens, depth }) {
            const renderedText = this.parser.parseInline(tokens);
            const headingMeta = headings[headingIndex++];
            const anchorId = headingMeta ? headingMeta.anchor : generateAnchor(renderedText, 0);
            return `<h${depth} id="${anchorId}">${renderedText}</h${depth}>\n`;
          }
        } : {}),
        code({ text, lang }) {
          const rawLang = (lang || 'text').replace(/[`~]/g, '').trim().split(/\s+/)[0];
          const cleanLang = rawLang.toLowerCase() || 'text';
          const displayLang = cleanLang.toUpperCase();
          const escapedCode = (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          return `<div class="fenced-code-container" data-language="${cleanLang}">` +
            `<div class="fenced-code-header">` +
            `<div class="fenced-code-lang"><span class="fenced-code-dot"></span><span class="fenced-code-label">${displayLang}</span></div>` +
            `<button class="fenced-code-copy-btn" type="button" aria-label="Copy code">` +
            `<svg class="code-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
            `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>` +
            `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>` +
            `</svg><span class="code-copy-label">Copy</span></button>` +
            `</div>` +
            `<pre><code class="language-${cleanLang}">${escapedCode}</code></pre>` +
            `</div>\n`;
        }
      }
    });

    let rawHtml = '';
    try {
      rawHtml = markedInstance.parse(preprocessed);
    } catch (err) {
      const purify = this.getPurify();
      rawHtml = `<div class="render-error">Error parsing markdown: ${purify.sanitize(err.message)}</div>`;
    }

    // 3. Strict DOMPurify Sanitization boundary
    const purify = this.getPurify();
    const sanitizedHtml = purify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'a', 'b', 'i', 'strong', 'em', 'strike', 's', 'del', 'u',
        'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'hr', 'br',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'span', 'div', 'article', 'section',
        'input', 'button', 'svg', 'path', 'rect', 'line', 'polyline', 'circle', 'ellipse',
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'alt', 'src', 'class', 'style', 'id',
        'type', 'checked', 'disabled', 'data-wiki-target', 'name',
        'data-language', 'data-code', 'aria-label',
        'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
        'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'form', 'base'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction'],
    });

    const result = {
      pipelineVersion: this.pipelineVersion,
      documentRevision: revision,
      frontmatter,
      content,
      headings,
      links,
      images,
      codeBlocks,
      html: sanitizedHtml
    };

    // Store in cache
    if (cacheKey) {
      this.cache.set(cacheKey, result);
      if (this.cache.size > 30) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
    }

    return result;
  }
}

export const markdownPipeline = new MarkdownPipeline();
