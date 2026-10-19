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

  it('syncs selected accent color with export output and enforces 15mm print margins', async () => {
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
    expect(res.output).toContain('margin: 15mm;');
    expect(res.output).toContain('font-size: 11pt !important;');
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
    expect(res.html).toContain('margin: 15mm;');
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
});

