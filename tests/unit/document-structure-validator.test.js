import { describe, it, expect } from 'vitest';
import { documentStructureValidator } from '../../src/services/document-structure-validator.js';

describe('DocumentStructureValidator (Module F)', () => {
  it('detects skipped heading levels (e.g. H1 followed directly by H3)', () => {
    const md = `
# Main Header

Paragraph text.

### Skipped Sub-header

More text.
    `;

    const res = documentStructureValidator.validate(md);
    expect(res.isValid).toBe(true); // Warnings do not invalidate document
    const headingIssue = res.issues.find(i => i.type === 'heading-hierarchy');
    expect(headingIssue).toBeDefined();
    expect(headingIssue.severity).toBe('warning');
    expect(headingIssue.message).toContain('Skipped heading level from H1 to H3');
  });

  it('detects unclosed code fences as errors', () => {
    const md = `
# Code Example

\`\`\`typescript
const a = 10;
const b = 20;
// Note: no closing fence
    `;

    const res = documentStructureValidator.validate(md);
    expect(res.isValid).toBe(false);
    const fenceIssue = res.issues.find(i => i.type === 'code-fence-unbalanced');
    expect(fenceIssue).toBeDefined();
    expect(fenceIssue.severity).toBe('error');
    expect(fenceIssue.message).toContain('Unclosed code fence block');
  });

  it('flags code blocks missing language identifiers', () => {
    const md = `
\`\`\`
echo "no language"
\`\`\`
    `;

    const res = documentStructureValidator.validate(md);
    const langIssue = res.issues.find(i => i.type === 'missing-code-language');
    expect(langIssue).toBeDefined();
    expect(langIssue.severity).toBe('info');
  });

  it('detects table column count mismatches across rows', () => {
    const md = `
| Col A | Col B | Col C |
| --- | --- | --- |
| Val 1 | Val 2 |
    `;

    const res = documentStructureValidator.validate(md);
    const tableIssue = res.issues.find(i => i.type === 'table-column-mismatch');
    expect(tableIssue).toBeDefined();
    expect(tableIssue.severity).toBe('warning');
    expect(tableIssue.message).toContain('header has 3 columns');
  });

  it('detects unclosed links and unpaired bold markers', () => {
    const md = `
Check out this [broken link(https://example.com)
Here is an **unclosed bold marker
    `;

    const res = documentStructureValidator.validate(md);
    expect(res.issues.some(i => i.type === 'broken-link')).toBe(true);
    expect(res.issues.some(i => i.type === 'unclosed-formatting')).toBe(true);
  });

  it('detects dangerous HTML fragments like <script>', () => {
    const md = `
# Clean Document

<script>alert('XSS')</script>
    `;

    const res = documentStructureValidator.validate(md);
    expect(res.isValid).toBe(false);
    expect(res.issues.some(i => i.type === 'unexpected-html')).toBe(true);
  });
});
