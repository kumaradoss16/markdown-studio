import { describe, it, expect } from 'vitest';
import { formatDetectionService } from '../../src/services/format-detection-service.js';

describe('FormatDetectionService (Module C)', () => {
  it('detects rich HTML containing headings, lists, tables, code blocks, and math', () => {
    const html = `
      <h1>System Architecture</h1>
      <p>Introductory statement with <a href="https://example.com">link</a>.</p>
      <ul>
        <li>Level 1
          <ul><li>Nested Level 2</li></ul>
        </li>
      </ul>
      <table><tr><th>Service</th><th>Status</th></tr><tr><td>API</td><td>Live</td></tr></table>
      <pre><code class="language-typescript">const ready = true;</code></pre>
      <span class="katex"><annotation encoding="application/x-tex">E = mc^2</annotation></span>
    `;

    const res = formatDetectionService.detect({
      formats: ['text/html', 'text/plain'],
      text: 'System Architecture...',
      html,
      images: [],
    });

    expect(res.sourceFormat).toBe('html');
    expect(res.detectedElements.headings).toBe(true);
    expect(res.detectedElements.lists).toBe(true);
    expect(res.detectedElements.nestedLists).toBe(true);
    expect(res.detectedElements.tables).toBe(true);
    expect(res.detectedElements.codeBlocks).toBe(true);
    expect(res.detectedElements.math).toBe(true);
    expect(res.detectedElements.links).toBe(true);
    expect(res.counts.headings).toBe(1);
    expect(res.counts.tables).toBe(1);
    expect(res.confidenceLevel).toBe('high');
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects unsupported structures like iframe and form and populates warnings', () => {
    const html = `
      <h2>Embedded Component</h2>
      <iframe src="https://untrusted.com/widget"></iframe>
      <form action="/submit"><input type="text" /></form>
    `;

    const res = formatDetectionService.detect({
      formats: ['text/html'],
      text: 'Embedded Component',
      html,
    });

    expect(res.unsupportedStructures).toContain('iframe');
    expect(res.unsupportedStructures).toContain('form');
    expect(res.warnings.some(w => w.includes('unsupported elements'))).toBe(true);
    expect(res.confidence).toBeLessThan(0.9);
  });

  it('detects raw Markdown text with high confidence', () => {
    const md = `
# Markdown Specification

- Rule 1
- Rule 2

\`\`\`python
def execute():
    pass
\`\`\`
    `;

    const res = formatDetectionService.detect({
      formats: ['text/plain'],
      text: md,
      markdown: md,
      html: null,
    });

    expect(res.sourceFormat).toBe('markdown');
    expect(res.detectedElements.headings).toBe(true);
    expect(res.detectedElements.lists).toBe(true);
    expect(res.detectedElements.codeBlocks).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('handles empty clipboard gracefully', () => {
    const res = formatDetectionService.detect(null);
    expect(res.sourceFormat).toBe('empty');
    expect(res.confidence).toBe(0);
    expect(res.confidenceLevel).toBe('low');
  });
});
