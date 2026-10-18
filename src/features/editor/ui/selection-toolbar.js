import { toggleInlineFormat, clearFormatting, applyBlockFormat, applyTextColor } from '../commands/formatting.js';

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
    this.colorPaletteOpen = false;
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
        <button class="floating-block-trigger" id="bubbleBlockTrigger" title="Block Type" type="button">
          <span id="bubbleBlockLabel">Text</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="floating-block-menu" id="bubbleBlockMenu" style="display: none;">
          <div class="floating-block-option" data-block="text">Text (Body)</div>
          <div class="floating-block-option" data-block="h1">Heading 1</div>
          <div class="floating-block-option" data-block="h2">Heading 2</div>
          <div class="floating-block-option" data-block="h3">Heading 3</div>
          <div class="floating-block-option" data-block="h4">Heading 4</div>
          <div class="floating-block-option" data-block="quote">Quote</div>
          <div class="floating-block-option" data-block="code-block">Code Block</div>
          <div class="floating-block-option" data-block="callout-note">Callout Note</div>
          <div class="floating-block-option" data-block="equation-block">Block Equation</div>
        </div>
      </div>

      <div class="floating-format-separator"></div>

      <!-- Inline Formatting Controls -->
      <button class="floating-format-btn" data-action="bold" title="Bold (Ctrl+B)" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="italic" title="Italic (Ctrl+I)" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="4" x2="10" y2="4"></line>
          <line x1="14" y1="20" x2="5" y2="20"></line>
          <line x1="15" y1="4" x2="9" y2="20"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="underline" title="Underline (Ctrl+U)" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path>
          <line x1="4" y1="21" x2="20" y2="21"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="strike" title="Strikethrough (Ctrl+Shift+X)" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4H9a3 3 0 0 0-2.83 4"></path>
          <path d="M14 12v4a3 3 0 0 1-3 3H8"></path>
          <line x1="4" y1="12" x2="20" y2="12"></line>
        </svg>
      </button>

      <button class="floating-format-btn" data-action="code" title="Inline Code (Ctrl+E)" type="button">
        <span style="font-family: var(--font-toolbar-mono, monospace); font-size: 11px; font-weight: 700;">&lt;/&gt;</span>
      </button>

      <button class="floating-format-btn" data-action="math" title="Inline Math ($)" type="button">
        <span style="font-family: var(--font-toolbar-mono, monospace); font-weight: 700; font-size: 12px;">√x</span>
      </button>

      <!-- Text Color Picker Trigger & Popover -->
      <div class="floating-color-picker" id="bubbleColorContainer">
        <button class="floating-format-btn" id="bubbleColorBtn" title="Text Color" type="button">
          <div class="color-indicator-icon">
            <span style="font-size: 12px; font-weight: 700; font-family: serif; line-height: 1;">A</span>
            <span class="color-underline-bar"></span>
          </div>
        </button>
        <div class="color-palette-popover" id="bubbleColorPalette" style="display: none;">
          <div class="color-swatch" data-color="#EF4444" style="background: #EF4444;" title="Red"></div>
          <div class="color-swatch" data-color="#F59E0B" style="background: #F59E0B;" title="Amber"></div>
          <div class="color-swatch" data-color="#10B981" style="background: #10B981;" title="Emerald"></div>
          <div class="color-swatch" data-color="#38BDF8" style="background: #38BDF8;" title="Cyan"></div>
          <div class="color-swatch" data-color="#818CF8" style="background: #818CF8;" title="Indigo"></div>
          <div class="color-swatch" data-color="#EC4899" style="background: #EC4899;" title="Pink"></div>
          <div class="color-swatch" data-color="#F1F5F9" style="background: #F1F5F9;" title="White"></div>
        </div>
      </div>

      <button class="floating-format-btn" data-action="clear" title="Clear Formatting (Tx)" type="button">
        <span style="font-family: var(--font-toolbar-ui, sans-serif); font-size: 11px; font-weight: 700; color: #9CA3AF;">T<sub style="font-size: 8px;">x</sub></span>
      </button>

      <div class="floating-format-separator"></div>

      <button class="floating-format-btn" data-action="link" title="Insert Link" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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
      this.closeColorPalette();
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

    // Handle color picker toggle
    const colorBtn = toolbar.querySelector('#bubbleColorBtn');
    const colorPalette = toolbar.querySelector('#bubbleColorPalette');
    colorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeBlockDropdown();
      this.colorPaletteOpen = !this.colorPaletteOpen;
      colorPalette.style.display = this.colorPaletteOpen ? 'flex' : 'none';
    });

    // Handle color swatches
    toolbar.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = swatch.getAttribute('data-color');
        if (this.editor.view) {
          applyTextColor(this.editor.view, color);
        }
        this.closeColorPalette();
        this.hide();
      });
    });

    // Handle inline formatting actions
    toolbar.querySelectorAll('.floating-format-btn[data-action]').forEach(btn => {
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

  closeBlockDropdown() {
    if (this.el) {
      const menu = this.el.querySelector('#bubbleBlockMenu');
      if (menu) menu.style.display = 'none';
    }
    this.blockDropdownOpen = false;
  }

  closeColorPalette() {
    if (this.el) {
      const palette = this.el.querySelector('#bubbleColorPalette');
      if (palette) palette.style.display = 'none';
    }
    this.colorPaletteOpen = false;
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

    const toolbarWidth = 360;
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
      else if (line.text.startsWith('> [!NOTE]')) labelEl.textContent = 'Callout Note';
      else if (line.text.startsWith('> ')) labelEl.textContent = 'Quote';
      else if (line.text.startsWith('```')) labelEl.textContent = 'Code Block';
      else if (line.text.startsWith('$$')) labelEl.textContent = 'Equation';
      else labelEl.textContent = 'Text';
    }
  }

  hide() {
    if (this.el) {
      this.el.style.display = 'none';
      this.closeBlockDropdown();
      this.closeColorPalette();
    }
  }
}
