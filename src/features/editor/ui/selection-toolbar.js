import { toggleInlineFormat, clearFormatting, applyBlockFormat } from '../commands/formatting.js';

/**
 * Floating Selection Bubble Toolbar
 * Renders contextual formatting controls directly above the user's active selection.
 */
export class SelectionToolbar {
  constructor(editorComponent) {
    this.editor = editorComponent;
    this.cmHost = null;
    this.el = null;
    this.blockDropdownOpen = false;
  }

  attach(cmHost) {
    this.cmHost = cmHost;

    document.addEventListener('mousedown', (e) => {
      if (this.el && !this.el.contains(e.target)) {
        this.hide();
      }
    });
  }

  getOrCreateElement() {
    if (this.el) return this.el;

    const toolbar = document.createElement('div');
    toolbar.className = 'floating-format-toolbar';
    toolbar.innerHTML = `
      <!-- Block Level Quick Switcher -->
      <div class="floating-block-dropdown" id="bubbleBlockDropdown">
        <button class="floating-block-trigger" id="bubbleBlockTrigger" title="Block Type">
          <span id="bubbleBlockLabel">Text</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="floating-block-menu" id="bubbleBlockMenu" style="display: none;">
          <div class="floating-block-option" data-block="text">Text (Body)</div>
          <div class="floating-block-option" data-block="h1">Heading 1</div>
          <div class="floating-block-option" data-block="h2">Heading 2</div>
          <div class="floating-block-option" data-block="h3">Heading 3</div>
          <div class="floating-block-option" data-block="quote">Quote</div>
        </div>
      </div>

      <div class="floating-format-separator"></div>

      <!-- Inline Formatting Controls -->
      <button class="floating-format-btn" data-action="bold" title="Bold (Ctrl+B)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="italic" title="Italic (Ctrl+I)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="4" x2="10" y2="4"></line>
          <line x1="14" y1="20" x2="5" y2="20"></line>
          <line x1="15" y1="4" x2="9" y2="20"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="underline" title="Underline (Ctrl+U)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path>
          <line x1="4" y1="21" x2="20" y2="21"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="strike" title="Strikethrough (Ctrl+Shift+X)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4H9a3 3 0 0 0-2.83 4"></path>
          <path d="M14 12v4a3 3 0 0 1-3 3H8"></path>
          <line x1="4" y1="12" x2="20" y2="12"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="code" title="Inline Code (Ctrl+E)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="math" title="Inline Math ($)">
        <span style="font-family: var(--font-toolbar-mono, monospace); font-weight: 700; font-size: 13px;">$</span>
      </button>

      <button class="floating-format-btn" data-action="clear" title="Clear Formatting (Tx)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7V4h16v3"></path>
          <path d="M9 20h6"></path>
          <path d="M12 4v16"></path>
          <line x1="16" y1="15" x2="21" y2="20"></line>
          <line x1="21" y1="15" x2="16" y2="20"></line>
        </svg>
      </button>

      <div class="floating-format-separator"></div>

      <button class="floating-format-btn" data-action="link" title="Insert Link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </button>
    `;

    // Handle block dropdown toggle
    const trigger = toolbar.querySelector('#bubbleBlockTrigger');
    const menu = toolbar.querySelector('#bubbleBlockMenu');
    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.blockDropdownOpen = !this.blockDropdownOpen;
      menu.style.display = this.blockDropdownOpen ? 'flex' : 'none';
    });

    toolbar.querySelectorAll('.floating-block-option').forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const blockType = opt.getAttribute('data-block');
        applyBlockFormat(this.editor.view, blockType);
        menu.style.display = 'none';
        this.blockDropdownOpen = false;
        this.hide();
      });
    });

    // Handle inline formatting actions
    toolbar.querySelectorAll('.floating-format-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        this.executeAction(action);
      });
    });

    this.cmHost.appendChild(toolbar);
    this.el = toolbar;
    return toolbar;
  }

  executeAction(action) {
    const view = this.editor.view;
    if (!view) return;

    if (action === 'clear') {
      clearFormatting(view);
    } else if (action === 'link') {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || 'link text';
      view.dispatch({
        changes: { from, to, insert: `[${selected}](url)` },
        selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
      });
      view.focus();
    } else {
      toggleInlineFormat(view, action);
    }

    this.hide();
  }

  show(view, from, to) {
    if (!view || from === to) {
      this.hide();
      return;
    }

    const startCoords = view.coordsAtPos(from);
    const endCoords = view.coordsAtPos(to);
    if (!startCoords) {
      this.hide();
      return;
    }

    const el = this.getOrCreateElement();
    const hostRect = this.cmHost.getBoundingClientRect();

    // Position centered above selection range
    const selLeft = startCoords.left - hostRect.left;
    const selRight = endCoords ? endCoords.right - hostRect.left : selLeft + 50;
    const center = (selLeft + selRight) / 2;

    const toolbarWidth = 320;
    const left = Math.max(10, Math.min(hostRect.width - toolbarWidth - 10, center - toolbarWidth / 2));
    const top = Math.max(10, startCoords.top - hostRect.top - 44);

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.display = 'flex';

    // Update active block label if applicable
    const line = view.state.doc.lineAt(from);
    const labelEl = el.querySelector('#bubbleBlockLabel');
    if (labelEl) {
      if (line.text.startsWith('#### ')) labelEl.textContent = 'Heading 4';
      else if (line.text.startsWith('### ')) labelEl.textContent = 'Heading 3';
      else if (line.text.startsWith('## ')) labelEl.textContent = 'Heading 2';
      else if (line.text.startsWith('# ')) labelEl.textContent = 'Heading 1';
      else if (line.text.startsWith('> ')) labelEl.textContent = 'Quote';
      else labelEl.textContent = 'Text';
    }
  }

  hide() {
    if (this.el) {
      this.el.style.display = 'none';
      const menu = this.el.querySelector('#bubbleBlockMenu');
      if (menu) menu.style.display = 'none';
      this.blockDropdownOpen = false;
    }
  }
}
