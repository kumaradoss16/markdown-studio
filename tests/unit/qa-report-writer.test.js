import { describe, it, expect } from 'vitest';
import { QaReportWriter, REPORT_VERSION, STUDIO_VERSION } from '../../src/services/qa-report-writer.js';
import { DiagnosticSeverity } from '../../src/services/quality-checker.js';

describe('QaReportWriter (Release 0.7)', () => {
  const writer = new QaReportWriter();

  it('sorts diagnostics deterministically by file, line, col, ruleId (Invariant 3)', () => {
    const unsorted = [
      { file: 'b.md', line: 10, column: 1, ruleId: 'RULE_B' },
      { file: 'a.md', line: 20, column: 1, ruleId: 'RULE_A' },
      { file: 'a.md', line: 5, column: 3, ruleId: 'RULE_Z' },
      { file: 'a.md', line: 5, column: 1, ruleId: 'RULE_Y' },
      { file: 'a.md', line: 5, column: 1, ruleId: 'RULE_X' }
    ];

    const sorted = writer.sortDiagnostics(unsorted);
    expect(sorted[0]).toEqual({ file: 'a.md', line: 5, column: 1, ruleId: 'RULE_X' });
    expect(sorted[1]).toEqual({ file: 'a.md', line: 5, column: 1, ruleId: 'RULE_Y' });
    expect(sorted[2]).toEqual({ file: 'a.md', line: 5, column: 3, ruleId: 'RULE_Z' });
    expect(sorted[3]).toEqual({ file: 'a.md', line: 20, column: 1, ruleId: 'RULE_A' });
    expect(sorted[4]).toEqual({ file: 'b.md', line: 10, column: 1, ruleId: 'RULE_B' });
  });

  it('computes honest exit codes based on failOn threshold', () => {
    expect(writer.computeOutcome({ errors: 0, warnings: 0 }, 'error')).toEqual({ passed: true, exitCode: 0 });
    expect(writer.computeOutcome({ errors: 1, warnings: 0 }, 'error')).toEqual({ passed: false, exitCode: 1 });
    expect(writer.computeOutcome({ errors: 0, warnings: 2 }, 'error')).toEqual({ passed: true, exitCode: 0 });
    expect(writer.computeOutcome({ errors: 0, warnings: 2 }, 'warning')).toEqual({ passed: false, exitCode: 1 });
    expect(writer.computeOutcome({ errors: 0, warnings: 0 }, 'error', true)).toEqual({ passed: false, exitCode: 2 });
  });

  it('builds structured qa-report-v1 JSON conforming to schema', () => {
    const runResult = {
      workspaceRoot: 'docs',
      profile: { name: 'docs-repo' },
      failOn: 'error',
      summary: { filesScanned: 10, totalDiagnostics: 1, errors: 0, warnings: 1, info: 0 },
      diagnostics: [{
        file: 'guide.md',
        line: 1,
        column: 1,
        ruleId: 'RULE_MISSING_H1',
        severity: DiagnosticSeverity.WARNING,
        message: 'Missing H1'
      }]
    };

    const report = writer.buildJsonReport(runResult);
    expect(report.reportVersion).toBe(REPORT_VERSION);
    expect(report.studioVersion).toBe(STUDIO_VERSION);
    expect(report.profile).toBe('docs-repo');
    expect(report.passed).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.diagnostics).toHaveLength(1);
  });

  it('formats clean GitHub annotations', () => {
    const diags = [
      {
        file: 'docs/guide.md',
        line: 12,
        column: 4,
        ruleId: 'RULE_BROKEN_LOCAL_LINK',
        severity: DiagnosticSeverity.ERROR,
        message: 'Broken link'
      }
    ];

    const annotations = writer.formatGitHubAnnotations(diags);
    expect(annotations).toBe('::error file=docs/guide.md,line=12,col=4::[RULE_BROKEN_LOCAL_LINK] Broken link');
  });
});
