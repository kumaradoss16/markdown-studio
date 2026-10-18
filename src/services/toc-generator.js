import { markdownPipeline } from './markdown-pipeline.js';

export const TOC_START_MARKER = '<!-- DEVSPIREHUB_TOC_START -->';
export const TOC_END_MARKER = '<!-- DEVSPIREHUB_TOC_END -->';

/**
 * Options for Table of Contents generation.
 * @typedef {Object} TocOptions
 * @property {number} [minLevel=2] Minimum heading level to include (1-6)
 * @property {number} [maxLevel=4] Maximum heading level to include (1-6)
 * @property {boolean} [includeTitle=false] Whether to include a "## Table of Contents" header inside the markers
 * @property {number} [indentSize=2] Number of spaces per indentation level
 * @property {boolean} [ordered=false] Use ordered numbers instead of bullets
 */

/**
 * Table of Contents Generator and Invariant-Preserving Region Manager.
 */
export class TocGenerator {
  constructor(pipeline = markdownPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * Scans markdown for existing TOC markers.
   * @param {string} markdown
   * @returns {{ hasStart: boolean, hasEnd: boolean, startIndex: number, endIndex: number, isWellFormed: boolean, innerContent: string | null }}
   */
  findTocRegion(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return {
        hasStart: false,
        hasEnd: false,
        startIndex: -1,
        endIndex: -1,
        isWellFormed: false,
        innerContent: null
      };
    }

    const startIndex = markdown.indexOf(TOC_START_MARKER);
    const endIndex = markdown.indexOf(TOC_END_MARKER);

    const hasStart = startIndex !== -1;
    const hasEnd = endIndex !== -1;

    if (!hasStart && !hasEnd) {
      return {
        hasStart: false,
        hasEnd: false,
        startIndex: -1,
        endIndex: -1,
        isWellFormed: true, // No TOC region present is valid
        innerContent: null
      };
    }

    if (hasStart && !hasEnd) {
      return {
        hasStart: true,
        hasEnd: false,
        startIndex,
        endIndex: -1,
        isWellFormed: false,
        error: 'Missing closing <!-- DEVSPIREHUB_TOC_END --> marker',
        innerContent: null
      };
    }

    if (!hasStart && hasEnd) {
      return {
        hasStart: false,
        hasEnd: true,
        startIndex: -1,
        endIndex,
        isWellFormed: false,
        error: 'Missing opening <!-- DEVSPIREHUB_TOC_START --> marker',
        innerContent: null
      };
    }

    if (endIndex < startIndex) {
      return {
        hasStart: true,
        hasEnd: true,
        startIndex,
        endIndex,
        isWellFormed: false,
        error: 'Closing <!-- DEVSPIREHUB_TOC_END --> appears before opening marker',
        innerContent: null
      };
    }

    // Well-formed existing region
    const fullEndIndex = endIndex + TOC_END_MARKER.length;
    const innerContent = markdown.slice(startIndex + TOC_START_MARKER.length, endIndex).trim();

    return {
      hasStart: true,
      hasEnd: true,
      startIndex,
      endIndex: fullEndIndex,
      isWellFormed: true,
      innerContent
    };
  }

  /**
   * Generates the markdown representation of the Table of Contents from document headings.
   * @param {Array<{ level: number, text: string, anchor: string }>} headings
   * @param {TocOptions} [options={}]
   * @returns {string} Formatted TOC markdown block including markers
   */
  buildTocMarkdown(headings, options = {}) {
    const minLevel = options.minLevel ?? 2;
    const maxLevel = options.maxLevel ?? 4;
    const includeTitle = !!options.includeTitle;
    const indentSize = options.indentSize ?? 2;
    const ordered = !!options.ordered;

    // Filter eligible headings
    const filtered = (headings || []).filter(h => h.level >= minLevel && h.level <= maxLevel);

    if (filtered.length === 0) {
      const parts = [TOC_START_MARKER];
      if (includeTitle) parts.push('## Table of Contents\n');
      parts.push('*No headings found within configured levels.*');
      parts.push(TOC_END_MARKER);
      return parts.join('\n');
    }

    // Determine the base level for relative indentation
    const baseLevel = Math.min(...filtered.map(h => h.level));

    const lines = [];
    if (includeTitle) {
      lines.push('## Table of Contents\n');
    }

    const counters = {};

    filtered.forEach(h => {
      const relativeDepth = Math.max(0, h.level - baseLevel);
      const indent = ' '.repeat(relativeDepth * indentSize);

      let bullet = '-';
      if (ordered) {
        counters[relativeDepth] = (counters[relativeDepth] || 0) + 1;
        // Reset child counters
        Object.keys(counters).forEach(k => {
          if (parseInt(k, 10) > relativeDepth) delete counters[k];
        });
        bullet = `${counters[relativeDepth]}.`;
      }

      lines.push(`${indent}${bullet} [${h.text}](#${h.anchor})`);
    });

    return `${TOC_START_MARKER}\n${lines.join('\n')}\n${TOC_END_MARKER}`;
  }

  /**
   * Creates a non-destructive TOC insertion or update proposal.
   * @param {{ id?: string, content?: string, revision?: number }} docSnapshot
   * @param {TocOptions} [options={}]
   * @returns {TocProposal}
   */
  createProposal(docSnapshot, options = {}) {
    const content = docSnapshot?.content || '';
    const revision = docSnapshot?.revision ?? 0;

    // 1. Process document via shared pipeline to extract exact AST headings
    const pipelineResult = this.pipeline.process(docSnapshot);
    const headings = pipelineResult.headings;

    // 2. Check for existing region
    const region = this.findTocRegion(content);

    if (!region.isWellFormed && (region.hasStart || region.hasEnd)) {
      throw new Error(`Cannot generate TOC: Malformed TOC markers detected. ${region.error}`);
    }

    const generatedToc = this.buildTocMarkdown(headings, options);

    if (region.hasStart && region.hasEnd) {
      // Existing region: update in-place
      const before = content.slice(0, region.startIndex);
      const after = content.slice(region.endIndex);
      const proposedContent = `${before}${generatedToc}${after}`;

      return {
        documentRevision: revision,
        isUpdate: true,
        startIndex: region.startIndex,
        endIndex: region.endIndex,
        generatedToc,
        proposedContent,
        hasExistingToc: true
      };
    }

    // New insertion: determine insertion point
    // Preference:
    // 1. After frontmatter if present
    // 2. After document's primary H1 heading if present
    // 3. At start of document
    let insertIndex = 0;

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (frontmatterMatch) {
      insertIndex = frontmatterMatch[0].length;
    }

    // Check if there is an H1 right after frontmatter
    const remainder = content.slice(insertIndex);
    const h1Match = remainder.match(/^(\s*#\s+[^\r\n]+\r?\n+)/);
    if (h1Match) {
      insertIndex += h1Match[0].length;
    }

    const before = content.slice(0, insertIndex);
    const after = content.slice(insertIndex);

    // Ensure comfortable spacing around the new TOC block
    const prefix = (before.length > 0 && !before.endsWith('\n\n')) ? '\n\n' : '';
    const suffix = (after.length > 0 && !after.startsWith('\n')) ? '\n\n' : (after.length > 0 ? '\n' : '');

    const insertionBlock = `${prefix}${generatedToc}${suffix}`;
    const proposedContent = `${before}${insertionBlock}${after}`;

    return {
      documentRevision: revision,
      isUpdate: false,
      startIndex: insertIndex,
      endIndex: insertIndex,
      generatedToc,
      proposedContent,
      hasExistingToc: false
    };
  }

  /**
   * Applies an approved TOC proposal with strict revision consistency.
   * Enforces Invariant 3 (Narrow transformation) and Invariant 5 (No stale writes).
   * @param {{ content: string, revision: number }} currentDoc
   * @param {TocProposal} proposal
   * @returns {{ updatedContent: string, newRevision: number }}
   */
  applyProposal(currentDoc, proposal) {
    if (!currentDoc || !proposal) {
      throw new Error('Invalid arguments: currentDoc and proposal are required.');
    }

    if (currentDoc.revision !== proposal.documentRevision) {
      throw new Error(
        `Stale revision conflict: Document is at revision ${currentDoc.revision}, but TOC proposal was calculated against revision ${proposal.documentRevision}. Proposal rejected to preserve data integrity.`
      );
    }

    return {
      updatedContent: proposal.proposedContent,
      newRevision: currentDoc.revision + 1
    };
  }
}

export const tocGenerator = new TocGenerator();
