import { describe, it, expect, beforeEach, vi } from 'vitest';
import { htmlToMarkdownService } from '../../src/services/html-to-markdown-service.js';
import { clipboardImportService } from '../../src/services/clipboard-import-service.js';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';
import { EditorComponent } from '../../src/components/editor/editor.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { undo, redo } from '@codemirror/commands';

describe('Clipboard Paste Pipeline & ChatGPT Architecture Preservation (P-001 - P-018)', () => {
  let container;
  let editor;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = '<div id="cmHost"></div>';
    document.body.appendChild(container);
    editor = new EditorComponent(container);
  });

  // P-001 — Basic rich text
  it('P-001: preserves headings, paragraphs, bold, italic, and links as Markdown', () => {
    const html = `
      <h1>System Overview</h1>
      <p>This is a <strong>critical</strong> component with <em>high</em> availability and a <a href="https://example.com/docs">reference link</a>.</p>
      <h2>Sub-section</h2>
      <p>Second paragraph content.</p>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('# System Overview');
    expect(res.markdown).toContain('## Sub-section');
    expect(res.markdown).toContain('**critical**');
    expect(res.markdown).toContain('*high*');
    expect(res.markdown).toContain('[reference link](https://example.com/docs)');
  });

  // P-002 — Nested lists
  it('P-002: preserves ordered and unordered lists with multiple nesting levels and hierarchy', () => {
    const html = `
      <ul>
        <li>Level 1 Item A
          <ul>
            <li>Level 2 Item A.1</li>
            <li>Level 2 Item A.2</li>
          </ul>
        </li>
        <li>Level 1 Item B</li>
      </ul>
      <ol>
        <li>Step 1
          <ol>
            <li>Sub-step 1.1</li>
          </ol>
        </li>
        <li>Step 2</li>
      </ol>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toMatch(/-\s+Level 1 Item A/);
    expect(res.markdown).toMatch(/\s+-\s+Level 2 Item A\.1/);
    expect(res.markdown).toMatch(/1\.\s+Step 1/);
    expect(res.markdown).toMatch(/\s+1\.\s+Sub-step 1\.1/);
  });

  // P-003 — Tables
  it('P-003: converts tables with headers and inline formatting, escaping internal pipes', () => {
    const html = `
      <table>
        <thead>
          <tr><th>Service</th><th>Protocol</th><th>SLA</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Ingestion</strong></td><td>gRPC | HTTP/2</td><td>99.99%</td></tr>
          <tr><td>Storage</td><td>NVMe | TCP</td><td>99.9%</td></tr>
        </tbody>
      </table>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('| Service | Protocol | SLA |');
    expect(res.markdown).toContain('| --- | --- | --- |');
    expect(res.markdown).toContain('**Ingestion**');
    expect(res.markdown).toContain('gRPC \\| HTTP/2');
  });

  // P-004 — Code blocks
  it('P-004: preserves indentation, braces, language identifiers, and handles embedded backticks safely', () => {
    const html = `
      <pre><code class="language-typescript">
export function processPayload(data: Record&lt;string, any&gt;): boolean {
  if (!data) return false;
  const backtickSample = \`value: \${data.id}\`;
  return true;
}
      </code></pre>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('```typescript');
    expect(res.markdown).toContain('export function processPayload(data: Record<string, any>): boolean {');
    expect(res.markdown).toContain('const backtickSample = `value: ${data.id}`;');
    expect(res.markdown).toContain('```');
  });

  // P-005 — Complex architecture diagram
  it('P-005: preserves dark architecture diagram with nested bordered panels, multi-columns, and arrows', () => {
    const fixture = `
<div class="system-architecture border border-neutral-700 rounded-lg p-4 bg-neutral-900 my-4" style="display: flex; gap: 16px; border: 1px solid #334155; border-radius: 8px; padding: 16px; background-color: #0f172a;">
  <div style="flex: 1; border: 1px solid #38bdf8; border-radius: 6px; padding: 12px; background-color: #1e293b; text-align: center;">
    <div style="font-weight: bold; color: #38bdf8;">API Gateway</div>
    <div style="font-size: 11px; color: #94a3b8;">Auth &amp; Routing</div>
  </div>
  <div style="display: flex; align-items: center; font-size: 20px; color: #64748b;">→</div>
  <div style="flex: 1; border: 1px solid #10b981; border-radius: 6px; padding: 12px; background-color: #1e293b; text-align: center;">
    <div style="font-weight: bold; color: #10b981;">Compute Cluster</div>
    <div style="font-size: 11px; color: #94a3b8;">Worker Instances</div>
  </div>
</div>
`;
    const res = htmlToMarkdownService.convert(fixture);
    expect(res.markdown).toContain('data-preserve-html="true"');
    expect(res.markdown).toContain('API Gateway');
    expect(res.markdown).toContain('Compute Cluster');
    expect(res.markdown).toContain('→');
    expect(res.counts.diagrams).toBeGreaterThanOrEqual(1);

    // Verify it renders correctly in MarkdownPipeline without escaping
    const rendered = markdownPipeline.process({ content: res.markdown });
    expect(rendered.html).toContain('API Gateway');
    expect(rendered.html).toContain('Compute Cluster');
    expect(rendered.html).toContain('→');
  });

  // P-006 — HTML and plain-text fallback
  it('P-006: handles HTML present, HTML missing, empty HTML, and plain text only', () => {
    // 1. Plain text only
    const tOnly = clipboardImportService.determineContentType({
      text: 'Simple plain text without formatting.',
      html: null,
      images: [],
    });
    expect(tOnly).toBe('text');

    // 2. HTML present
    const hPresent = clipboardImportService.determineContentType({
      text: 'Simple text',
      html: '<p>Simple <strong>text</strong></p>',
      images: [],
    });
    expect(hPresent).toBe('html');

    // 3. Empty
    const emptyRes = clipboardImportService.determineContentType({
      text: '',
      html: '',
      images: [],
    });
    expect(emptyRes).toBe('empty');

    // 4. Malformed HTML
    const malformed = '<p>Unclosed paragraph <b>bold text';
    const conv = htmlToMarkdownService.convert(malformed);
    expect(conv.markdown).toContain('Unclosed paragraph **bold text**');
  });

  // P-007 — HTML sanitization
  it('P-007: blocks scripts, event handlers, dangerous URLs, and active SVGs', () => {
    const maliciousHtml = `
      <script>window.pwned = true;</script>
      <img src="x" onerror="alert(1)" />
      <a href="javascript:alert('XSS')">Bad link</a>
      <svg><circle cx="5" cy="5" r="5" onclick="alert(2)"/></svg>
      <p>Legitimate text</p>
    `;
    const res = htmlToMarkdownService.convert(maliciousHtml);
    expect(res.markdown).not.toContain('<script>');
    expect(res.markdown).not.toContain('onerror=');
    expect(res.markdown).not.toContain('javascript:');
    expect(res.markdown).not.toContain('onclick=');
    expect(res.markdown).toContain('Legitimate text');
  });

  // P-008 — Inline images
  it('P-008: preserves valid image references and handles placeholders', () => {
    const html = '<p><img src="https://example.com/assets/diagram.png" alt="Architecture" title="Diagram" /></p>';
    const res = htmlToMarkdownService.convert(html);
    expect(res.images.length).toBe(1);
    expect(res.images[0].src).toBe('https://example.com/assets/diagram.png');
    expect(res.markdown).toContain('![Architecture](__MARKFORGE_IMG_0__ "Diagram")');
  });

  // P-009 — Math and diagram source
  it('P-009: preserves math expressions ($...$, $$...$$) and Mermaid blocks', () => {
    const html = `
      <p>Inline formula: <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><annotation encoding="application/x-tex">a + b = c</annotation></semantics></math></span><span class="katex-html">...</span></span></p>
      <pre class="mermaid"><code>graph TD\n  A --> B</code></pre>
    `;
    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('$a + b = c$');
    expect(res.markdown).toContain('```mermaid');
    expect(res.markdown).toContain('graph TD');
  });

  // P-010 — Cursor insertion
  it('P-010: pastes content at cursor position without corrupting surrounding text', () => {
    const doc = documentStateManager.createDocument('doc-p010.md', 'Hello World!');
    editor.loadDocument(doc);

    // Set cursor between 'Hello ' and 'World!' (position 6)
    editor.view.dispatch({ selection: { anchor: 6, head: 6 } });

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<strong>Beautiful</strong> ' : '',
      },
    };

    const handled = editor.handlePaste(pasteEvent, editor.view);
    expect(handled).toBe(true);
    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe('Hello **Beautiful** World!');
  });

  // P-011 — Selection replacement
  it('P-011: replaces only selected range during paste', () => {
    const doc = documentStateManager.createDocument('doc-p011.md', 'The quick brown fox jumps');
    editor.loadDocument(doc);

    // Select 'brown fox' (index 10 to 19)
    editor.view.dispatch({ selection: { anchor: 10, head: 19 } });

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<em>silver wolf</em>' : '',
      },
    };

    const handled = editor.handlePaste(pasteEvent, editor.view);
    expect(handled).toBe(true);
    expect(editor.view.state.doc.toString()).toBe('The quick *silver wolf* jumps');
  });

  // P-012 — Duplicate insertion
  it('P-012: calls preventDefault and inserts content exactly once per paste event', () => {
    const doc = documentStateManager.createDocument('doc-p012.md', '');
    editor.loadDocument(doc);

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<h1>Single Title</h1>' : '',
      },
    };

    const handled = editor.handlePaste(pasteEvent, editor.view);
    expect(handled).toBe(true);
    expect(pasteEvent.preventDefault).toHaveBeenCalledTimes(1);

    const content = editor.view.state.doc.toString();
    const count = (content.match(/# Single Title/g) || []).length;
    expect(count).toBe(1);
  });

  // P-013 — Undo and redo
  it('P-013: allows paste operation to be undone and redone cleanly via editor history', () => {
    const doc = documentStateManager.createDocument('doc-p013.md', 'Initial Text. ');
    editor.loadDocument(doc);

    editor.view.dispatch({ selection: { anchor: 14, head: 14 } });

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<p>Pasted <strong>Feature</strong>.</p>' : '',
      },
    };

    editor.handlePaste(pasteEvent, editor.view);
    expect(editor.view.state.doc.toString()).toContain('Pasted **Feature**.');

    // Undo paste
    undo(editor.view);
    expect(editor.view.state.doc.toString()).toBe('Initial Text. ');

    // Redo paste
    redo(editor.view);
    expect(editor.view.state.doc.toString()).toContain('Pasted **Feature**.');
  });

  // P-014 — Editor and preview parity
  it('P-014: verifies pasted markdown/HTML produces matching structure in markdownPipeline', () => {
    const html = `
      <h2>Telemetry</h2>
      <div style="display: flex; gap: 10px;">
        <div class="metric-card"><span class="label">CPU</span><span class="val">12%</span></div>
      </div>
    `;
    const res = htmlToMarkdownService.convert(html);
    const pipelineRes = markdownPipeline.process({ content: res.markdown });

    expect(pipelineRes.headings[0].text).toBe('Telemetry');
    expect(pipelineRes.html).toContain('Telemetry</h2>');
    expect(pipelineRes.html).toContain('metric-card');
    expect(pipelineRes.html).toContain('CPU');
  });

  // P-015 — Autosave regression
  it('P-015: marks document as dirty and synchronizes content with documentStateManager', () => {
    const doc = documentStateManager.createDocument('doc-p015.md', 'Clean content');
    editor.loadDocument(doc);
    expect(documentStateManager.isDirty(doc.id)).toBe(false);

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<p>Dirty modification</p>' : '',
      },
    };

    editor.handlePaste(pasteEvent, editor.view);
    expect(documentStateManager.isDirty(doc.id)).toBe(true);
    const activeDoc = documentStateManager.getActiveDocument();
    expect(activeDoc.content).toContain('Dirty modification');
  });

  // P-016 — Malformed clipboard resilience
  it('P-016: recovers gracefully from malformed HTML without crashing editor or throwing unhandled errors', () => {
    const doc = documentStateManager.createDocument('doc-p016.md', 'Baseline');
    editor.loadDocument(doc);

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/html'],
        getData: (t) => t === 'text/html' ? '<div class="broken"><b>Unclosed</i><span>Mismatched</p>' : '',
      },
    };

    expect(() => {
      const handled = editor.handlePaste(pasteEvent, editor.view);
      expect(handled).toBe(true);
    }).not.toThrow();

    expect(editor.view.state.doc.toString()).toContain('Unclosed');
  });

  // P-017 — Unsupported layout fallback
  it('P-017: converts unsupported wrappers into readable content rather than discarding text', () => {
    const unsupported = `
      <canvas id="custom-gl"></canvas>
      <applet code="test.class"></applet>
      <unknown-component>
        <h3>Preserved Subheading</h3>
        <p>Text inside custom element remains intact.</p>
      </unknown-component>
    `;
    const res = htmlToMarkdownService.convert(unsupported);
    expect(res.markdown).toContain('### Preserved Subheading');
    expect(res.markdown).toContain('Text inside custom element remains intact.');
  });

  // P-018 — Existing behavior regression
  it('P-018: delegates normal text paste to default CodeMirror handler and leaves non-rich text unaltered', () => {
    const doc = documentStateManager.createDocument('doc-p018.md', 'Existing');
    editor.loadDocument(doc);

    const textOnlyEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        types: ['text/plain'],
        getData: (t) => t === 'text/plain' ? 'Normal prose sentence.' : '',
      },
    };

    // Returns false so CodeMirror handles normal plain-text insertion natively
    const handled = editor.handlePaste(textOnlyEvent, editor.view);
    expect(handled).toBe(false);
    expect(textOnlyEvent.preventDefault).not.toHaveBeenCalled();
  });
});
