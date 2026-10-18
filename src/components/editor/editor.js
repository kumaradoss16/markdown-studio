import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { documentStateManager } from '../../core/document-state-manager.js';
import { saveCoordinator } from '../../core/save-coordinator.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class EditorComponent {
  constructor(container) {
    this.container = container;
    this.view = null;
    this.showLineNumbers = true;
    this.rawMode = false;
    this.currentDocId = null;
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
          <button class="tool-btn" id="toolH1" title="Heading 1">H1</button>
          <button class="tool-btn" id="toolH2" title="Heading 2">H2</button>
          <div class="tool-separator"></div>
          <button class="tool-btn" id="toolBold" title="Bold (⌘B)">B</button>
          <button class="tool-btn" id="toolItalic" title="Italic (⌘I)">I</button>
          <button class="tool-btn" id="toolStrike" title="Strikethrough">T</button>
          <button class="tool-btn" id="toolCode" title="Code">&lt;&gt;</button>
          <button class="tool-btn" id="toolWiki" title="Wiki Link">[[ ]]</button>
          <button class="tool-btn" id="toolAttach" title="Attachment">📎</button>
          <div class="tool-separator"></div>
          <button class="tool-btn" id="toolTOC" title="Insert / Manage Table of Contents" style="color: var(--color-accent-cyan); font-weight: 600;">📑 TOC</button>
          <button class="tool-btn" id="toolTemplates" title="Technical Documentation Templates" style="color: var(--color-accent-purple); font-weight: 600;">📋 Templates</button>
        </div>
        <div class="editor-tools-group">
          <button class="tool-btn" id="toolSource" title="Source Mode">Source</button>
          <button class="tool-btn active" id="toolSplit" title="Dual Split View">Split</button>
          <button class="tool-btn" id="toolFind" title="Find in document (⌘F)">🔍</button>
          <button class="tool-btn ${this.showLineNumbers ? 'active' : ''}" id="toolLN" title="Toggle Line Numbers">≡ LN</button>
          <button class="tool-btn ${this.rawMode ? 'active' : ''}" id="toolRaw" title="Raw Markdown">RAW .MD</button>
        </div>
      </div>
      <div class="cm-host" id="cmHost"></div>
    `;

    this.attachToolbarEvents();
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
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          eventBus.emit(AppEvents.CURSOR_CHANGED, {
            line: line.number,
            col: pos - line.from + 1,
          });
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
    this.container.querySelector('#toolH1')?.addEventListener('click', () => this.insertText('# '));
    this.container.querySelector('#toolH2')?.addEventListener('click', () => this.insertText('## '));
    this.container.querySelector('#toolBold')?.addEventListener('click', () => this.insertText('**', '**'));
    this.container.querySelector('#toolItalic')?.addEventListener('click', () => this.insertText('*', '*'));
    this.container.querySelector('#toolStrike')?.addEventListener('click', () => this.insertText('~~', '~~'));
    this.container.querySelector('#toolCode')?.addEventListener('click', () => this.insertText('`', '`'));
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
  }
}
