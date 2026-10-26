import { describe, it, expect } from 'vitest';
import { htmlToMarkdownService } from '../../src/services/html-to-markdown-service.js';

describe('HtmlToMarkdownService (Slice 2)', () => {
  it('converts standard headings (H1-H6) into ATX style markdown', () => {
    const html = '<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('# Heading 1');
    expect(res.markdown).toContain('## Heading 2');
    expect(res.markdown).toContain('### Heading 3');
    expect(res.counts.headings).toBe(3);
  });

  it('converts ordered and unordered lists correctly', () => {
    const html = '<ul><li>Alpha</li><li>Beta</li></ul><ol><li>First</li><li>Second</li></ol>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toMatch(/-\s+Alpha/);
    expect(res.markdown).toMatch(/-\s+Beta/);
    expect(res.markdown).toMatch(/1\.\s+First/);
    expect(res.markdown).toMatch(/2\.\s+Second/);
    expect(res.counts.lists).toBe(2);
  });

  it('converts GFM tables and escapes internal cell pipes', () => {
    const html = `
      <table>
        <thead>
          <tr><th>Col 1</th><th>Col 2</th></tr>
        </thead>
        <tbody>
          <tr><td>Value A</td><td>Val | with | pipes</td></tr>
        </tbody>
      </table>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('| Col 1 | Col 2 |');
    expect(res.markdown).toContain('| --- | --- |');
    expect(res.markdown).toContain('Val \\| with \\| pipes');
    expect(res.counts.tables).toBe(1);
  });

  it('converts fenced code blocks and preserves syntax highlight language', () => {
    const html = '<pre><code class="language-python">def hello():\n    print("world")</code></pre>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('```python');
    expect(res.markdown).toContain('def hello():');
    expect(res.markdown).toContain('```');
    expect(res.counts.codeBlocks).toBe(1);
  });

  it('extracts language from data-language or lang- attributes', () => {
    const html = '<pre><code data-language="rust">fn main() {}</code></pre>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('```rust');
    expect(res.markdown).toContain('fn main() {}');
  });

  it('preserves mermaid diagram blocks as ```mermaid code fences', () => {
    const html = '<pre class="mermaid">flowchart TD\n  A --> B</pre>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('```mermaid');
    expect(res.markdown).toContain('flowchart TD');
    expect(res.counts.diagrams).toBeGreaterThanOrEqual(1);
  });

  it('converts blockquotes and links', () => {
    const html = '<blockquote><p>Quote note</p></blockquote><p><a href="https://example.com">Example Link</a></p>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('> Quote note');
    expect(res.markdown).toContain('[Example Link](https://example.com)');
    expect(res.counts.links).toBe(1);
  });

  it('collects images into queue and emits placeholder tokens', () => {
    const html = '<p><img src="https://example.com/photo.png" alt="Sample Photo" title="Hover" /></p>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.images.length).toBe(1);
    expect(res.images[0].src).toBe('https://example.com/photo.png');
    expect(res.images[0].alt).toBe('Sample Photo');
    expect(res.markdown).toContain('![Sample Photo](__MARKFORGE_IMG_0__ "Hover")');
    expect(res.counts.images).toBe(1);
  });

  it('converts <hr> to markdown rule ---', () => {
    const html = '<p>Top</p><hr><p>Bottom</p>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('---');
  });

  it('unwraps unsupported or custom tags while preserving text and inline styling', () => {
    const html = '<custom-card><div class="wrapper"><p>Preserved text with <strong>bold</strong></p></div></custom-card>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('Preserved text with **bold**');
  });

  it('gracefully handles empty or malformed HTML', () => {
    const emptyRes = htmlToMarkdownService.convert('');
    expect(emptyRes.markdown).toBe('');
    expect(emptyRes.warnings.length).toBeGreaterThan(0);

    const malformed = '<p>Unclosed paragraph <b>bold';
    const malformedRes = htmlToMarkdownService.convert(malformed);
    expect(malformedRes.markdown).toContain('Unclosed paragraph **bold**');
  });
});
