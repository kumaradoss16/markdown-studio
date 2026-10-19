import { DiagnosticSeverity } from './quality-checker.js';

export const REPORT_VERSION = '1.0.0';
export const STUDIO_VERSION = '0.7.0';

/**
 * Deterministic Report Writer for Documentation QA.
 * Supports JSON (qa-report-v1), Markdown, terminal text, and GitHub Actions annotations.
 */
export class QaReportWriter {
  /**
   * Sorts diagnostics deterministically by file ASC, line ASC, column ASC, ruleId ASC.
   * @param {Array<Object>} diagnostics
   * @returns {Array<Object>}
   */
  sortDiagnostics(diagnostics = []) {
    return [...diagnostics].sort((a, b) => {
      const fileCompare = (a.file || '').localeCompare(b.file || '');
      if (fileCompare !== 0) return fileCompare;

      const lineA = a.line || 0;
      const lineB = b.line || 0;
      if (lineA !== lineB) return lineA - lineB;

      const colA = a.column || 0;
      const colB = b.column || 0;
      if (colA !== colB) return colA - colB;

      return (a.ruleId || '').localeCompare(b.ruleId || '');
    });
  }

  /**
   * Computes pass/fail status and honest exit code based on failOn policy.
   * @param {{ errors: number, warnings: number }} summary
   * @param {string} [failOn='error']
   * @param {boolean} [fatalError=false]
   * @returns {{ passed: boolean, exitCode: number }}
   */
  computeOutcome(summary, failOn = 'error', fatalError = false) {
    if (fatalError) {
      return { passed: false, exitCode: 2 };
    }

    const errors = summary.errors || 0;
    const warnings = summary.warnings || 0;

    let passed = true;
    if (failOn === 'warning') {
      passed = errors === 0 && warnings === 0;
    } else {
      // default 'error'
      passed = errors === 0;
    }

    return {
      passed,
      exitCode: passed ? 0 : 1
    };
  }

  /**
   * Generates structured qa-report-v1 JSON object.
   * @param {Object} runResult
   * @returns {Object}
   */
  buildJsonReport(runResult) {
    const sortedDiags = this.sortDiagnostics(runResult.diagnostics || []);
    const summary = runResult.summary || {
      filesScanned: 0,
      totalDiagnostics: sortedDiags.length,
      errors: sortedDiags.filter(d => d.severity === DiagnosticSeverity.ERROR).length,
      warnings: sortedDiags.filter(d => d.severity === DiagnosticSeverity.WARNING).length,
      info: sortedDiags.filter(d => d.severity === DiagnosticSeverity.INFO).length
    };

    const failOn = runResult.failOn || runResult.profile?.failOn || 'error';
    const { passed, exitCode } = this.computeOutcome(summary, failOn, !!runResult.fatalError);

    return {
      reportVersion: REPORT_VERSION,
      studioVersion: STUDIO_VERSION,
      timestamp: runResult.timestamp || new Date().toISOString(),
      workspaceRoot: runResult.workspaceRoot || '.',
      profile: runResult.profile?.name || runResult.profileName || 'default',
      failOn,
      passed,
      exitCode,
      summary,
      coverage: runResult.coverage || {
        requiredFiles: { total: 0, matched: 0, missing: [] },
        requiredSections: { total: 0, matched: 0, missing: [] },
        orphanDocs: [],
        emptyDocs: [],
        missingH1Docs: []
      },
      navigation: runResult.navigation || {
        sourcesChecked: [],
        totalNavItems: 0,
        brokenNavItems: 0,
        duplicateNavItems: 0,
        unlistedDocs: []
      },
      diagnostics: sortedDiags
    };
  }

  /**
   * Formats GitHub-flavored Markdown report.
   * @param {Object} runResult
   * @returns {string}
   */
  formatMarkdown(runResult) {
    const json = this.buildJsonReport(runResult);
    const { summary, coverage, navigation, diagnostics, passed, profile, workspaceRoot } = json;

    const statusBadge = passed ? '✅ **PASSED**' : '❌ **FAILED**';

    let md = `# MarkForge Documentation QA Report\n\n`;
    md += `- **Status:** ${statusBadge}\n`;
    md += `- **Profile:** \`${profile}\`\n`;
    md += `- **Workspace Root:** \`${workspaceRoot}\`\n`;
    md += `- **Timestamp:** ${json.timestamp}\n\n`;

    md += `## Summary Metrics\n\n`;
    md += `| Metric | Count |\n`;
    md += `|:---|---:|\n`;
    md += `| Files Scanned | ${summary.filesScanned} |\n`;
    md += `| Total Diagnostics | ${summary.totalDiagnostics} |\n`;
    md += `| 🛑 Errors | ${summary.errors} |\n`;
    md += `| ⚠️ Warnings | ${summary.warnings} |\n`;
    md += `| ℹ️ Info | ${summary.info} |\n\n`;

    // Coverage section
    md += `## Documentation Coverage\n\n`;
    md += `- **Required Files:** ${coverage.requiredFiles.matched} / ${coverage.requiredFiles.total} matched\n`;
    if (coverage.requiredFiles.missing.length > 0) {
      md += `  - Missing: ${coverage.requiredFiles.missing.map(f => `\`${f}\``).join(', ')}\n`;
    }
    md += `- **Required Sections:** ${coverage.requiredSections.matched} / ${coverage.requiredSections.total} matched\n`;
    if (coverage.requiredSections.missing.length > 0) {
      for (const m of coverage.requiredSections.missing) {
        md += `  - Missing section \`${m.section}\` in \`${m.file}\`\n`;
      }
    }
    md += `- **Orphan Documents:** ${coverage.orphanDocs.length}\n`;
    if (coverage.orphanDocs.length > 0) {
      md += `  - ${coverage.orphanDocs.map(d => `\`${d}\``).join(', ')}\n`;
    }
    md += `- **Empty Documents:** ${coverage.emptyDocs.length}\n\n`;

    // Navigation section
    md += `## Navigation Verification\n\n`;
    md += `- **Sources Checked:** ${navigation.sourcesChecked.length > 0 ? navigation.sourcesChecked.map(s => `\`${s}\``).join(', ') : 'None'}\n`;
    md += `- **Total Nav Items:** ${navigation.totalNavItems}\n`;
    md += `- **Broken Nav Items:** ${navigation.brokenNavItems}\n`;
    md += `- **Duplicate Nav Items:** ${navigation.duplicateNavItems}\n\n`;

    // Diagnostics findings
    md += `## Findings (${diagnostics.length})\n\n`;
    if (diagnostics.length === 0) {
      md += `_No issues found. Workspace documentation passed all configured rules!_\n`;
    } else {
      md += `| Severity | Rule ID | File | Line | Message |\n`;
      md += `|:---|:---|:---|---:|:---|\n`;
      for (const d of diagnostics) {
        const sevIcon = d.severity === 'ERROR' ? '🛑 ERROR' : d.severity === 'WARNING' ? '⚠️ WARN' : 'ℹ️ INFO';
        const file = d.file || '(workspace)';
        const line = d.line || 1;
        const msg = (d.message || '').replace(/\|/g, '\\|');
        md += `| ${sevIcon} | \`${d.ruleId}\` | \`${file}\` | ${line} | ${msg} |\n`;
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Formats human-readable console text report.
   * @param {Object} runResult
   * @returns {string}
   */
  formatText(runResult) {
    const json = this.buildJsonReport(runResult);
    const { summary, diagnostics, passed, profile, exitCode } = json;

    const lines = [];
    lines.push(`=======================================================`);
    lines.push(` MarkForge Documentation QA (Profile: ${profile})`);
    lines.push(`=======================================================`);
    lines.push(`Files Scanned: ${summary.filesScanned}`);
    lines.push(`Errors: ${summary.errors} | Warnings: ${summary.warnings} | Info: ${summary.info}`);
    lines.push(`-------------------------------------------------------`);

    if (diagnostics.length === 0) {
      lines.push(`✓ No issues found. All documentation rules passed.`);
    } else {
      for (const d of diagnostics) {
        const file = d.file || '(workspace)';
        const line = d.line ? `:${d.line}` : '';
        const prefix = d.severity === 'ERROR' ? '[ERROR]' : d.severity === 'WARNING' ? '[WARN]' : '[INFO]';
        lines.push(`${prefix} ${file}${line} - [${d.ruleId}] ${d.message}`);
      }
    }

    lines.push(`-------------------------------------------------------`);
    lines.push(`Result: ${passed ? 'PASSED' : 'FAILED'} (Exit code ${exitCode})`);
    lines.push(`=======================================================`);

    return lines.join('\n');
  }

  /**
   * Formats GitHub Actions workflow annotations.
   * @param {Array<Object>} diagnostics
   * @returns {string}
   */
  formatGitHubAnnotations(diagnostics = []) {
    const sorted = this.sortDiagnostics(diagnostics);
    const lines = [];
    for (const d of sorted) {
      const type = d.severity === DiagnosticSeverity.ERROR ? 'error' : 'warning';
      const file = d.file || '';
      const line = d.line || 1;
      const col = d.column || 1;
      const msg = (d.message || '').replace(/\r?\n/g, ' ');
      lines.push(`::${type} file=${file},line=${line},col=${col}::[${d.ruleId}] ${msg}`);
    }
    return lines.join('\n');
  }
}

export const qaReportWriter = new QaReportWriter();
