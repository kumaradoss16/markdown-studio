import { RuleId, DiagnosticSeverity } from './quality-checker.js';

/**
 * Evaluates documentation coverage across files, sections, orphans, and heading structures.
 */
export class CoverageReporter {
  /**
   * Generates a comprehensive coverage report.
   * @param {Map<string, { content: string, headings: Array<any>, links: Array<any> }>} docGraph
   * @param {Set<string>|Array<string>} allWorkspaceFiles
   * @param {Object} [coverageConfig={}]
   * @param {Array<string>} [navReferencedDocs=[]]
   * @returns {{ coverage: Object, diagnostics: Array<Object> }}
   */
  evaluateCoverage(docGraph, allWorkspaceFiles, coverageConfig = {}, navReferencedDocs = []) {
    const fileSet = allWorkspaceFiles instanceof Set ? allWorkspaceFiles : new Set(allWorkspaceFiles);
    const diagnostics = [];

    const requiredFilesConfig = Array.isArray(coverageConfig.requiredFiles) ? coverageConfig.requiredFiles : [];
    const requiredSectionsConfig = coverageConfig.requiredSections && typeof coverageConfig.requiredSections === 'object'
      ? coverageConfig.requiredSections
      : {};
    const flagOrphanDocs = !!coverageConfig.flagOrphanDocs;

    // 1. Required Files
    const matchedRequiredFiles = [];
    const missingRequiredFiles = [];

    for (const reqFile of requiredFilesConfig) {
      const normalized = reqFile.replace(/\\/g, '/').replace(/^\.\//, '');
      const found = fileSet.has(normalized) || Array.from(fileSet).some(f => f.toLowerCase() === normalized.toLowerCase());
      if (found) {
        matchedRequiredFiles.push(normalized);
      } else {
        missingRequiredFiles.push(normalized);
        diagnostics.push({
          id: `diag-${RuleId.MISSING_REQUIRED_DOC}-${normalized}`,
          ruleId: RuleId.MISSING_REQUIRED_DOC,
          severity: DiagnosticSeverity.ERROR,
          file: normalized,
          line: 1,
          column: 1,
          message: `Required documentation file "${normalized}" is missing from the workspace.`,
          target: normalized,
          fixAvailable: false
        });
      }
    }

    // 2. Required Heading Sections
    let totalSections = 0;
    let matchedSections = 0;
    const missingSections = [];

    for (const [targetFile, sections] of Object.entries(requiredSectionsConfig)) {
      const normalizedTarget = targetFile.replace(/\\/g, '/').replace(/^\.\//, '');
      const docData = docGraph.get(normalizedTarget) || Array.from(docGraph.entries()).find(([k]) => k.toLowerCase() === normalizedTarget.toLowerCase())?.[1];

      if (!docData) {
        // Target file missing (already flagged by requiredFiles if configured)
        for (const sec of sections) {
          totalSections++;
          missingSections.push({ file: normalizedTarget, section: sec });
          diagnostics.push({
            id: `diag-${RuleId.UNCOVERED_REQUIRED_SECTION}-${normalizedTarget}-${sec}`,
            ruleId: RuleId.UNCOVERED_REQUIRED_SECTION,
            severity: DiagnosticSeverity.ERROR,
            file: normalizedTarget,
            line: 1,
            column: 1,
            message: `Required section "${sec}" could not be verified because "${normalizedTarget}" does not exist.`,
            target: sec,
            fixAvailable: false
          });
        }
        continue;
      }

      const headingTexts = (docData.headings || []).map(h => (h.text || '').trim().toLowerCase());

      for (const sec of sections) {
        totalSections++;
        const targetTitleLower = sec.trim().toLowerCase();
        const found = headingTexts.some(ht => ht === targetTitleLower || ht.includes(targetTitleLower));

        if (found) {
          matchedSections++;
        } else {
          missingSections.push({ file: normalizedTarget, section: sec });
          diagnostics.push({
            id: `diag-${RuleId.UNCOVERED_REQUIRED_SECTION}-${normalizedTarget}-${sec}`,
            ruleId: RuleId.UNCOVERED_REQUIRED_SECTION,
            severity: DiagnosticSeverity.ERROR,
            file: normalizedTarget,
            line: 1,
            column: 1,
            message: `Required section "${sec}" is missing from "${normalizedTarget}".`,
            target: sec,
            fixAvailable: false
          });
        }
      }
    }

    // 3. Compute Inbound Link Counts & Identify Orphan Documents
    const inboundCounts = new Map();
    for (const docPath of docGraph.keys()) {
      inboundCounts.set(docPath, 0);
    }

    // Tally links from documents
    for (const [sourcePath, docData] of docGraph.entries()) {
      for (const link of docData.links || []) {
        if (!link.isLocal || link.isAnchor) continue;
        const [cleanPath] = decodeURIComponent(link.href).split('#');
        // Simple relative resolution
        let target = null;
        if (docGraph.has(cleanPath)) {
          target = cleanPath;
        } else {
          const parts = sourcePath.split('/');
          parts.pop();
          const candidate = parts.length > 0 ? `${parts.join('/')}/${cleanPath}` : cleanPath;
          if (docGraph.has(candidate)) {
            target = candidate;
          }
        }
        if (target && target !== sourcePath && inboundCounts.has(target)) {
          inboundCounts.set(target, inboundCounts.get(target) + 1);
        }
      }
    }

    // Tally navigation references
    for (const navDoc of navReferencedDocs) {
      if (inboundCounts.has(navDoc)) {
        inboundCounts.set(navDoc, inboundCounts.get(navDoc) + 1);
      }
    }

    // Detect orphans (exclude top-level README / index / SUMMARY)
    const orphanDocs = [];
    for (const [docPath, count] of inboundCounts.entries()) {
      const lower = docPath.toLowerCase();
      const isRootEntry = lower === 'readme.md' || lower === 'index.md' || lower === 'summary.md' || lower === 'nav.md';
      if (count === 0 && !isRootEntry) {
        orphanDocs.push(docPath);
        if (flagOrphanDocs) {
          diagnostics.push({
            id: `diag-${RuleId.ORPHAN_DOCUMENT}-${docPath}-1`,
            ruleId: RuleId.ORPHAN_DOCUMENT,
            severity: DiagnosticSeverity.WARNING,
            file: docPath,
            line: 1,
            column: 1,
            message: `Document "${docPath}" has 0 inbound links or navigation references (Orphan Document).`,
            target: docPath,
            fixAvailable: false
          });
        }
      }
    }

    // 4. Detect Empty Documents & Missing H1s
    const emptyDocs = [];
    const missingH1Docs = [];

    for (const [docPath, docData] of docGraph.entries()) {
      const content = docData.content || '';
      if (content.trim().length === 0) {
        emptyDocs.push(docPath);
      } else {
        const hasH1 = (docData.headings || []).some(h => h.level === 1);
        if (!hasH1) {
          missingH1Docs.push(docPath);
        }
      }
    }

    return {
      coverage: {
        requiredFiles: {
          total: requiredFilesConfig.length,
          matched: matchedRequiredFiles.length,
          missing: missingRequiredFiles
        },
        requiredSections: {
          total: totalSections,
          matched: matchedSections,
          missing: missingSections
        },
        orphanDocs: orphanDocs.sort(),
        emptyDocs: emptyDocs.sort(),
        missingH1Docs: missingH1Docs.sort()
      },
      diagnostics
    };
  }
}

export const coverageReporter = new CoverageReporter();
