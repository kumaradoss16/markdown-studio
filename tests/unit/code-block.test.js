import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CodeBlockHeaderWidget, codeBlockDecorations } from '../../src/features/editor/extensions/code-block.js';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';

describe('Enhanced Code Block Engine', () => {
  describe('CodeBlockHeaderWidget', () => {
    it('creates a header element with language pill and copy button', () => {
      const widget = new CodeBlockHeaderWidget('python', 'print("hello")');
      const dom = widget.toDOM();

      expect(dom.className).toBe('cm-code-block-header');
      expect(dom.getAttribute('contenteditable')).toBe('false');

      const label = dom.querySelector('.cm-code-block-label');
      expect(label).not.toBeNull();
      expect(label.textContent).toBe('PYTHON');

      const copyBtn = dom.querySelector('.cm-code-block-copy-btn');
      expect(copyBtn).not.toBeNull();
      expect(copyBtn.getAttribute('aria-label')).toBe('Copy code');
    });

    it('defaults language to TEXT if empty or omitted', () => {
      const widget = new CodeBlockHeaderWidget('', 'some text');
      const dom = widget.toDOM();
      const label = dom.querySelector('.cm-code-block-label');
      expect(label.textContent).toBe('TEXT');
    });
  });

  describe('CodeMirror 6 codeBlockDecorations StateField', () => {
    it('attaches to editor state and decorates fenced code blocks', () => {
      const doc = '```typescript\nconst message: string = "hello";\n```\nNormal paragraph.';
      const host = document.createElement('div');
      document.body.appendChild(host);

      const state = EditorState.create({
        doc,
        extensions: [codeBlockDecorations]
      });
      const view = new EditorView({ state, parent: host });

      const decos = view.state.field(codeBlockDecorations);
      expect(decos).toBeDefined();
      expect(decos.size).toBe(1);

      view.destroy();
      host.remove();
    });
  });

  describe('MarkdownPipeline Preview Code Block Rendering', () => {
    it('renders code blocks into .fenced-code-container with header and copy button', () => {
      const doc = {
        id: 'test-code',
        revision: 1,
        content: '```javascript\nconsole.log("MarkForge");\n```'
      };

      const result = markdownPipeline.process(doc);
      expect(result.html).toContain('class="fenced-code-container"');
      expect(result.html).toContain('data-language="javascript"');
      expect(result.html).toContain('class="fenced-code-header"');
      expect(result.html).toContain('class="fenced-code-label">JAVASCRIPT</span>');
      expect(result.html).toContain('class="fenced-code-copy-btn"');
      expect(result.html).toContain('class="language-javascript"');
      expect(result.html).toContain('console.log("MarkForge");');
    });

    it('sanitizes code content without stripping language structure', () => {
      const doc = {
        id: 'test-sanitize',
        revision: 1,
        content: '```html\n<script>alert("xss")</script>\n```'
      };

      const result = markdownPipeline.process(doc);
      expect(result.html).toContain('class="fenced-code-container"');
      expect(result.html).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
      // Dangerous script tag should be escaped inside <code>, not executed
      expect(result.html).not.toMatch(/<script>alert\(/);
    });
  });
});
