import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
import { AppEvents, eventBus } from '../../app/events.js';
import { EditorCommandMenuController } from './slash-menu.js';
import { formattingKeymap, toggleInlineFormat, applyBlockFormat } from '../../features/editor/commands/formatting.js';

export class EditorComponent {
  constructor(container) {
    this.container = container;
    this.view = null;
    this.showLineNumbers = true;
    this.rawMode = false;
    this.currentDocId = null;
    this.commandController = new EditorCommandMenuController(this);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      this.loadDocument(doc);
    });
    eventBus.on(AppEvents.DOCUMENT_CLOSED, () => {
      const active = documentStateManager.getActiveDocument();
      this.loadDocument(active);
    });
    eventBus.on(AppEvents.EDITOR_JUMP_TO_LINE, ({ line, col }) => {
      this.jumpToLine(line, col);
    });
  }

  jumpToLine(lineNumber, colNumber = 1) {
    if (!this.view) return;
    const doc = this.view.state.doc;
    const validLine = Math.min(Math.max(1, lineNumber), doc.lines);
    const line = doc.line(validLine);
    const targetPos = Math.min(line.from + Math.max(0, colNumber - 1), line.to);
    this.view.dispatch({
      selection: { anchor: targetPos, head: targetPos },
      scrollIntoView: true
    });
    this.view.focus();
  }

  render() {
    this.container.innerHTML = `
      <div class="editor-header-toolbar">
        <div class="editor-tools-group">
          <button class="tool-btn" id="toolH1" title="Heading 1">
            <span class="tool-glyph">H<sub class="tool-sub">1</sub></span>
          </button>
          <button class="tool-btn" id="toolH2" title="Heading 2">
            <span class="tool-glyph">H<sub class="tool-sub">2</sub></span>
          </button>
          <div class="tool-separator"></div>
          <button class="tool-btn" id="toolBold" title="Bold (⌘B)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
              <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
            </svg>
          </button>
          <button class="tool-btn" id="toolItalic" title="Italic (⌘I)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="4" x2="10" y2="4"></line>
              <line x1="14" y1="20" x2="5" y2="20"></line>
              <line x1="15" y1="4" x2="9" y2="20"></line>
            </svg>
          </button>
          <button class="tool-btn" id="toolStrike" title="Strikethrough">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 4H9a3 3 0 0 0-2.83 4"></path>
              <path d="M14 12v4a3 3 0 0 1-3 3H8"></path>
              <line x1="4" y1="12" x2="20" y2="12"></line>
            </svg>
          </button>
          <button class="tool-btn" id="toolCode" title="Inline Code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </button>
          <button class="tool-btn" id="toolWiki" title="Wiki Link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3"></path>
              <path d="M17 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"></path>
              <path d="M10 8H9a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1"></path>
              <path d="M14 8h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1"></path>
            </svg>
          </button>
          <button class="tool-btn" id="toolAttach" title="Attachment">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <div class="tool-separator"></div>
          <button class="tool-btn tool-pill toc" id="toolTOC" title="Insert / Manage Table of Contents">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="21" y1="6" x2="3" y2="6"></line>
              <line x1="15" y1="12" x2="9" y2="12"></line>
              <line x1="19" y1="18" x2="7" y2="18"></line>
            </svg>
            <span>TOC</span>
          </button>
          <button class="tool-btn tool-pill templates" id="toolTemplates" title="Technical Documentation Templates">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18"></path>
              <path d="M9 21V9"></path>
            </svg>
            <span>Templates</span>
          </button>
        </div>
        <div class="editor-tools-group">
          <button class="tool-btn" id="toolSource" title="Source Mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span>Source</span>
          </button>
          <button class="tool-btn active" id="toolSplit" title="Dual Split View">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="12" y1="3" x2="12" y2="21"></line>
            </svg>
            <span>Split</span>
          </button>
          <button class="tool-btn" id="toolFind" title="Find in document (⌘F)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button class="tool-btn ${this.showLineNumbers ? 'active' : ''}" id="toolLN" title="Toggle Line Numbers">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"></line>
              <line x1="10" y1="12" x2="21" y2="12"></line>
              <line x1="10" y1="18" x2="21" y2="18"></line>
              <path d="M4 6h1v4"></path>
              <path d="M4 10h2"></path>
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path>
            </svg>
            <span class="tool-badge-text">LN</span>
          </button>
          <button class="tool-btn ${this.rawMode ? 'active' : ''}" id="toolRaw" title="Raw Markdown">
            <span class="tool-badge-text">RAW .MD</span>
          </button>
        </div>
      </div>
      <div class="cm-host" id="cmHost"></div>
    `;

    this.attachToolbarEvents();
    const cmHost = this.container.querySelector('#cmHost');
    if (cmHost) {
      this.commandController.attach(cmHost);
    }

    const activeDoc = documentStateManager.getActiveDocument();
    if (activeDoc) {
      this.loadDocument(activeDoc);
    }
  }

  createEditorState(initialText = '') {
    const extensions = [
      history(),
      search({ top: true }),
      oneDark,
      keymap.of([
        ...formattingKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        {
          key: 'Mod-s',
          run: () => {
            const active = documentStateManager.getActiveDocument();
            if (active) saveCoordinator.save(active.id);
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && this.currentDocId) {
          const newContent = update.state.doc.toString();
          documentStateManager.updateContent(this.currentDocId, newContent);
          this.commandController.handleTextUpdate(this.view);
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          eventBus.emit(AppEvents.CURSOR_CHANGED, {
            line: line.number,
            col: pos - line.from + 1,
          });
          this.commandController.handleSelectionUpdate(this.view);
        }
      }),
    ];

    if (!this.rawMode) {
      extensions.push(markdown());
    }

    if (this.showLineNumbers) {
      extensions.push(lineNumbers(), highlightActiveLineGutter(), highlightActiveLine());
    }

    return EditorState.create({
      doc: initialText,
      extensions,
    });
  }

  loadDocument(doc) {
    const cmHost = this.container.querySelector('#cmHost');
    if (!cmHost) return;

    if (!doc) {
      this.currentDocId = null;
      cmHost.innerHTML = '<div style="padding: 40px; color: var(--color-text-muted); text-align: center;">No document open</div>';
      if (this.view) {
        this.view.destroy();
        this.view = null;
      }
      return;
    }

    this.currentDocId = doc.id;
    const content = doc.content || '';

    if (this.view) {
      this.view.setState(this.createEditorState(content));
    } else {
      cmHost.innerHTML = '';
      this.view = new EditorView({
        state: this.createEditorState(content),
        parent: cmHost,
      });
    }
  }

  insertText(prefix, suffix = '') {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    const selected = this.view.state.sliceDoc(from, to);
    const replacement = `${prefix}${selected}${suffix}`;
    this.view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + prefix.length, head: to + prefix.length },
    });
    this.view.focus();
  }

  attachToolbarEvents() {
    this.container.querySelector('#toolH1')?.addEventListener('click', () => {
      if (this.view) applyBlockFormat(this.view, 'h1');
      else this.insertText('# ');
    });
    this.container.querySelector('#toolH2')?.addEventListener('click', () => {
      if (this.view) applyBlockFormat(this.view, 'h2');
      else this.insertText('## ');
    });
    this.container.querySelector('#toolBold')?.addEventListener('click', () => {
      if (this.view) toggleInlineFormat(this.view, 'bold');
      else this.insertText('**', '**');
    });
    this.container.querySelector('#toolItalic')?.addEventListener('click', () => {
      if (this.view) toggleInlineFormat(this.view, 'italic');
      else this.insertText('*', '*');
    });
    this.container.querySelector('#toolStrike')?.addEventListener('click', () => {
      if (this.view) toggleInlineFormat(this.view, 'strike');
      else this.insertText('~~', '~~');
    });
    this.container.querySelector('#toolCode')?.addEventListener('click', () => {
      if (this.view) toggleInlineFormat(this.view, 'code');
      else this.insertText('`', '`');
    });
    this.container.querySelector('#toolWiki')?.addEventListener('click', () => this.insertText('[[', ']]'));
    this.container.querySelector('#toolAttach')?.addEventListener('click', () => this.insertText('![[', ']]'));

    this.container.querySelector('#toolTOC')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'toc' });
    });

    this.container.querySelector('#toolTemplates')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'templates' });
    });

    this.container.querySelector('#toolFind')?.addEventListener('click', () => {
      if (this.view) openSearchPanel(this.view);
    });

    this.container.querySelector('#toolLN')?.addEventListener('click', (e) => {
      this.showLineNumbers = !this.showLineNumbers;
      e.currentTarget.classList.toggle('active', this.showLineNumbers);
      const active = documentStateManager.getActiveDocument();
      if (active) this.loadDocument(active);
    });

    this.container.querySelector('#toolRaw')?.addEventListener('click', (e) => {
      this.rawMode = !this.rawMode;
      e.currentTarget.classList.toggle('active', this.rawMode);
      const active = documentStateManager.getActiveDocument();
      if (active) this.loadDocument(active);
    });

    this.container.querySelector('#toolSource')?.addEventListener('click', () => {
      document.querySelector('#modeSourceBtn')?.click();
    });

    this.container.querySelector('#toolSplit')?.addEventListener('click', () => {
      document.querySelector('#modeSplitHBtn')?.click();
    });

    eventBus.on(AppEvents.VIEW_MODE_CHANGED, (mode) => {
      const sourceBtn = this.container.querySelector('#toolSource');
      const splitBtn = this.container.querySelector('#toolSplit');
      if (sourceBtn) sourceBtn.classList.toggle('active', mode === 'SOURCE');
      if (splitBtn) splitBtn.classList.toggle('active', mode === 'DUAL SPLIT' || mode === 'SPLIT VERTICAL');
    });
  }
}
