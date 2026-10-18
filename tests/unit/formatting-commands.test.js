import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  stripInlineFormatting,
  toggleInlineFormat,
  clearFormatting,
  applyBlockFormat,
  applyTextColor,
  formattingKeymap,
  INLINE_FORMATS
} from '../../src/features/editor/commands/formatting.js';

describe('Formatting Commands Engine', () => {
  let hostEl;
  let view;

  if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [];
    Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
  }

  function createView(docText, anchor = 0, head = 0) {
    if (view) view.destroy();
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const state = EditorState.create({
      doc: docText,
      selection: { anchor, head }
    });
    view = new EditorView({ state, parent: hostEl });
    return view;
  }

  describe('stripInlineFormatting', () => {
    it('strips bold delimiters', () => {
      expect(stripInlineFormatting('**Hello World**')).toBe('Hello World');
    });

    it('strips italic delimiters', () => {
      expect(stripInlineFormatting('*Italic Text*')).toBe('Italic Text');
    });

    it('strips underline tags', () => {
      expect(stripInlineFormatting('<u>Underlined</u>')).toBe('Underlined');
    });

    it('strips strikethrough delimiters', () => {
      expect(stripInlineFormatting('~~Deleted~~')).toBe('Deleted');
    });

    it('strips inline code and math', () => {
      expect(stripInlineFormatting('`console.log()`')).toBe('console.log()');
      expect(stripInlineFormatting('$E = mc^2$')).toBe('E = mc^2');
    });

    it('strips multiple mixed formats cleanly', () => {
      const input = '**Bold** and *Italic* and <u>Underline</u> and ~~Strike~~ and `code` and $math$';
      const expected = 'Bold and Italic and Underline and Strike and code and math';
      expect(stripInlineFormatting(input)).toBe(expected);
    });
  });

  describe('toggleInlineFormat with CodeMirror 6 View', () => {
    it('wraps unformatted selection with bold delimiters', () => {
      const v = createView('Hello World', 0, 5); // "Hello"
      const handled = toggleInlineFormat(v, 'bold');
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('**Hello** World');
      expect(v.state.selection.main.from).toBe(2);
      expect(v.state.selection.main.to).toBe(7);
    });

    it('unwraps selection if already enclosed in bold delimiters', () => {
      const v = createView('**Hello** World', 0, 9); // "**Hello**"
      const handled = toggleInlineFormat(v, 'bold');
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('Hello World');
      expect(v.state.selection.main.from).toBe(0);
      expect(v.state.selection.main.to).toBe(5);
    });

    it('unwraps if selection is between surrounding delimiters in document', () => {
      const v = createView('**Hello** World', 2, 7); // "[Hello]"
      const handled = toggleInlineFormat(v, 'bold');
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('Hello World');
      expect(v.state.selection.main.from).toBe(0);
      expect(v.state.selection.main.to).toBe(5);
    });

    it('inserts empty delimiters and positions cursor inside when collapsed', () => {
      const v = createView('Hello World', 5, 5); // cursor after "Hello"
      const handled = toggleInlineFormat(v, 'code');
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('Hello`` World');
      expect(v.state.selection.main.from).toBe(6);
      expect(v.state.selection.main.to).toBe(6);
    });

    it('supports italic, underline, strike, and math toggling', () => {
      const vItalic = createView('Sample Text', 0, 6);
      toggleInlineFormat(vItalic, 'italic');
      expect(vItalic.state.doc.toString()).toBe('*Sample* Text');

      const vUnderline = createView('Sample Text', 0, 6);
      toggleInlineFormat(vUnderline, 'underline');
      expect(vUnderline.state.doc.toString()).toBe('<u>Sample</u> Text');

      const vStrike = createView('Sample Text', 0, 6);
      toggleInlineFormat(vStrike, 'strike');
      expect(vStrike.state.doc.toString()).toBe('~~Sample~~ Text');

      const vMath = createView('Sample Text', 0, 6);
      toggleInlineFormat(vMath, 'math');
      expect(vMath.state.doc.toString()).toBe('$Sample$ Text');
    });
  });

  describe('clearFormatting', () => {
    it('clears all markdown formatting delimiters from active selection', () => {
      const text = '**Bold** and *Italic* text';
      const v = createView(text, 0, text.length);
      const handled = clearFormatting(v);
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('Bold and Italic text');
    });
  });

  describe('applyBlockFormat', () => {
    it('converts plain text to Heading 1', () => {
      const v = createView('Architecture Overview', 0, 5);
      applyBlockFormat(v, 'h1');
      expect(v.state.doc.toString()).toBe('# Architecture Overview');
    });

    it('transforms Heading 1 to Heading 2 without duplicate hashes', () => {
      const v = createView('# Architecture Overview', 4, 10);
      applyBlockFormat(v, 'h2');
      expect(v.state.doc.toString()).toBe('## Architecture Overview');
    });

    it('converts Heading or Blockquote to plain body text', () => {
      const vHeading = createView('### Specifications', 5, 10);
      applyBlockFormat(vHeading, 'text');
      expect(vHeading.state.doc.toString()).toBe('Specifications');

      const vQuote = createView('> Important operational note', 3, 10);
      applyBlockFormat(vQuote, 'text');
      expect(vQuote.state.doc.toString()).toBe('Important operational note');
    });

    it('prefixes line with blockquote marker', () => {
      const v = createView('Quote line', 0, 5);
      applyBlockFormat(v, 'quote');
      expect(v.state.doc.toString()).toBe('> Quote line');
    });

    it('inserts fenced code block, callout note, and equation block containers', () => {
      const vCode = createView('const x = 10;', 0, 13);
      applyBlockFormat(vCode, 'code-block');
      expect(vCode.state.doc.toString()).toContain('```javascript\nconst x = 10;\n```');

      const vCallout = createView('Alert message', 0, 13);
      applyBlockFormat(vCallout, 'callout-note');
      expect(vCallout.state.doc.toString()).toContain('> [!NOTE]\n> Alert message');

      const vEq = createView('x^2 + y^2 = r^2', 0, 15);
      applyBlockFormat(vEq, 'equation-block');
      expect(vEq.state.doc.toString()).toContain('$$\nx^2 + y^2 = r^2\n$$');
    });

    it('transforms to Heading 4', () => {
      const v = createView('Sub header', 0, 10);
      applyBlockFormat(v, 'h4');
      expect(v.state.doc.toString()).toBe('#### Sub header');
    });
  });

  describe('applyTextColor', () => {
    it('wraps selected text with an inline span color style', () => {
      const v = createView('Highlight this word', 10, 14); // "this"
      const handled = applyTextColor(v, '#EF4444');
      expect(handled).toBe(true);
      expect(v.state.doc.toString()).toBe('Highlight <span style="color: #EF4444;">this</span> word');
    });

    it('updates existing span color when a different color is applied', () => {
      const initial = 'Highlight <span style="color: #EF4444;">this</span> word';
      const from = initial.indexOf('<span');
      const to = initial.indexOf('</span>') + 7;
      const v = createView(initial, from, to);
      applyTextColor(v, '#38BDF8');
      expect(v.state.doc.toString()).toBe('Highlight <span style="color: #38BDF8;">this</span> word');
    });

    it('unwraps span color when identical color is applied again', () => {
      const initial = 'Highlight <span style="color: #EF4444;">this</span> word';
      const from = initial.indexOf('<span');
      const to = initial.indexOf('</span>') + 7;
      const v = createView(initial, from, to);
      applyTextColor(v, '#EF4444');
      expect(v.state.doc.toString()).toBe('Highlight this word');
    });

    it('updates color when only inner text inside span is selected', () => {
      const initial = 'Highlight <span style="color: #EF4444;">this</span> word';
      const from = initial.indexOf('this');
      const to = from + 4;
      const v = createView(initial, from, to);
      applyTextColor(v, '#10B981');
      expect(v.state.doc.toString()).toBe('Highlight <span style="color: #10B981;">this</span> word');
    });
  });

  describe('formattingKeymap configuration', () => {
    it('defines keybindings for Bold, Italic, Underline, Strike, and Code', () => {
      const keys = formattingKeymap.map(k => k.key);
      expect(keys).toContain('Mod-b');
      expect(keys).toContain('Mod-i');
      expect(keys).toContain('Mod-u');
      expect(keys).toContain('Mod-Shift-x');
      expect(keys).toContain('Mod-e');
    });
  });
});
