import { describe, it, expect } from 'vitest';
import { ExportEngine, ExportFormat } from '../../src/services/export-engine.js';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';
import { qualityChecker } from '../../src/services/quality-checker.js';

describe('ExportEngine Integration', () => {
  const engine = new ExportEngine(markdownPipeline, qualityChecker);

  it('blocks export when document has blocking diagnostic errors', async () => {
    // Unclosed code block is an ERROR severity
    const brokenDoc = {
      id: 'doc-broken',
      name: 'broken.md',
      content: '# Title\n\n```typescript\nconst x = 1;\n',
      revision: 1
    };

    const res = await engine.exportDocument(brokenDoc, { format: ExportFormat.HTML });
    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.error).toContain('Pre-flight validation failed');
    expect(res.summary.errors).toBeGreaterThan(0);
  });

  it('permits export with force flag even when errors exist', async () => {
    const brokenDoc = {
      id: 'doc-forced',
      name: 'forced.md',
      content: '# Title\n\n```typescript\nconst x = 1;\n',
      revision: 1
    };

    const res = await engine.exportDocument(brokenDoc, { format: ExportFormat.HTML, force: true });
    expect(res.success).toBe(true);
    expect(res.output).toContain('<!DOCTYPE html>');
  });

  it('exports clean document to standalone HTML with deterministic heading IDs', async () => {
    const cleanDoc = {
      id: 'doc-clean',
      name: 'guide.md',
      content: '# User Guide\n\n## Quick Start\n\nWelcome to Markdown Studio.',
      revision: 1
    };

    const res = await engine.exportDocument(cleanDoc, { format: ExportFormat.HTML, theme: 'dark' });
    expect(res.success).toBe(true);
    expect(res.output).toContain('<!DOCTYPE html>');
    expect(res.output).toContain('<title>User Guide</title>');
    expect(res.output).toContain('<h1 id="user-guide">User Guide</h1>');
    expect(res.output).toContain('<h2 id="quick-start">Quick Start</h2>');
    expect(res.output).toContain('@media print');
  });

  it('embeds base64 local assets into standalone HTML', async () => {
    const assetDoc = {
      id: 'doc-asset',
      name: 'architecture.md',
      content: '# Architecture\n\n![System Diagram](diagram.png)\n',
      revision: 1
    };

    const fakeBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const res = await engine.exportDocument(assetDoc, {
      format: ExportFormat.HTML,
      assetMap: {
        'diagram.png': fakeBase64
      }
    });

    expect(res.success).toBe(true);
    expect(res.output).toContain(`src="${fakeBase64}"`);
  });

  it('guarantees source immutability during export process (Invariant 1)', async () => {
    const originalContent = '# Preserved Title\n\nParagraph with **formatting**.\n';
    const doc = {
      id: 'doc-preserve',
      name: 'doc.md',
      content: originalContent,
      revision: 5
    };

    await engine.exportDocument(doc, { format: ExportFormat.HTML });
    expect(doc.content).toBe(originalContent);
    expect(doc.revision).toBe(5);
  });

  it('syncs selected accent color with export output and enforces clean print margins', async () => {
    const doc = {
      id: 'doc-accent-test',
      name: 'accent-report.md',
      content: '# Accent Test\n\n> Important quote callout\n',
      revision: 1
    };

    const res = await engine.exportDocument(doc, {
      format: ExportFormat.HTML,
      accent: 'orange'
    });

    expect(res.success).toBe(true);
    expect(res.output).toContain('--accent: #f59e0b;');
    expect(res.output).toContain('@page {');
    expect(res.output).toContain('margin: 0 !important;');
    expect(res.output).toContain('font-size: 10.5pt !important;');
    expect(res.output).toContain('.export-footer');
    expect(res.output).toContain('display: none !important;');
  });

  it('generates PDF print document via exportToPdf with clean formatting', async () => {
    const doc = {
      id: 'doc-pdf-test',
      name: 'lab-report.md',
      content: '# Lab Report\n\n| Param | Value |\n|---|---|\n| Voltage | 3.3V |\n\n```python\nprint("status ok")\n```',
      revision: 1
    };

    const res = await engine.exportToPdf(doc, {
      force: true,
      triggerPrint: false
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('<!DOCTYPE html>');
    expect(res.html).toContain('@page {');
    expect(res.html).toContain('margin: 0 !important;');
    expect(res.html).toContain('break-inside: avoid');
    expect(res.html).toContain('Lab Report');
  });

  it('rejects exportToPdf when blocking quality gate errors are present and force is false', async () => {
    const brokenDoc = {
      id: 'doc-pdf-err',
      name: 'broken-lab.md',
      content: '# Broken Lab\n\n```js\nunclosed\n',
      revision: 1
    };

    const res = await engine.exportToPdf(brokenDoc, {
      force: false,
      triggerPrint: false
    });

    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.error).toContain('Pre-flight validation failed');
  });

  describe('filesystem-lab.pdf Format & Clean Alignment Verification', () => {
    const sampleDoc = {
      id: 'doc-fs-lab',
      name: 'filesystem-lab.md',
      content: `# Filesystem Lab

Welcome to the automated lab.

| Component | Status | Spec |
|---|---|---|
| Core Bus | Operational | 10 Gbps |

\`\`\`python
def execute_lab():
    print("Filesystem verification running")
\`\`\`

> Note: All parameters must meet standard margins.

<div class="export-footer">Metadata footer</div>
<button class="copy-btn">[Copy]</button>
<span class="badge">TEST-BADGE</span>
http://localhost:3000/report
`,
      revision: 2
    };

    it('removes all corner text, copy buttons, badges, export-footers, and localhost URLs', async () => {
      const res = await engine.exportToPdf(sampleDoc, { force: true, triggerPrint: false });

      expect(res.success).toBe(true);
      // Stripped artifacts
      expect(res.html).not.toContain('<div class="export-footer">Metadata footer</div>');
      expect(res.html).not.toContain('<button class="copy-btn">[Copy]</button>');
      expect(res.html).not.toContain('<span class="badge">TEST-BADGE</span>');
      expect(res.html).not.toContain('[Copy]');
      expect(res.html).not.toContain('http://localhost:3000/');

      // Preserved markdown content
      expect(res.html).toContain('Filesystem Lab');
      expect(res.html).toContain('Core Bus');
      expect(res.html).toContain('execute_lab');
    });

    it('enforces clean margins, A4 size, and suppresses corner boxes in print layout', async () => {
      const res = await engine.exportToPdf(sampleDoc, { force: true, triggerPrint: false });

      expect(res.html).toContain('size: A4 portrait;');
      expect(res.html).toContain('margin: 0 !important;');
      expect(res.html).toContain('@bottom-left {');
      expect(res.html).toContain('content: none !important;');
      expect(res.html).toContain('@top-right {');
      expect(res.html).toContain('.export-footer,');
      expect(res.html).toContain('button, input, select, textarea {');
    });

    it('enforces professional typography hierarchy and print color rules', async () => {
      const res = await engine.exportToPdf(sampleDoc, { force: true, triggerPrint: false });

      // Typography hierarchy
      expect(res.html).toContain('h1 {');
      expect(res.html).toContain('font-size: 24pt;');
      expect(res.html).toContain('h2 {');
      expect(res.html).toContain('font-size: 18pt;');
      expect(res.html).toContain('h3 {');
      expect(res.html).toContain('font-size: 14pt;');
      expect(res.html).toContain('code {');
      expect(res.html).toContain('font-size: 9.5pt;');

      // Avoid page breaks inside blocks and tables
      expect(res.html).toContain('page-break-inside: avoid;');
      expect(res.html).toContain('break-inside: avoid;');
      expect(res.html).toContain('page-break-after: avoid;');
      expect(res.html).toContain('break-after: avoid;');
    });
  });

  describe('Image Error Handling & Promise Rejection Prevention', () => {
    it('exports document with broken image reference without throwing unhandled promise rejection', async () => {
      const docWithBrokenImage = {
        id: 'doc-broken-img',
        name: 'broken-image-doc.md',
        content: '# Document with Broken Image\n\n![Missing](./missing-file-12345.png)\n\nContent continues here.',
        revision: 1
      };

      // Should not throw or have unhandled promise rejections
      const res = await engine.exportDocument(docWithBrokenImage, {
        format: ExportFormat.HTML,
        force: true
      });

      expect(res.success).toBe(true);
      expect(res.output).toContain('<!DOCTYPE html>');
      expect(res.output).toContain('Document with Broken Image');
    });

    it('gracefully skips images that fail to load during asset embedding', async () => {
      const docWithImage = {
        id: 'doc-img-embed',
        name: 'image-embed-test.md',
        content: '# Report\n\n![Chart](chart.png)\n![Diagram](diagram.svg)\n',
        revision: 1
      };

      // Empty assetMap means images won't be found and should be handled gracefully
      const res = await engine.exportDocument(docWithImage, {
        format: ExportFormat.HTML,
        force: true,
        assetMap: {}
      });

      expect(res.success).toBe(true);
      expect(res.output).toContain('<!DOCTYPE html>');
      // SVG fallback should be present
      expect(res.output).toContain('[SVG:');
    });

    it('handles PDF export with broken images when triggerPrint is false', async () => {
      const docWithBrokenImage = {
        id: 'doc-pdf-broken-img',
        name: 'pdf-broken-image.md',
        content: '# PDF with Broken Images\n\n![Broken](nonexistent.png)\n\n## Section\n\nText content.',
        revision: 1
      };

      const res = await engine.exportToPdf(docWithBrokenImage, {
        force: true,
        triggerPrint: false
      });

      expect(res.success).toBe(true);
      expect(res.html).toContain('<!DOCTYPE html>');
      expect(res.isPrintReady).toBe(true);
    });
  });
});

