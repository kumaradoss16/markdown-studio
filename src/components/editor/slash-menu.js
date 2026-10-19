import { SelectionToolbar } from '../../features/editor/ui/selection-toolbar.js';
import { applyBlockFormat } from '../../features/editor/commands/formatting.js';

/**
 * Block & Slash Command definitions and controller for CodeMirror 6.
 */

export const SLASH_COMMANDS = [
  // Basic Blocks
  {
    category: 'Basic Blocks',
    id: 'text',
    title: 'Text / Body',
    desc: 'Plain paragraph text without heading or quote prefixes',
    icon: '¶',
    snippet: '',
    shortcut: 'Ctrl+0'
  },

  // Headings
  {
    category: 'Headings',
    id: 'h1',
    title: 'Heading 1',
    desc: 'Large primary document title or section',
    icon: 'H1',
    snippet: '# ',
    shortcut: '#'
  },
  {
    category: 'Headings',
    id: 'h2',
    title: 'Heading 2',
    desc: 'Medium subsection header',
    icon: 'H2',
    snippet: '## ',
    shortcut: '##'
  },
  {
    category: 'Headings',
    id: 'h3',
    title: 'Heading 3',
    desc: 'Small subsection header',
    icon: 'H3',
    snippet: '### ',
    shortcut: '###'
  },
  {
    category: 'Headings',
    id: 'h4',
    title: 'Heading 4',
    desc: 'Compact sub-header or paragraph title',
    icon: 'H4',
    snippet: '#### ',
    shortcut: '####'
  },

  // Lists & Tasks
  {
    category: 'Lists & Tasks',
    id: 'bullet-list',
    title: 'Bulleted List',
    desc: 'Create an unordered bulleted list',
    icon: '•',
    snippet: '- ',
    shortcut: '-'
  },
  {
    category: 'Lists & Tasks',
    id: 'numbered-list',
    title: 'Numbered List',
    desc: 'Create an ordered sequential list',
    icon: '1.',
    snippet: '1. ',
    shortcut: '1.'
  },
  {
    category: 'Lists & Tasks',
    id: 'todo-list',
    title: 'To-do Task List',
    desc: 'Interactive markdown checklist task item',
    icon: '☑',
    snippet: '- [ ] ',
    shortcut: '[]'
  },
  {
    category: 'Lists & Tasks',
    id: 'toggle-list',
    title: 'Toggle List',
    desc: 'Collapsible accordion section using HTML5 details',
    icon: '▶',
    snippet: '<details>\n<summary>Toggle Section</summary>\n\nDetailed content goes here...\n</details>\n'
  },

  // Blocks & Callouts
  {
    category: 'Blocks & Callouts',
    id: 'blockquote',
    title: 'Quote / Blockquote',
    desc: 'Capture a quote or reference excerpt',
    icon: '❝',
    snippet: '> ',
    shortcut: '>'
  },
  {
    category: 'Blocks & Callouts',
    id: 'code-block',
    title: 'Fenced Code Block',
    desc: 'Syntax highlighted code container',
    icon: '</>',
    snippet: '```javascript\n// Write code here\nconsole.log("MarkForge");\n```\n',
    shortcut: '```'
  },
  {
    category: 'Blocks & Callouts',
    id: 'callout-note',
    title: 'Callout Block (Note)',
    desc: 'Highlighted informational callout banner',
    icon: '💡',
    snippet: '> [!NOTE]\n> Important operational note or instruction.\n'
  },
  {
    category: 'Blocks & Callouts',
    id: 'equation-block',
    title: 'Block Equation (LaTeX)',
    desc: 'Display centered mathematical formula',
    icon: '∑',
    snippet: '$$\n\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)\n$$\n',
    shortcut: '$$'
  },
  {
    category: 'Blocks & Callouts',
    id: 'synced-block',
    title: 'Synced Block',
    desc: 'Reusable component container with boundary markers',
    icon: '⟳',
    snippet: '<!-- SYNCED_BLOCK_START -->\n**Synced Content:** Shared workspace component\n<!-- SYNCED_BLOCK_END -->\n'
  },
  {
    category: 'Blocks & Callouts',
    id: 'multi-column',
    title: 'Multi-column Layout',
    desc: 'Responsive 2-column side-by-side CSS grid snippet',
    icon: '◫',
    snippet: '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">\n  <div>\n    <h3>Column 1</h3>\n    <p>Left column content.</p>\n  </div>\n  <div>\n    <h3>Column 2</h3>\n    <p>Right column content.</p>\n  </div>\n</div>\n'
  }
];

/**
 * Controller for the Slash Command Menu and Floating Selection Toolbar.
 */
export class EditorCommandMenuController {
  constructor(editorComponent) {
    this.editor = editorComponent;
    this.selectionToolbar = new SelectionToolbar(editorComponent);
    this.menuEl = null;
    this.slashQuery = '';
    this.slashPos = -1;
    this.selectedIndex = 0;
    this.filteredCommands = [...SLASH_COMMANDS];
  }

  /**
   * Initializes event listeners on the CodeMirror DOM container.
   */
  attach(cmHost) {
    this.cmHost = cmHost;
    this.selectionToolbar.attach(cmHost);

    // Listen for keydown for slash navigation
    cmHost.addEventListener('keydown', (e) => {
      if (this.isMenuOpen()) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveSelection(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveSelection(-1);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.executeSelected();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeMenu();
          return;
        }
      }
    }, true);

    // Close on click outside
    document.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target)) {
        this.closeMenu();
      }
    });
  }

  isMenuOpen() {
    return Boolean(this.menuEl && this.menuEl.style.display !== 'none');
  }

  /**
   * Handles text updates to detect slash command `/`.
   */
  handleTextUpdate(view) {
    if (!view) return;
    const { head } = view.state.selection.main;
    const line = view.state.doc.lineAt(head);
    const textBeforeCursor = line.text.slice(0, head - line.from);

    // Look for slash trigger preceded by start-of-line or whitespace
    const slashMatch = textBeforeCursor.match(/(^|\s)\/([a-zA-Z0-9-]*)$/);

    if (slashMatch) {
      const matchPrefix = slashMatch[1];
      this.slashQuery = slashMatch[2].toLowerCase();
      this.slashPos = line.from + textBeforeCursor.length - slashMatch[0].length + matchPrefix.length;
      this.selectionToolbar.hide();
      this.showMenu(view);
    } else if (this.isMenuOpen()) {
      this.closeMenu();
    }
  }

  /**
   * Handles selection changes to show or hide the floating format toolbar.
   */
  handleSelectionUpdate(view) {
    if (!view) return;
    const { from, to } = view.state.selection.main;

    if (from !== to && !this.isMenuOpen()) {
      this.selectionToolbar.show(view, from, to);
    } else {
      this.selectionToolbar.hide();
    }
  }

  /**
   * Displays the slash command palette positioned below the cursor.
   */
  showMenu(view) {
    if (!this.menuEl) {
      this.menuEl = document.createElement('div');
      this.menuEl.className = 'slash-command-menu';
      this.cmHost.appendChild(this.menuEl);
    }

    this.filterCommands();
    this.renderMenu();

    const { head } = view.state.selection.main;
    const coords = view.coordsAtPos(head);
    if (!coords) return;

    const hostRect = this.cmHost.getBoundingClientRect();
    const left = Math.max(10, Math.min(hostRect.width - 330, coords.left - hostRect.left));
    const top = Math.min(hostRect.height - 350, coords.bottom - hostRect.top + 6);

    this.menuEl.style.left = `${left}px`;
    this.menuEl.style.top = `${top}px`;
    this.menuEl.style.display = 'flex';
  }

  filterCommands() {
    if (!this.slashQuery) {
      this.filteredCommands = [...SLASH_COMMANDS];
    } else {
      this.filteredCommands = SLASH_COMMANDS.filter(cmd =>
        cmd.title.toLowerCase().includes(this.slashQuery) ||
        cmd.desc.toLowerCase().includes(this.slashQuery) ||
        cmd.id.includes(this.slashQuery)
      );
    }
    this.selectedIndex = 0;
  }

  renderMenu() {
    if (!this.menuEl) return;

    if (this.filteredCommands.length === 0) {
      this.menuEl.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--color-text-muted); font-size: 12px;">
          No matching blocks for "/${this.slashQuery}"
        </div>
      `;
      return;
    }

    let html = `
      <div class="slash-search-container">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span class="slash-search-badge">/${this.slashQuery}</span>
      </div>
      <div class="slash-menu-list">
    `;

    let currentCategory = '';
    this.filteredCommands.forEach((cmd, idx) => {
      if (cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        html += `<div class="slash-menu-category">${currentCategory}</div>`;
      }

      const isSelected = idx === this.selectedIndex;
      html += `
        <div class="slash-menu-item ${isSelected ? 'active' : ''}" data-index="${idx}">
          <div class="slash-item-icon">${cmd.icon}</div>
          <div class="slash-item-info">
            <div class="slash-item-title">
              <span>${cmd.title}</span>
              ${cmd.shortcut ? `<span class="slash-item-shortcut">${cmd.shortcut}</span>` : ''}
            </div>
            <div class="slash-item-desc">${cmd.desc}</div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.menuEl.innerHTML = html;

    // Attach click handlers
    this.menuEl.querySelectorAll('.slash-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-index'), 10);
        this.selectedIndex = idx;
        this.executeSelected();
      });
    });
  }

  moveSelection(delta) {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.filteredCommands.length) % this.filteredCommands.length;
    this.renderMenu();

    const activeItem = this.menuEl.querySelector('.slash-menu-item.active');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }

  executeSelected() {
    const cmd = this.filteredCommands[this.selectedIndex];
    if (!cmd) return;

    const view = this.editor.view;
    if (!view) return;

    const { head } = view.state.selection.main;
    const from = this.slashPos;
    const to = head;

    // Block-level transformation commands
    if (cmd.id === 'text' || cmd.id === 'h1' || cmd.id === 'h2' || cmd.id === 'h3' || cmd.id === 'h4' || cmd.id === 'blockquote') {
      // Remove slash query
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
      });
      const blockType = cmd.id === 'blockquote' ? 'quote' : cmd.id;
      applyBlockFormat(view, blockType);
    } else {
      view.dispatch({
        changes: { from, to, insert: cmd.snippet },
        selection: { anchor: from + cmd.snippet.length }
      });
      view.focus();
    }

    this.closeMenu();
  }

  closeMenu() {
    if (this.menuEl) {
      this.menuEl.style.display = 'none';
    }
    this.slashQuery = '';
    this.slashPos = -1;
  }
}
