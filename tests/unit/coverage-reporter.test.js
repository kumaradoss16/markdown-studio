import { describe, it, expect } from 'vitest';
import { CoverageReporter } from '../../src/services/coverage-reporter.js';
import { RuleId, DiagnosticSeverity } from '../../src/services/quality-checker.js';

describe('CoverageReporter (Release 0.7)', () => {
  const reporter = new CoverageReporter();

  it('detects missing required documentation files', () => {
    const docGraph = new Map([
      ['README.md', { content: '# Readme', headings: [{ level: 1, text: 'Readme' }], links: [] }]
    ]);
    const workspaceFiles = new Set(['README.md']);
    const config = {
      requiredFiles: ['README.md', 'CONTRIBUTING.md', 'LICENSE.md']
    };

    const { coverage, diagnostics } = reporter.evaluateCoverage(docGraph, workspaceFiles, config);

    expect(coverage.requiredFiles.total).toBe(3);
    expect(coverage.requiredFiles.matched).toBe(1);
    expect(coverage.requiredFiles.missing).toEqual(['CONTRIBUTING.md', 'LICENSE.md']);

    const missingDiags = diagnostics.filter(d => d.ruleId === RuleId.MISSING_REQUIRED_DOC);
    expect(missingDiags).toHaveLength(2);
    expect(missingDiags[0].severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('detects uncovered required heading sections', () => {
    const docGraph = new Map([
      ['README.md', {
        content: '# Title\n\n## Installation',
        headings: [
          { level: 1, text: 'Title' },
          { level: 2, text: 'Installation' }
        ],
        links: []
      }]
    ]);
    const workspaceFiles = new Set(['README.md']);
    const config = {
      requiredSections: {
        'README.md': ['Installation', 'Usage', 'API Reference']
      }
    };

    const { coverage, diagnostics } = reporter.evaluateCoverage(docGraph, workspaceFiles, config);

    expect(coverage.requiredSections.total).toBe(3);
    expect(coverage.requiredSections.matched).toBe(1);
    expect(coverage.requiredSections.missing).toHaveLength(2);

    const sectionDiags = diagnostics.filter(d => d.ruleId === RuleId.UNCOVERED_REQUIRED_SECTION);
    expect(sectionDiags).toHaveLength(2);
    expect(sectionDiags[0].message).toContain('Usage');
  });

  it('identifies orphan documents with 0 inbound links', () => {
    const docGraph = new Map([
      ['README.md', {
        content: '# Readme\n[Guide](docs/guide.md)',
        headings: [{ level: 1, text: 'Readme' }],
        links: [{ isLocal: true, isAnchor: false, href: 'docs/guide.md' }]
      }],
      ['docs/guide.md', {
        content: '# Guide',
        headings: [{ level: 1, text: 'Guide' }],
        links: []
      }],
      ['docs/isolated.md', {
        content: '# Isolated Note',
        headings: [{ level: 1, text: 'Isolated Note' }],
        links: []
      }]
    ]);
    const workspaceFiles = new Set(['README.md', 'docs/guide.md', 'docs/isolated.md']);
    const config = { flagOrphanDocs: true };

    const { coverage, diagnostics } = reporter.evaluateCoverage(docGraph, workspaceFiles, config, ['docs/guide.md']);

    expect(coverage.orphanDocs).toContain('docs/isolated.md');
    expect(coverage.orphanDocs).not.toContain('docs/guide.md');

    const orphanDiag = diagnostics.find(d => d.ruleId === RuleId.ORPHAN_DOCUMENT && d.file === 'docs/isolated.md');
    expect(orphanDiag).toBeDefined();
    expect(orphanDiag.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('identifies empty documents and missing H1 headings', () => {
    const docGraph = new Map([
      ['empty.md', {
        content: '   \n   ',
        headings: [],
        links: []
      }],
      ['no-h1.md', {
        content: '## Subtitle without H1',
        headings: [{ level: 2, text: 'Subtitle without H1' }],
        links: []
      }]
    ]);
    const workspaceFiles = new Set(['empty.md', 'no-h1.md']);

    const { coverage } = reporter.evaluateCoverage(docGraph, workspaceFiles, {});

    expect(coverage.emptyDocs).toContain('empty.md');
    expect(coverage.missingH1Docs).toContain('no-h1.md');
  });
});
