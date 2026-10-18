import { describe, it, expect } from 'vitest';
import { QualityChecker, RuleId, DiagnosticSeverity } from '../../src/services/quality-checker.js';
import { TOC_START_MARKER, TOC_END_MARKER } from '../../src/services/toc-generator.js';

describe('QualityChecker', () => {
  const checker = new QualityChecker();

  it('flags RULE_MISSING_H1 when document lacks top-level heading', () => {
    const md = '## Subheading\n\nParagraph text.';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.MISSING_H1);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.WARNING);
    expect(ruleDiag.fixAvailable).toBe(true);
    expect(ruleDiag.fixAction).toBe('INSERT_H1');
  });

  it('flags RULE_HEADING_LEVEL_SKIP when heading levels jump by > 1', () => {
    const md = '# Title\n\n#### Deep Nested without H2 or H3';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.HEADING_LEVEL_SKIP);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.line).toBe(3);
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('flags RULE_UNCLOSED_CODEBLOCK when code fence is never closed', () => {
    const md = '# Title\n\n```javascript\nconst a = 1;\n';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.UNCLOSED_CODEBLOCK);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(ruleDiag.line).toBe(3);
    expect(ruleDiag.fixAction).toBe('CLOSE_CODEBLOCK');
  });

  it('flags RULE_BROKEN_INTERNAL_ANCHOR when link target has no matching heading', () => {
    const md = '# Architecture\n\nSee [non-existent section](#non-existent) for details.';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.BROKEN_INTERNAL_ANCHOR);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(ruleDiag.message).toContain('non-existent');
  });

  it('allows valid internal anchors that match headings', () => {
    const md = '# Architecture\n\n## Sub Section\n\nJump to [Sub](#sub-section) and [Arch](#architecture).';
    const diags = checker.check({ content: md, revision: 1 });

    const brokenAnchors = diags.filter(d => d.ruleId === RuleId.BROKEN_INTERNAL_ANCHOR);
    expect(brokenAnchors).toHaveLength(0);
  });

  it('flags RULE_BROKEN_LOCAL_LINK on path traversal escape', () => {
    const md = '# Title\n\n[Secret Doc](../../../etc/passwd)';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.BROKEN_LOCAL_LINK);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(ruleDiag.message).toContain('unsafe path traversal');
  });

  it('uses workspaceResolver to check local link existence', () => {
    const md = '# Title\n\n[Guide](./docs/guide.md)\n[Missing](./docs/missing.md)';
    const mockResolver = {
      fileExists: (p) => p === './docs/guide.md' || p === 'docs/guide.md'
    };

    const diags = checker.check({ content: md, revision: 1 }, { workspaceResolver: mockResolver });
    const missing = diags.find(d => d.ruleId === RuleId.BROKEN_LOCAL_LINK && d.message.includes('missing.md'));
    expect(missing).toBeDefined();
    expect(missing.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('flags RULE_MISSING_LOCAL_IMAGE on path traversal and missing assets', () => {
    const md = '# Title\n\n![Diagram](../../secret/diagram.png)';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.MISSING_LOCAL_IMAGE);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('flags RULE_MISSING_ALT_TEXT for accessibility violations', () => {
    const md = '# Title\n\n![](assets/logo.png)';
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.MISSING_ALT_TEXT);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('flags RULE_EMPTY_LINK when text or destination is blank', () => {
    const md = '# Title\n\n[](https://google.com)\n[No URL]()';
    const diags = checker.check({ content: md, revision: 1 });

    const emptyDiags = diags.filter(d => d.ruleId === RuleId.EMPTY_LINK);
    expect(emptyDiags.length).toBeGreaterThanOrEqual(2);
  });

  it('flags RULE_CORRUPT_TOC_MARKERS when markers are unbalanced', () => {
    const md = `# Title\n\n${TOC_START_MARKER}\n- [Link](#link)\n\n## Section`;
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.CORRUPT_TOC_MARKERS);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('flags RULE_STALE_TOC when document headings do not match TOC content', () => {
    const md = `# Title\n\n${TOC_START_MARKER}\n- [Old Section](#old-section)\n${TOC_END_MARKER}\n\n## New Section One\n\n## New Section Two`;
    const diags = checker.check({ content: md, revision: 1 });

    const ruleDiag = diags.find(d => d.ruleId === RuleId.STALE_TOC);
    expect(ruleDiag).toBeDefined();
    expect(ruleDiag.severity).toBe(DiagnosticSeverity.WARNING);
    expect(ruleDiag.fixAction).toBe('UPDATE_TOC');
  });

  it('correctly summarizes diagnostic severities and reports error status', () => {
    const diags = [
      { severity: DiagnosticSeverity.ERROR },
      { severity: DiagnosticSeverity.WARNING },
      { severity: DiagnosticSeverity.WARNING },
      { severity: DiagnosticSeverity.INFO }
    ];
    const summary = checker.summarize(diags);

    expect(summary.total).toBe(4);
    expect(summary.errors).toBe(1);
    expect(summary.warnings).toBe(2);
    expect(summary.info).toBe(1);
    expect(summary.hasErrors).toBe(true);
  });
});
