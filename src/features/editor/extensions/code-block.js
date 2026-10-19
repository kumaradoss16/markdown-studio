import { StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';

/**
 * CodeBlockHeaderWidget
 * Block widget rendered above fenced code blocks in CodeMirror 6.
 * Features:
 * - Language badge pill (e.g. PYTHON, JAVASCRIPT, BASH)
 * - One-click Copy to clipboard button with 2s "✓ Copied!" transition
 */
export class CodeBlockHeaderWidget extends WidgetType {
  constructor(lang = 'text', codeContent = '') {
    super();
    this.lang = (lang || 'TEXT').trim().toLowerCase();
    this.codeContent = codeContent;
  }

  eq(other) {
    return this.lang === other.lang && this.codeContent === other.codeContent;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-code-block-header';
    container.setAttribute('contenteditable', 'false');

    const displayLang = this.lang.toUpperCase();

    container.innerHTML = `
      <div class="cm-code-block-lang">
        <span class="cm-code-block-dot"></span>
        <span class="cm-code-block-label">${displayLang}</span>
      </div>
      <button class="cm-code-block-copy-btn" title="Copy code snippet" type="button" aria-label="Copy code">
        <svg class="cm-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="cm-copy-label">Copy</span>
      </button>
    `;

    const copyBtn = container.querySelector('.cm-code-block-copy-btn');

    // Prevent editor blur or cursor jump on click
    copyBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(this.codeContent);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = this.codeContent;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }

        // State transition: show checkmark and 'Copied!' for 2 seconds
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
          <svg class="cm-copy-icon check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span class="cm-copy-label" style="color: #10B981; font-weight: 600;">Copied!</span>
        `;

        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `
            <svg class="cm-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="cm-copy-label">Copy</span>
          `;
        }, 2000);
      } catch (err) {
        console.warn('Code block copy failed:', err);
      }
    });

    return container;
  }
}

/**
 * Builds decorations for all fenced code blocks in the document.
 * @param {import('@codemirror/state').EditorState} state
 * @returns {import('@codemirror/view').DecorationSet}
 */
export function buildCodeBlockDecorations(state) {
  const decorations = [];
  const doc = state.doc;
  const lineCount = doc.lines;

  let inBlock = false;
  let blockStartLine = null;
  let blockLang = 'text';
  let blockCodeLines = [];

  for (let i = 1; i <= lineCount; i++) {
    const line = doc.line(i);
    const text = line.text;
    const fenceMatch = text.match(/^(\s*)(`{3,}|~{3,})([a-zA-Z0-9_\-\.\+]*)/);

    if (fenceMatch) {
      if (!inBlock) {
        inBlock = true;
        blockStartLine = line;
        const rawLang = fenceMatch[3] ? fenceMatch[3].replace(/[`~]/g, '').trim() : '';
        blockLang = rawLang || 'text';
        blockCodeLines = [];
      } else {
        // Closing fence
        inBlock = false;
        const codeText = blockCodeLines.join('\n');
        const widget = Decoration.widget({
          widget: new CodeBlockHeaderWidget(blockLang, codeText),
          side: -1,
          block: true,
        });
        decorations.push(widget.range(blockStartLine.from));
      }
    } else if (inBlock) {
      blockCodeLines.push(text);
    }
  }

  // Unclosed fence: still render header for the open code block
  if (inBlock && blockStartLine) {
    const codeText = blockCodeLines.join('\n');
    const widget = Decoration.widget({
      widget: new CodeBlockHeaderWidget(blockLang, codeText),
      side: -1,
      block: true,
    });
    decorations.push(widget.range(blockStartLine.from));
  }

  return Decoration.set(decorations, true);
}

/**
 * CodeMirror 6 StateField for Enhanced Code Blocks.
 * Uses StateField to safely support block-level widgets.
 */
export const codeBlockDecorations = StateField.define({
  create(state) {
    return buildCodeBlockDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildCodeBlockDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
