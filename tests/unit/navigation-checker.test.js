import { describe, it, expect } from 'vitest';
import { NavigationChecker } from '../../src/services/navigation-checker.js';
import { RuleId, DiagnosticSeverity } from '../../src/services/quality-checker.js';

describe('NavigationChecker (Release 0.7)', () => {
  const checker = new NavigationChecker();

  it('parses markdown list items containing links', () => {
    const summaryMd = `
# Summary
* [Introduction](README.md)
* [Getting Started](docs/quickstart.md)
  * [Installation](docs/install.md)
1. [Numbered Item](docs/numbered.md)
- [Dash Item](docs/dash.md)
    `;

    const items = checker.parseNavItems(summaryMd);
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({
      title: 'Introduction',
      href: 'README.md',
      line: 3,
      raw: '* [Introduction](README.md)'
    });
  });

  it('finds declared and default nav sources', () => {
    const files = ['README.md', 'SUMMARY.md', 'docs/guide.md'];
    const found = checker.findNavSources(files);
    expect(found).toEqual(['SUMMARY.md']);
  });

  it('detects dangling nav entries and duplicate references', () => {
    const summaryContent = `
# Summary
* [Home](README.md)
* [Missing Page](docs/nonexistent.md)
* [Duplicate Home](README.md)
    `;

    const navContents = new Map([
      ['SUMMARY.md', summaryContent]
    ]);
    const workspaceFiles = new Set(['SUMMARY.md', 'README.md', 'docs/orphan.md']);
    const allMarkdownDocs = ['SUMMARY.md', 'README.md', 'docs/orphan.md'];

    const result = checker.checkNavigation(navContents, workspaceFiles, allMarkdownDocs, { flagUnlistedPages: true });

    expect(result.summary.totalNavItems).toBe(3);
    expect(result.summary.brokenNavItems).toBe(1);
    expect(result.summary.duplicateNavItems).toBe(1);
    expect(result.summary.unlistedDocs).toEqual(['docs/orphan.md']);

    const dangling = result.diagnostics.find(d => d.ruleId === RuleId.DANGLING_NAV_ENTRY);
    expect(dangling).toBeDefined();
    expect(dangling.severity).toBe(DiagnosticSeverity.ERROR);
    expect(dangling.message).toContain('nonexistent.md');

    const duplicate = result.diagnostics.find(d => d.ruleId === RuleId.DUPLICATE_NAV_ENTRY);
    expect(duplicate).toBeDefined();
    expect(duplicate.severity).toBe(DiagnosticSeverity.WARNING);
    expect(duplicate.message).toContain('Duplicate navigation link');

    const unlisted = result.diagnostics.find(d => d.ruleId === RuleId.UNLISTED_NAV_PAGE);
    expect(unlisted).toBeDefined();
    expect(unlisted.file).toBe('docs/orphan.md');
  });
});
