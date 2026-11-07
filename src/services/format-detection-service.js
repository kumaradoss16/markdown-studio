/**
 * FormatDetectionService
 * Module C — Deterministic clipboard format and structure detection for MarkForge.
 *
 * Evaluates raw clipboard payloads and extracts comprehensive structural metadata:
 * - Identified primary source format and available MIME types.
 * - Granular element presence flags (tables, code blocks, nested lists, math, diagrams, etc.).
 * - Document element metrics and conversion confidence scoring.
 * - Detection of unsupported HTML constructs (forms, iframes, script/canvas).
 */

import { isMarkdownLooking } from './clipboard-capture-service.js';

export class FormatDetectionService {
  /**
   * Analyzes an inspected clipboard payload and produces structured detection metadata.
   *
   * @param {{
   *   formats?: string[],
   *   text?: string | null,
   *   html?: string | null,
   *   markdown?: string | null,
   *   images?: any[]
   * }} payload
   * @returns {{
   *   sourceFormat: 'markdown' | 'html' | 'text' | 'image' | 'empty',
   *   availableFormats: string[],
   *   detectedElements: {
   *     headings: boolean,
   *     lists: boolean,
   *     nestedLists: boolean,
   *     tables: boolean,
   *     complexTables: boolean,
   *     codeBlocks: boolean,
   *     inlineCode: boolean,
   *     math: boolean,
   *     images: boolean,
   *     links: boolean,
   *     blockquotes: boolean,
   *     diagrams: boolean,
   *     complexLayouts: boolean,
   *     safeHtmlTags: boolean,
   *   },
   *   counts: {
   *     headings: number,
   *     paragraphs: number,
   *     lists: number,
   *     tables: number,
   *     codeBlocks: number,
   *     diagrams: number,
   *     images: number,
   *     links: number,
   *   },
   *   confidence: number,
   *   confidenceLevel: 'high' | 'medium' | 'low',
   *   warnings: string[],
   *   unsupportedStructures: string[],
   *   hasRichVisuals: boolean,
   *   isMalformed: boolean,
   * }}
   */
  detect(payload) {
    const p = payload || {};
    const formats = p.formats || [];
    const text = p.text || '';
    const html = p.html || '';
    const markdown = p.markdown || '';
    const images = p.images || [];

    const warnings = [];
    const unsupportedStructures = [];

    const detectedElements = {
      headings: false,
      lists: false,
      nestedLists: false,
      tables: false,
      complexTables: false,
      codeBlocks: false,
      inlineCode: false,
      math: false,
      images: false,
      links: false,
      blockquotes: false,
      diagrams: false,
      complexLayouts: false,
      safeHtmlTags: false,
    };

    const counts = {
      headings: 0,
      paragraphs: 0,
      lists: 0,
      tables: 0,
      codeBlocks: 0,
      diagrams: 0,
      images: images.length,
      links: 0,
    };

    let isMalformed = false;

    // Check if totally empty
    if (!text.trim() && !html.trim() && !markdown.trim() && images.length === 0) {
      return {
        sourceFormat: 'empty',
        availableFormats: formats,
        detectedElements,
        counts,
        confidence: 0,
        confidenceLevel: 'low',
        warnings: ['Clipboard contains no usable text, HTML, or image content.'],
        unsupportedStructures,
        hasRichVisuals: false,
        isMalformed: false,
      };
    }

    // Inspect HTML structures if present
    if (html.trim()) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Check for parser error
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          isMalformed = true;
          warnings.push('HTML contains malformed tags or unclosed XML entities; fallback normalization will be applied.');
        }

        // Unsupported tags check
        const unsupportedTags = ['iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'canvas', 'applet'];
        for (const tag of unsupportedTags) {
          if (doc.querySelector(tag)) {
            unsupportedStructures.push(tag);
          }
        }
        if (unsupportedStructures.length > 0) {
          warnings.push(`Detected unsupported elements (${unsupportedStructures.join(', ')}); these will be safely omitted or flattened.`);
        }

        // Element counts & presence
        const headingEls = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
        counts.headings = headingEls.length;
        detectedElements.headings = counts.headings > 0;

        const pEls = doc.querySelectorAll('p');
        counts.paragraphs = pEls.length;

        const listEls = doc.querySelectorAll('ul, ol');
        counts.lists = listEls.length;
        detectedElements.lists = counts.lists > 0;

        const nestedListEls = doc.querySelectorAll('li ul, li ol');
        detectedElements.nestedLists = nestedListEls.length > 0;

        const tableEls = doc.querySelectorAll('table');
        counts.tables = tableEls.length;
        detectedElements.tables = counts.tables > 0;

        const complexTableEls = doc.querySelectorAll('td[colspan], td[rowspan], th[colspan], th[rowspan]');
        detectedElements.complexTables = complexTableEls.length > 0;

        const preEls = doc.querySelectorAll('pre, pre code');
        counts.codeBlocks = preEls.length;
        detectedElements.codeBlocks = counts.codeBlocks > 0;

        const codeEls = doc.querySelectorAll('code:not(pre code)');
        detectedElements.inlineCode = codeEls.length > 0;

        const bqEls = doc.querySelectorAll('blockquote');
        detectedElements.blockquotes = bqEls.length > 0;

        const aEls = doc.querySelectorAll('a[href]');
        counts.links = aEls.length;
        detectedElements.links = counts.links > 0;

        const imgEls = doc.querySelectorAll('img');
        counts.images += imgEls.length;
        detectedElements.images = counts.images > 0;

        const safeHtmlEls = doc.querySelectorAll('sup, sub, kbd');
        detectedElements.safeHtmlTags = safeHtmlEls.length > 0;

        // Math detection (KaTeX or standard math blocks)
        const hasMath = Boolean(
          doc.querySelector('.katex, [data-math], math, .math') ||
          /\$[^$\n]+\$|\$\$[\s\S]+?\$\$/m.test(html)
        );
        detectedElements.math = hasMath;

        // Diagrams detection (Mermaid, SVG diagrams, architecture card layouts)
        const hasMermaid = Boolean(
          doc.querySelector('.mermaid, pre[class*="mermaid"], [data-diagram="mermaid"]') ||
          /class="[^"]*mermaid[^"]*"/i.test(html)
        );
        const svgCount = doc.querySelectorAll('svg').length;
        const hasComplexLayout = Boolean(
          doc.querySelector('[style*="grid"], [style*="flex"], .grid, .flex, .architecture, .diagram, .metric-card') ||
          /(?:display\s*:\s*(?:grid|flex)|grid-template|metric-card)/i.test(html)
        );

        counts.diagrams = (hasMermaid ? 1 : 0) + (svgCount > 0 ? svgCount : 0) + (hasComplexLayout ? 1 : 0);
        detectedElements.diagrams = counts.diagrams > 0;
        detectedElements.complexLayouts = hasComplexLayout;
      } catch (domErr) {
        isMalformed = true;
        warnings.push(`DOM inspection failed: ${domErr.message}. Falling back to plain text inspection.`);
      }
    } else if (text.trim()) {
      // Plain text analysis
      const lines = text.split('\n');
      counts.paragraphs = text.split(/\n\s*\n/).filter(Boolean).length;
      detectedElements.headings = /^#{1,6}\s+\S+/m.test(text);
      detectedElements.lists = /^(\s*[-*+]|\s*\d+\.)\s+\S+/m.test(text);
      detectedElements.tables = /\|[\s-:]+\|/.test(text);
      detectedElements.codeBlocks = /^```/m.test(text);
      detectedElements.inlineCode = /`[^`\n]+`/.test(text);
      detectedElements.blockquotes = /^>\s+\S+/m.test(text);
      detectedElements.links = /\[.+?\]\((?:https?:\/\/|\/|\.\/|#|[a-z0-9_-]).+?\)/.test(text);
      detectedElements.math = /\$[^$\n]+\$|\$\$[\s\S]+?\$\$/m.test(text);
    }

    const hasRichVisuals = Boolean(
      detectedElements.complexLayouts ||
      detectedElements.complexTables ||
      detectedElements.diagrams ||
      (detectedElements.tables && detectedElements.codeBlocks)
    );

    // Determine source format
    let sourceFormat = 'text';
    if (markdown && isMarkdownLooking(markdown)) {
      sourceFormat = 'markdown';
    } else if (html.trim()) {
      const hasMeaningfulTags = /<(?:h[1-6]|p|div|ul|ol|li|table|pre|code|blockquote|strong|b|em|i|a|img|svg|hr|span)[^>]*>/i.test(html);
      if (hasMeaningfulTags) {
        if (text.trim() && isMarkdownLooking(text) && !hasRichVisuals) {
          const stripped = html.replace(/<[^>]+>/g, '').trim();
          if (stripped === text.trim() && !/<(?:table|pre|code|h[1-6]|ul|ol|blockquote)/i.test(html)) {
            sourceFormat = 'markdown';
          } else {
            sourceFormat = 'html';
          }
        } else {
          sourceFormat = 'html';
        }
      } else if (isMarkdownLooking(text)) {
        sourceFormat = 'markdown';
      }
    } else if (isMarkdownLooking(text)) {
      sourceFormat = 'markdown';
    } else if (images.length > 0 && !text.trim()) {
      sourceFormat = 'image';
    }

    // Calculate confidence score (0.0 to 1.0)
    let confidence = 0.5;
    if (sourceFormat === 'markdown') {
      confidence = 0.95;
    } else if (sourceFormat === 'html') {
      confidence = 0.90;
      if (isMalformed) confidence -= 0.25;
      if (unsupportedStructures.length > 0) confidence -= 0.15;
    } else if (sourceFormat === 'text') {
      confidence = 0.70;
    } else if (sourceFormat === 'image') {
      confidence = 0.90;
    }

    confidence = Math.max(0.1, Math.min(1.0, parseFloat(confidence.toFixed(2))));
    const confidenceLevel = confidence >= 0.85 ? 'high' : confidence >= 0.60 ? 'medium' : 'low';

    return {
      sourceFormat,
      availableFormats: formats,
      detectedElements,
      counts,
      confidence,
      confidenceLevel,
      warnings,
      unsupportedStructures,
      hasRichVisuals,
      isMalformed,
    };
  }
}

export const formatDetectionService = new FormatDetectionService();
