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
import { remoteDraftService } from '../../services/remote-draft-service.js';
import { revisionComparisonService } from '../../services/revision-comparison-service.js';
import { publicationCoordinator } from '../../services/publication-coordinator.js';
import { workspaceStore } from '../../services/workspace-store.js';
import { diffModalComponent } from '../github/diff-modal.js';
import '../github/publish-modal.js';

export class EditorComponent {
  constructor(container) {
    this.container = container;
    this.view = null;
    const settings = workspaceStore.getSettings();
    this.showLineNumbers = settings.showLineNumbers !== undefined ? settings.showLineNumbers : true;
    this.wordWrap = settings.wordWrap !== undefined ? settings.wordWrap : true;
    this.syncScroll = settings.syncScroll !== undefined ? Boolean(settings.syncScroll) : false;
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
    eventBus.on(AppEvents.GITHUB_DRAFT_REFRESHED, () => {
      const active = documentStateManager.getActiveDocument();
      this.updateRemoteBanner(active);
    });
    eventBus.on(AppEvents.SETTINGS_CHANGED, (settings) => {
      this.applySettings(settings);
    });
    eventBus.on(AppEvents.SYNC_SCROLL_TOGGLED, ({ enabled }) => {
      this.syncScroll = Boolean(enabled);
      this.updateSyncScrollUI(this.syncScroll);
    });
  }

  applySettings(settings) {
    if (!settings) return;
    if (settings.showLineNumbers !== undefined) {
      this.showLineNumbers = Boolean(settings.showLineNumbers);
    }
    if (settings.wordWrap !== undefined) {
      this.wordWrap = Boolean(settings.wordWrap);
    }
    if (settings.syncScroll !== undefined) {
      this.syncScroll = Boolean(settings.syncScroll);
      this.updateSyncScrollUI(this.syncScroll);
    }
    const active = documentStateManager.getActiveDocument();
    if (active && this.view) {
      const scrollPos = this.view.scrollDOM?.scrollTop;
      this.view.setState(this.createEditorState(active.content || ''));
      if (this.view.scrollDOM && scrollPos !== undefined) {
        this.view.scrollDOM.scrollTop = scrollPos;
      }
    }
  }

  updateSyncScrollUI(enabled) {
    const btn = this.container.querySelector('#toolSyncScroll');
    if (!btn) return;
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled
      ? 'Synchronized Scrolling: ON (Click to decouple panes)'
      : 'Synchronized Scrolling: OFF (Click to link scrolling)';
    const linkIcon = btn.querySelector('.sync-icon-link');
    const unlinkIcon = btn.querySelector('.sync-icon-unlink');
    if (linkIcon) linkIcon.style.display = enabled ? '' : 'none';
    if (unlinkIcon) unlinkIcon.style.display = enabled ? 'none' : '';
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
        <div class="editor-tools-group" role="toolbar" aria-label="Text Formatting Tools">
          <button class="tool-btn" id="toolH1" title="Heading 1" aria-label="Heading 1">
            <span class="tool-glyph">H<sub class="tool-sub">1</sub></span>
          </button>
          <button class="tool-btn" id="toolH2" title="Heading 2" aria-label="Heading 2">
            <span class="tool-glyph">H<sub class="tool-sub">2</sub></span>
          </button>
          <div class="tool-separator"></div>
          <button class="tool-btn" id="toolBold" title="Bold (⌘B)" aria-label="Bold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
              <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
            </svg>
          </button>
          <button class="tool-btn" id="toolItalic" title="Italic (⌘I)" aria-label="Italic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="4" x2="10" y2="4"></line>
              <line x1="14" y1="20" x2="5" y2="20"></line>
              <line x1="15" y1="4" x2="9" y2="20"></line>
            </svg>
          </button>
          <button class="tool-btn" id="toolStrike" title="Strikethrough" aria-label="Strikethrough">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 4H9a3 3 0 0 0-2.83 4"></path>
              <path d="M14 12v4a3 3 0 0 1-3 3H8"></path>
              <line x1="4" y1="12" x2="20" y2="12"></line>
            </svg>
          </button>
          <button class="tool-btn" id="toolCode" title="Inline Code" aria-label="Inline Code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </button>
          <button class="tool-btn" id="toolWiki" title="Wiki Link" aria-label="Wiki Link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </button>
          <button class="tool-btn" id="toolAttach" title="Attachment" aria-label="Attach File">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <button class="tool-btn" id="toolRichPaste" title="Rich Paste & Visual Import (⇧⌘V)" aria-label="Rich Paste">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </button>
          <div class="tool-separator"></div>
          <button class="tool-btn tool-pill toc" id="toolTOC" title="Insert / Manage Table of Contents" aria-label="Table of Contents">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="21" y1="6" x2="3" y2="6"></line>
              <line x1="15" y1="12" x2="9" y2="12"></line>
              <line x1="19" y1="18" x2="7" y2="18"></line>
            </svg>
            <span>TOC</span>
          </button>
          <button class="tool-btn tool-pill templates" id="toolTemplates" title="Technical Documentation Templates" aria-label="Document Templates">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18"></path>
              <path d="M9 21V9"></path>
            </svg>
            <span>Templates</span>
          </button>
        </div>
        <div class="editor-tools-group" role="toolbar" aria-label="Editor View and Navigation Controls">
          <button class="tool-btn" id="toolSource" title="Source Mode" aria-label="Source Mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span>Source</span>
          </button>
          <button class="tool-btn active" id="toolSplit" title="Dual Split View" aria-label="Dual Split Mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="12" y1="3" x2="12" y2="21"></line>
            </svg>
            <span>Split</span>
          </button>
          <button class="tool-btn ${this.syncScroll ? 'active' : ''}" id="toolSyncScroll" title="${this.syncScroll ? 'Synchronized Scrolling: ON (Click to decouple panes)' : 'Synchronized Scrolling: OFF (Click to link scrolling)'}" aria-label="Toggle Synchronized Scrolling" aria-pressed="${this.syncScroll}">
            <svg class="sync-icon-link" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="${this.syncScroll ? '' : 'display:none;'}">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <svg class="sync-icon-unlink" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="${this.syncScroll ? 'display:none;' : ''}">
              <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"></path>
              <line x1="2" y1="2" x2="22" y2="22"></line>
            </svg>
            <span>Sync</span>
          </button>
          <button class="tool-btn" id="toolFind" title="Find in document (⌘F)" aria-label="Find in Document">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button class="tool-btn ${this.showLineNumbers ? 'active' : ''}" id="toolLN" title="Toggle Line Numbers" aria-label="Toggle Line Numbers">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="10" y1="6" x2="21" y2="6"></line>
              <line x1="10" y1="12" x2="21" y2="12"></line>
              <line x1="10" y1="18" x2="21" y2="18"></line>
              <path d="M4 6h1v4"></path>
              <path d="M4 10h2"></path>
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path>
            </svg>
            <span class="tool-badge-text">LN</span>
          </button>
          <button class="tool-btn ${this.rawMode ? 'active' : ''}" id="toolRaw" title="Raw Markdown" aria-label="Toggle Raw Markdown">
            <span class="tool-badge-text">RAW .MD</span>
          </button>
        </div>
      </div>
      <div id="editorRemoteDraftBanner" class="remote-draft-banner" style="display: none;"></div>

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
        {
          key: 'Mod-Shift-v',
          run: (view) => {
            eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'rich-paste', view });
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

    if (this.wordWrap) {
      extensions.push(EditorView.lineWrapping);
    }

    const tabSize = workspaceStore.getSettings().tabSize || 2;
    extensions.push(EditorState.tabSize.of(tabSize));

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
      cmHost.innerHTML = `
        <div class="editor-empty-state">
          <div class="empty-state-card">
            <div class="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #38BDF8)" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            </div>
            <h3>No Document Open</h3>
            <p>Create a new document or open an existing file to start writing.</p>
            <div class="empty-state-actions">
              <button class="empty-action-btn primary" id="emptyStateNewDocBtn" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>New Document</span>
              </button>
            </div>
          </div>
        </div>
      `;
      cmHost.querySelector('#emptyStateNewDocBtn')?.addEventListener('click', () => {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file' });
      });
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

    this.updateRemoteBanner(doc);
  }

  updateRemoteBanner(doc) {
    const banner = this.container.querySelector('#editorRemoteDraftBanner');
    if (!banner) return;

    if (!doc || !remoteDraftService.isRemoteDraft(doc)) {
      banner.style.display = 'none';
      return;
    }

    const meta = doc.remoteMetadata;
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="remote-draft-provenance">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
        </svg>
        <span class="remote-badge-repo">${meta.owner}/${meta.repo}</span>
        <span class="remote-badge-branch">${meta.branch}</span>
        <span class="remote-badge-commit">base: ${meta.baseCommitSha.slice(0, 7)}</span>
      </div>
      <div class="remote-draft-actions">
        <span class="remote-status-badge ${meta.relationshipState.toLowerCase()}">
          ${meta.relationshipState.replace(/_/g, ' ')}
        </span>
        <button class="remote-banner-btn" id="remoteRefreshBtn" title="Fetch latest remote revision and compare">
          ↻ Refresh
        </button>
        <button class="remote-banner-btn" id="remoteDiffBtn" title="Inspect 3-way differences and stale base status">
          ⇄ Diff
        </button>
        <button class="remote-banner-btn publish" id="remotePublishBtn" title="Publish reviewed changes to GitHub">
          ⬆ Publish
        </button>
      </div>
    `;

    banner.querySelector('#remoteRefreshBtn')?.addEventListener('click', async () => {
      try {
        const comp = await revisionComparisonService.refreshDraft(doc.id);
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'info',
          message: `Refreshed remote status: ${comp.classification}`,
        });
      } catch (err) {
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'error',
          message: `Refresh failed: ${err.message}`,
        });
      }
    });

    banner.querySelector('#remoteDiffBtn')?.addEventListener('click', async () => {
      try {
        const comp = await revisionComparisonService.refreshDraft(doc.id);
        eventBus.emit(AppEvents.GITHUB_DIFF_REQUESTED, { doc, comparison: comp });
      } catch (err) {
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'error',
          message: `Could not compare revisions: ${err.message}`,
        });
      }
    });

    banner.querySelector('#remotePublishBtn')?.addEventListener('click', async () => {
      try {
        const pubBtn = banner.querySelector('#remotePublishBtn');
        if (pubBtn) {
          pubBtn.disabled = true;
          pubBtn.textContent = '...';
        }
        const result = await publicationCoordinator.startPublication(doc.id);
        if (pubBtn) {
          pubBtn.disabled = false;
          pubBtn.textContent = '⬆ Publish';
        }

        if (result.isStaleBase) {
          eventBus.emit(AppEvents.NOTIFICATION, {
            type: 'warning',
            message: `Stale base detected: ${result.details?.staleReason || 'Remote branch moved'}. Open Diff to resolve.`,
          });
          const comp = await revisionComparisonService.refreshDraft(doc.id);
          diffModalComponent.show(doc, comp);
          return;
        }

        if (result.success && result.snapshot) {
          eventBus.emit('publication:open_review', {
            doc,
            snapshot: result.snapshot,
            attemptId: result.attemptId,
          });
        }
      } catch (err) {
        const pubBtn = banner.querySelector('#remotePublishBtn');
        if (pubBtn) {
          pubBtn.disabled = false;
          pubBtn.textContent = '⬆ Publish';
        }
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'error',
          message: `Publication preflight failed: ${err.message}`,
        });
      }
    });
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
    this.container.querySelector('#toolRichPaste')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'rich-paste', view: this.view });
    });

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

    this.container.querySelector('#toolSyncScroll')?.addEventListener('click', () => {
      const current = workspaceStore.getSettings().syncScroll === true;
      const next = !current;
      workspaceStore.saveSettings({ syncScroll: next });
      this.syncScroll = next;
      this.updateSyncScrollUI(next);
      eventBus.emit(AppEvents.SETTINGS_CHANGED, { syncScroll: next });
      eventBus.emit(AppEvents.SYNC_SCROLL_TOGGLED, { enabled: next });
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: next ? 'Synchronized scrolling enabled' : 'Independent scrolling enabled (Panes decoupled)'
      });
    });

    eventBus.on(AppEvents.VIEW_MODE_CHANGED, (mode) => {
      const sourceBtn = this.container.querySelector('#toolSource');
      const splitBtn = this.container.querySelector('#toolSplit');
      if (sourceBtn) sourceBtn.classList.toggle('active', mode === 'SOURCE');
      if (splitBtn) splitBtn.classList.toggle('active', mode === 'DUAL SPLIT' || mode === 'SPLIT VERTICAL');
    });
  }
}
