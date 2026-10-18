import { markdownPipeline } from './markdown-pipeline.js';
import { tocGenerator } from './toc-generator.js';

export const DiagnosticSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

export const RuleId = {
  MISSING_H1: 'RULE_MISSING_H1',
  HEADING_LEVEL_SKIP: 'RULE_HEADING_LEVEL_SKIP',
  UNCLOSED_CODEBLOCK: 'RULE_UNCLOSED_CODEBLOCK',
  BROKEN_INTERNAL_ANCHOR: 'RULE_BROKEN_INTERNAL_ANCHOR',
  BROKEN_LOCAL_LINK: 'RULE_BROKEN_LOCAL_LINK',
  MISSING_LOCAL_IMAGE: 'RULE_MISSING_LOCAL_IMAGE',
  MISSING_ALT_TEXT: 'RULE_MISSING_ALT_TEXT',
  EMPTY_LINK: 'RULE_EMPTY_LINK',
  CORRUPT_TOC_MARKERS: 'RULE_CORRUPT_TOC_MARKERS',
  STALE_TOC: 'RULE_STALE_TOC'
};

/**
 * Documentation Quality Checker & Diagnostic Engine.
 * Implements deterministic rules with actionable diagnostic schemas.
 */
export class QualityChecker {
  constructor(pipeline = markdownPipeline, toc = tocGenerator) {
    this.pipeline = pipeline;
    this.toc = toc;
  }

  /**
   * Evaluates all quality rules against a document snapshot.
   * @param {{ id?: string, content?: string, revision?: number, path?: string }} docSnapshot
   * @param {{ workspaceResolver?: { fileExists: (p: string) => boolean, isWithinWorkspace: (p: string) => boolean } }} [options={}]
   * @returns {Array<Diagnostic>}
   */
  check(docSnapshot, options = {}) {
    const content = docSnapshot?.content || '';
    const revision = docSnapshot?.revision ?? 0;
    const diagnostics = [];

    // 1. Process through pipeline to obtain canonical AST & metadata
    const ast = this.pipeline.process(docSnapshot);
    const { headings, links, images, codeBlocks } = ast;
    const workspaceResolver = options.workspaceResolver;

    // Rule 1: RULE_MISSING_H1
    const hasH1 = headings.some(h => h.level === 1);
    if (!hasH1 && content.trim().length > 0) {
      diagnostics.push({
        id: `diag-${RuleId.MISSING_H1}-1`,
        ruleId: RuleId.MISSING_H1,
        severity: DiagnosticSeverity.WARNING,
        message: 'Document is missing a primary top-level heading (# Title).',
        line: 1,
        column: 1,
        documentRevision: revision,
        target: '# Title',
        fixAvailable: true,
        fixDescription: 'Insert an H1 heading at the top of the document.',
        fixAction: 'INSERT_H1'
      });
    }

    // Rule 2: RULE_HEADING_LEVEL_SKIP
    let prevLevel = 0;
    for (const h of headings) {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        diagnostics.push({
          id: `diag-${RuleId.HEADING_LEVEL_SKIP}-${h.line}`,
          ruleId: RuleId.HEADING_LEVEL_SKIP,
          severity: DiagnosticSeverity.WARNING,
          message: `Heading hierarchy skipped from H${prevLevel} directly to H${h.level} without intermediate level.`,
          line: h.line,
          column: 1,
          documentRevision: revision,
          target: h.raw,
          fixAvailable: false
        });
      }
      prevLevel = h.level;
    }

    // Rule 3: RULE_UNCLOSED_CODEBLOCK
    for (const cb of codeBlocks) {
      if (!cb.isClosed) {
        diagnostics.push({
          id: `diag-${RuleId.UNCLOSED_CODEBLOCK}-${cb.line}`,
          ruleId: RuleId.UNCLOSED_CODEBLOCK,
          severity: DiagnosticSeverity.ERROR,
          message: `Fenced code block opened on line ${cb.line} is not closed.`,
          line: cb.line,
          column: 1,
          documentRevision: revision,
          target: '```',
          fixAvailable: true,
          fixDescription: 'Append closing code fence to end of document.',
          fixAction: 'CLOSE_CODEBLOCK'
        });
      }
    }

    // Prepare known anchor set from document headings
    const knownAnchors = new Set(headings.map(h => h.anchor));

    // Rule 4: RULE_BROKEN_INTERNAL_ANCHOR
    // Rule 5: RULE_BROKEN_LOCAL_LINK
    // Rule 8: RULE_EMPTY_LINK
    for (const link of links) {
      // Rule 8: Empty link text or href
      if (!link.text.trim() || !link.href.trim()) {
        diagnostics.push({
          id: `diag-${RuleId.EMPTY_LINK}-${link.line}`,
          ruleId: RuleId.EMPTY_LINK,
          severity: DiagnosticSeverity.WARNING,
          message: !link.text.trim()
            ? `Link with destination "${link.href}" is missing anchor text.`
            : `Link "[${link.text}]" has an empty destination.`,
          line: link.line,
          column: 1,
          documentRevision: revision,
          target: link.raw,
          fixAvailable: false
        });
        continue;
      }

      // Rule 4: Broken internal anchor
      if (link.isAnchor) {
        const targetAnchor = link.targetAnchor;
        if (!knownAnchors.has(targetAnchor)) {
          diagnostics.push({
            id: `diag-${RuleId.BROKEN_INTERNAL_ANCHOR}-${link.line}-${targetAnchor}`,
            ruleId: RuleId.BROKEN_INTERNAL_ANCHOR,
            severity: DiagnosticSeverity.ERROR,
            message: `Internal anchor link "#${targetAnchor}" does not match any heading in the document.`,
            line: link.line,
            column: 1,
            documentRevision: revision,
            target: link.raw,
            fixAvailable: false
          });
        }
      }

      // Rule 5: Broken local link / path traversal
      if (link.isLocal && !link.isAnchor) {
        const cleanHref = decodeURIComponent(link.href.split('#')[0]);

        // Security check: path traversal escape
        if (cleanHref.includes('../') || cleanHref.includes('..\\') || cleanHref.startsWith('/') || /^[a-zA-Z]:/.test(cleanHref)) {
          diagnostics.push({
            id: `diag-${RuleId.BROKEN_LOCAL_LINK}-${link.line}`,
            ruleId: RuleId.BROKEN_LOCAL_LINK,
            severity: DiagnosticSeverity.ERROR,
            message: `Local file link "${link.href}" attempts unsafe path traversal or absolute root escape outside workspace.`,
            line: link.line,
            column: 1,
            documentRevision: revision,
            target: link.raw,
            fixAvailable: false
          });
        } else if (workspaceResolver && typeof workspaceResolver.fileExists === 'function') {
          if (!workspaceResolver.fileExists(cleanHref)) {
            diagnostics.push({
              id: `diag-${RuleId.BROKEN_LOCAL_LINK}-${link.line}`,
              ruleId: RuleId.BROKEN_LOCAL_LINK,
              severity: DiagnosticSeverity.WARNING,
              message: `Linked local file "${cleanHref}" was not found in the workspace.`,
              line: link.line,
              column: 1,
              documentRevision: revision,
              target: link.raw,
              fixAvailable: false
            });
          }
        }
      }
    }

    // Rule 6: RULE_MISSING_LOCAL_IMAGE
    // Rule 7: RULE_MISSING_ALT_TEXT
    for (const img of images) {
      // Rule 7: Missing alt text
      if (!img.alt || !img.alt.trim()) {
        diagnostics.push({
          id: `diag-${RuleId.MISSING_ALT_TEXT}-${img.line}`,
          ruleId: RuleId.MISSING_ALT_TEXT,
          severity: DiagnosticSeverity.WARNING,
          message: `Image "${img.src}" is missing accessibility alt text.`,
          line: img.line,
          column: 1,
          documentRevision: revision,
          target: img.raw,
          fixAvailable: true,
          fixDescription: 'Add descriptive alt text for accessibility.',
          fixAction: 'ADD_ALT_TEXT'
        });
      }

      // Rule 6: Local image validation & path traversal
      if (img.isLocal) {
        const cleanSrc = decodeURIComponent(img.src);
        if (cleanSrc.includes('../') || cleanSrc.includes('..\\') || cleanSrc.startsWith('/') || /^[a-zA-Z]:/.test(cleanSrc)) {
          diagnostics.push({
            id: `diag-${RuleId.MISSING_LOCAL_IMAGE}-${img.line}`,
            ruleId: RuleId.MISSING_LOCAL_IMAGE,
            severity: DiagnosticSeverity.ERROR,
            message: `Image source "${img.src}" attempts unsafe path traversal outside workspace boundary.`,
            line: img.line,
            column: 1,
            documentRevision: revision,
            target: img.raw,
            fixAvailable: false
          });
        } else if (workspaceResolver && typeof workspaceResolver.fileExists === 'function') {
          if (!workspaceResolver.fileExists(cleanSrc)) {
            diagnostics.push({
              id: `diag-${RuleId.MISSING_LOCAL_IMAGE}-${img.line}`,
              ruleId: RuleId.MISSING_LOCAL_IMAGE,
              severity: DiagnosticSeverity.ERROR,
              message: `Local image file "${cleanSrc}" does not exist in workspace.`,
              line: img.line,
              column: 1,
              documentRevision: revision,
              target: img.raw,
              fixAvailable: false
            });
          }
        }
      }
    }

    // Rule 9: RULE_CORRUPT_TOC_MARKERS
    // Rule 10: RULE_STALE_TOC
    const region = this.toc.findTocRegion(content);
    if (!region.isWellFormed && (region.hasStart || region.hasEnd)) {
      diagnostics.push({
        id: `diag-${RuleId.CORRUPT_TOC_MARKERS}-1`,
        ruleId: RuleId.CORRUPT_TOC_MARKERS,
        severity: DiagnosticSeverity.ERROR,
        message: `Corrupt Table of Contents markers: ${region.error}.`,
        line: 1,
        column: 1,
        documentRevision: revision,
        target: '<!-- DEVSPIREHUB_TOC_* -->',
        fixAvailable: true,
        fixDescription: 'Regenerate clean Table of Contents markers.',
        fixAction: 'REPAIR_TOC_MARKERS'
      });
    } else if (region.isWellFormed && region.hasStart && region.hasEnd) {
      // Check if current TOC is stale compared to generated TOC
      const freshTocBlock = this.toc.buildTocMarkdown(headings, { minLevel: 2, maxLevel: 4 });
      const freshRegion = this.toc.findTocRegion(freshTocBlock);
      const expectedInner = freshRegion.innerContent || '';

      // Normalize line endings and trim for comparison
      const normActual = (region.innerContent || '').replace(/\r\n/g, '\n').trim();
      const normExpected = expectedInner.replace(/\r\n/g, '\n').trim();

      if (normActual !== normExpected) {
        // Calculate line number where TOC starts
        const linesBefore = content.slice(0, region.startIndex).split(/\r?\n/).length;
        diagnostics.push({
          id: `diag-${RuleId.STALE_TOC}-${linesBefore}`,
          ruleId: RuleId.STALE_TOC,
          severity: DiagnosticSeverity.WARNING,
          message: 'Table of Contents is out of date with current document headings.',
          line: linesBefore,
          column: 1,
          documentRevision: revision,
          target: '<!-- DEVSPIREHUB_TOC_START -->',
          fixAvailable: true,
          fixDescription: 'Update Table of Contents to match current headings.',
          fixAction: 'UPDATE_TOC'
        });
      }
    }

    return diagnostics;
  }

  /**
   * Summary of diagnostics by severity.
   * @param {Array<Diagnostic>} diagnostics
   * @returns {{ total: number, errors: number, warnings: number, info: number, hasErrors: boolean }}
   */
  summarize(diagnostics = []) {
    let errors = 0;
    let warnings = 0;
    let info = 0;

    for (const d of diagnostics) {
      if (d.severity === DiagnosticSeverity.ERROR) errors++;
      else if (d.severity === DiagnosticSeverity.WARNING) warnings++;
      else if (d.severity === DiagnosticSeverity.INFO) info++;
    }

    return {
      total: diagnostics.length,
      errors,
      warnings,
      info,
      hasErrors: errors > 0
    };
  }
}

export const qualityChecker = new QualityChecker();
