/**
 * CodeMirror 6 Formatting Commands Engine
 * Implements atomic, undoable transactions for inline styling, block-level transformations,
 * format clearing, and keyboard shortcuts.
 */

export const INLINE_FORMATS = {
  bold: { prefix: '**', suffix: '**', label: 'Bold', shortcut: 'Ctrl+B' },
  italic: { prefix: '*', suffix: '*', label: 'Italic', shortcut: 'Ctrl+I' },
  underline: { prefix: '<u>', suffix: '</u>', label: 'Underline', shortcut: 'Ctrl+U' },
  strike: { prefix: '~~', suffix: '~~', label: 'Strikethrough', shortcut: 'Ctrl+Shift+X' },
  code: { prefix: '`', suffix: '`', label: 'Inline Code', shortcut: 'Ctrl+E' },
  math: { prefix: '$', suffix: '$', label: 'Inline Math', shortcut: '$' },
};

/**
 * Strips all inline markdown formatting delimiters and styling spans from a text string.
 * @param {string} text
 * @returns {string}
 */
export function stripInlineFormatting(text) {
  if (!text) return '';
  return text
    .replace(/<span\s+style="color:\s*[^";]+;?"[^>]*>(.*?)<\/span>/gi, '$1') // strip colored spans
    .replace(/<\/?[uU]>/g, '')         // strip <u> and </u>
    .replace(/\*\*(.*?)\*\*/g, '$1')     // strip bold **text**
    .replace(/~~(.*?)~~/g, '$1')         // strip strikethrough ~~text~~
    .replace(/`([^`]+)`/g, '$1')         // strip inline code `code`
    .replace(/\$([^$]+)\$/g, '$1')       // strip inline math $math$
    .replace(/\*([^*]+)\*/g, '$1')       // strip italic *text*
    .replace(/(\*\*|~~|`|\$)/g, '');     // strip dangling delimiters
}

/**
 * Wraps or updates text color on the current selection using an inline span style.
 * Dispatches an atomic transaction with selection preservation.
 * 
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} hexColor
 * @returns {boolean}
 */
export function applyTextColor(view, hexColor) {
  if (!view || !view.state || !hexColor) return false;
  const { from, to } = view.state.selection.main;
  if (from === to) return false;

  const doc = view.state.doc;
  const selected = doc.sliceString(from, to);

  // Case 1: Active selection itself is wrapped in <span style="color: ...">...</span>
  const spanRegex = /^<span\s+style="color:\s*([^";]+);?"[^>]*>([\s\S]*)<\/span>$/i;
  const match = selected.match(spanRegex);

  if (match) {
    const existingColor = match[1].trim().toLowerCase();
    if (existingColor === hexColor.trim().toLowerCase()) {
      // Toggle off / remove color
      const uncolored = match[2];
      view.dispatch({
        changes: { from, to, insert: uncolored },
        selection: { anchor: from, head: from + uncolored.length },
        scrollIntoView: true,
        userEvent: 'format.color',
      });
    } else {
      // Replace with new color
      const replacement = `<span style="color: ${hexColor};">${match[2]}</span>`;
      view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from, head: from + replacement.length },
        scrollIntoView: true,
        userEvent: 'format.color',
      });
    }
    view.focus();
    return true;
  }

  // Case 2: Document text immediately surrounding selection is <span style="color: ...">[selected]</span>
  const line = doc.lineAt(from);
  const textBefore = doc.sliceString(line.from, from);
  const textAfter = doc.sliceString(to, line.to);

  const beforeSpanMatch = textBefore.match(/<span\s+style="color:\s*([^";]+);?"[^>]*>$/i);
  const afterSpanMatch = textAfter.match(/^<\/span>/i);

  if (beforeSpanMatch && afterSpanMatch) {
    const spanStart = from - beforeSpanMatch[0].length;
    const spanEnd = to + afterSpanMatch[0].length;
    const existingColor = beforeSpanMatch[1].trim().toLowerCase();

    if (existingColor === hexColor.trim().toLowerCase()) {
      // Toggle off / remove color
      view.dispatch({
        changes: { from: spanStart, to: spanEnd, insert: selected },
        selection: { anchor: spanStart, head: spanStart + selected.length },
        scrollIntoView: true,
        userEvent: 'format.color',
      });
    } else {
      // Replace with new color
      const replacement = `<span style="color: ${hexColor};">${selected}</span>`;
      view.dispatch({
        changes: { from: spanStart, to: spanEnd, insert: replacement },
        selection: { anchor: spanStart, head: spanStart + replacement.length },
        scrollIntoView: true,
        userEvent: 'format.color',
      });
    }
    view.focus();
    return true;
  }

  // Case 3: Standard wrap of selected text
  const replacement = `<span style="color: ${hexColor};">${selected}</span>`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from, head: from + replacement.length },
    scrollIntoView: true,
    userEvent: 'format.color',
  });
  view.focus();
  return true;
}

/**
 * Toggles an inline format delimiter around the current selection in CodeMirror 6.
 * If the selection is already wrapped, unwraps it.
 * Dispatches an atomic transaction with selection preservation and undo/redo support.
 * 
 * @param {import('@codemirror/view').EditorView} view
 * @param {'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'math'} formatType
 * @returns {boolean}
 */
export function toggleInlineFormat(view, formatType) {
  if (!view || !view.state) return false;

  const config = INLINE_FORMATS[formatType];
  if (!config) return false;

  const { prefix, suffix } = config;
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const selected = doc.sliceString(from, to);

  // Case 1: Active selection itself starts and ends with delimiters (e.g. user selected "**text**")
  if (
    selected.length >= prefix.length + suffix.length &&
    selected.startsWith(prefix) &&
    selected.endsWith(suffix)
  ) {
    const unwrapped = selected.slice(prefix.length, selected.length - suffix.length);
    view.dispatch({
      changes: { from, to, insert: unwrapped },
      selection: { anchor: from, head: from + unwrapped.length },
      scrollIntoView: true,
      userEvent: 'format.toggle.unwrap',
    });
    view.focus();
    return true;
  }

  // Case 2: Document text immediately surrounding selection has delimiters (e.g. "**[text]**")
  const beforeStart = Math.max(0, from - prefix.length);
  const afterEnd = Math.min(doc.length, to + suffix.length);
  const textBefore = doc.sliceString(beforeStart, from);
  const textAfter = doc.sliceString(to, afterEnd);

  if (textBefore === prefix && textAfter === suffix) {
    view.dispatch({
      changes: { from: beforeStart, to: afterEnd, insert: selected },
      selection: { anchor: beforeStart, head: beforeStart + selected.length },
      scrollIntoView: true,
      userEvent: 'format.toggle.unwrap',
    });
    view.focus();
    return true;
  }

  // Case 3: Empty selection (collapsed cursor)
  if (from === to) {
    // Check if cursor is directly between prefix and suffix
    if (textBefore === prefix && textAfter === suffix) {
      view.dispatch({
        changes: { from: beforeStart, to: afterEnd, insert: '' },
        selection: { anchor: beforeStart, head: beforeStart },
        scrollIntoView: true,
        userEvent: 'format.toggle.unwrap',
      });
    } else {
      // Insert delimiters and place cursor inside
      view.dispatch({
        changes: { from, to, insert: `${prefix}${suffix}` },
        selection: { anchor: from + prefix.length, head: from + prefix.length },
        scrollIntoView: true,
        userEvent: 'format.toggle.wrap',
      });
    }
    view.focus();
    return true;
  }

  // Case 4: Standard wrap of selected text
  const replacement = `${prefix}${selected}${suffix}`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + prefix.length, head: to + prefix.length },
    scrollIntoView: true,
    userEvent: 'format.toggle.wrap',
  });
  view.focus();
  return true;
}

/**
 * Clears all inline markdown styling delimiters from the current selection.
 * @param {import('@codemirror/view').EditorView} view
 * @returns {boolean}
 */
export function clearFormatting(view) {
  if (!view || !view.state) return false;
  const { from, to } = view.state.selection.main;
  if (from === to) return false;

  const doc = view.state.doc;
  const selected = doc.sliceString(from, to);
  const cleaned = stripInlineFormatting(selected);

  if (cleaned === selected) return false;

  view.dispatch({
    changes: { from, to, insert: cleaned },
    selection: { anchor: from, head: from + cleaned.length },
    scrollIntoView: true,
    userEvent: 'format.clear',
  });
  view.focus();
  return true;
}

/**
 * Applies or switches block-level formatting on the line(s) containing the selection.
 * Cleans existing heading or list prefixes before applying the target transformation.
 * 
 * @param {import('@codemirror/view').EditorView} view
 * @param {'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'code-block' | 'callout-note' | 'equation-block'} blockType
 * @returns {boolean}
 */
export function applyBlockFormat(view, blockType) {
  if (!view || !view.state) return false;

  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  // Fenced / Container blocks (Code block, Callout, Block equation)
  if (blockType === 'code-block') {
    const selected = doc.sliceString(from, to) || '// Write code here\n';
    const snippet = `\`\`\`javascript\n${selected.endsWith('\n') ? selected : selected + '\n'}\`\`\`\n`;
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: snippet },
      selection: { anchor: startLine.from + snippet.length },
      scrollIntoView: true,
      userEvent: 'format.block.code',
    });
    view.focus();
    return true;
  }

  if (blockType === 'callout-note') {
    const selected = doc.sliceString(from, to) || 'Important operational note or instruction.';
    const snippet = `> [!NOTE]\n> ${selected}\n`;
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: snippet },
      selection: { anchor: startLine.from + snippet.length },
      scrollIntoView: true,
      userEvent: 'format.block.callout',
    });
    view.focus();
    return true;
  }

  if (blockType === 'equation-block') {
    const selected = doc.sliceString(from, to) || '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)';
    const snippet = `$$\n${selected}\n$$\n`;
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: snippet },
      selection: { anchor: startLine.from + snippet.length },
      scrollIntoView: true,
      userEvent: 'format.block.equation',
    });
    view.focus();
    return true;
  }

  // Line prefix transformations (text / h1 / h2 / h3 / h4 / quote)
  const linePrefixPattern = /^(\s*)(#{1,6}\s+|>\s*(\[!.*?\])?\s*|(\d+\.|\-|\*)\s+(\[\s*[\s\w]*\]\s*)?)/;
  const changes = [];

  let prefixStr = '';
  switch (blockType) {
    case 'h1': prefixStr = '# '; break;
    case 'h2': prefixStr = '## '; break;
    case 'h3': prefixStr = '### '; break;
    case 'h4': prefixStr = '#### '; break;
    case 'quote': prefixStr = '> '; break;
    case 'text': prefixStr = ''; break; // plain body text
  }

  for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
    const line = doc.line(lineNo);
    const text = line.text;

    // Strip any existing block prefix
    let cleanText = text;
    const match = text.match(linePrefixPattern);
    if (match) {
      cleanText = text.slice(match[0].length);
    }

    // If toggling same prefix on a single line, convert to plain text
    let newText = `${prefixStr}${cleanText}`;
    if (startLine.number === endLine.number && match && match[0].trim() === prefixStr.trim()) {
      newText = cleanText;
    }

    changes.push({
      from: line.from,
      to: line.to,
      insert: newText,
    });
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    userEvent: `format.block.${blockType}`,
  });
  view.focus();
  return true;
}

/**
 * Keymap bindings for inline formatting actions in CodeMirror 6.
 */
export const formattingKeymap = [
  {
    key: 'Mod-b',
    run: (view) => toggleInlineFormat(view, 'bold'),
  },
  {
    key: 'Mod-i',
    run: (view) => toggleInlineFormat(view, 'italic'),
  },
  {
    key: 'Mod-u',
    run: (view) => toggleInlineFormat(view, 'underline'),
  },
  {
    key: 'Mod-Shift-x',
    run: (view) => toggleInlineFormat(view, 'strike'),
  },
  {
    key: 'Mod-e',
    run: (view) => toggleInlineFormat(view, 'code'),
  },
];
