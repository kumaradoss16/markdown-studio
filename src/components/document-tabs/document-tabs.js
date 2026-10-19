import { documentStateManager, DocumentState } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class DocumentTabsComponent {
  constructor(container) {
    this.container = container;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_OPENED, () => this.render());
    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, () => this.render());
    eventBus.on(AppEvents.DOCUMENT_CLOSED, () => this.render());
    eventBus.on(AppEvents.DOCUMENT_SAVED, () => this.render());
    eventBus.on(AppEvents.DOCUMENT_DIRTY_STATE, () => this.render());
  }

  render() {
    const docs = documentStateManager.getOpenDocuments();
    const activeDoc = documentStateManager.getActiveDocument();

    this.container.innerHTML = `
      <div style="display: flex; align-items: center; width: 100%; height: 100%; overflow: hidden; position: relative;">
        <!-- Left scroll arrow button -->
        <button class="tab-arrow-btn" id="tabScrollLeft" title="Scroll tabs left" style="display: none; background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; padding: 2px 5px; font-size: 11px;">◀</button>
        
        <!-- Tab Scroll Area -->
        <div class="tabs-scroll-area" id="tabsScrollArea">
          ${docs.map(doc => {
            const isActive = activeDoc && activeDoc.id === doc.id;
            const isDirty = doc.state === DocumentState.DIRTY;
            return `
              <div class="doc-tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}" 
                   data-id="${doc.id}" 
                   draggable="true" 
                   role="tab"
                   aria-selected="${isActive ? 'true' : 'false'}"
                   title="${doc.path || doc.name} (Middle-click to close)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>${doc.name}</span>
                <span class="tab-dirty-indicator" title="Unsaved changes (Click ✕ on hover to close)"></span>
                <button class="tab-close-btn" data-close-id="${doc.id}" title="Close tab" aria-label="Close tab ${doc.name}">✕</button>
              </div>
            `;
          }).join('')}
          <button class="tab-add-btn" id="newTabBtn" title="New document (⌘N)" aria-label="Create new document">+</button>
        </div>

        <!-- Right scroll arrow button -->
        <button class="tab-arrow-btn" id="tabScrollRight" title="Scroll tabs right" aria-label="Scroll tabs right" style="display: none; background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; padding: 2px 5px; font-size: 11px;">▶</button>

        <!-- Tab actions -->
        <div class="tabs-actions" style="display: flex; align-items: center; gap: 4px; margin-left: 6px; padding-right: 4px; flex-shrink: 0;" role="toolbar" aria-label="Tab Bar Controls">
          <button class="header-btn" id="tabHistoryBtn" title="Document Revision History & Audit Trail (⌘H)" aria-label="Document Revision History">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button class="header-btn" id="tabSplitToggleBtn" title="Toggle Split View Mode (Horizontal / Vertical)" aria-label="Toggle Split Orientation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="3" x2="12" y2="21"/>
            </svg>
          </button>
          <button class="header-btn" id="tabMoreOptionsBtn" title="More Tab Options" aria-label="More tab options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="19" cy="12" r="1"/>
              <circle cx="5" cy="12" r="1"/>
            </svg>
          </button>
        </div>

      </div>
    `;

    this.attachEvents();
    this.checkScrollOverflow();

    // Auto-scroll active tab into view
    const activeEl = this.container.querySelector('.doc-tab.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }

  checkScrollOverflow() {
    const scrollArea = this.container.querySelector('#tabsScrollArea');
    const leftBtn = this.container.querySelector('#tabScrollLeft');
    const rightBtn = this.container.querySelector('#tabScrollRight');
    if (!scrollArea || !leftBtn || !rightBtn) return;

    const hasOverflow = scrollArea.scrollWidth > scrollArea.clientWidth;
    if (hasOverflow) {
      leftBtn.style.display = scrollArea.scrollLeft > 10 ? 'block' : 'none';
      rightBtn.style.display = (scrollArea.scrollWidth - scrollArea.scrollLeft - scrollArea.clientWidth) > 10 ? 'block' : 'none';
    } else {
      leftBtn.style.display = 'none';
      rightBtn.style.display = 'none';
    }
  }

  attachEvents() {
    const scrollArea = this.container.querySelector('#tabsScrollArea');

    // Horizontal wheel scroll translation (VS Code standard)
    if (scrollArea) {
      scrollArea.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          scrollArea.scrollLeft += e.deltaY;
          this.checkScrollOverflow();
        }
      }, { passive: false });

      scrollArea.addEventListener('scroll', () => {
        this.checkScrollOverflow();
      });
    }

    // Scroll arrow buttons
    this.container.querySelector('#tabScrollLeft')?.addEventListener('click', () => {
      if (scrollArea) {
        scrollArea.scrollBy({ left: -140, behavior: 'smooth' });
      }
    });

    this.container.querySelector('#tabScrollRight')?.addEventListener('click', () => {
      if (scrollArea) {
        scrollArea.scrollBy({ left: 140, behavior: 'smooth' });
      }
    });

    // Tab interactions
    let draggedTabId = null;

    this.container.querySelectorAll('.doc-tab').forEach(el => {
      const id = el.getAttribute('data-id');

      // Left click to switch active tab
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) return;
        documentStateManager.setActiveDocument(id);
      });

      // Middle click to close tab (VS Code standard)
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.triggerClose(id);
        }
      });

      // Drag and Drop Tab Reordering
      el.addEventListener('dragstart', (e) => {
        draggedTabId = id;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        this.container.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('drag-over'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedTabId && draggedTabId !== id) {
          el.classList.add('drag-over');
        }
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (draggedTabId && draggedTabId !== id) {
          documentStateManager.reorderDocument(draggedTabId, id);
        }
      });
    });

    // Close button click
    this.container.querySelectorAll('.tab-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-close-id');
        this.triggerClose(id);
      });
    });

    // Add tab button
    this.container.querySelector('#newTabBtn')?.addEventListener('click', () => {
      documentStateManager.createDocument('Untitled.md', '# Untitled\n\nStart writing here...');
    });

    // Tab Split Toggle button
    this.container.querySelector('#tabSplitToggleBtn')?.addEventListener('click', () => {
      const splitContainer = document.querySelector('#splitPaneContainer');
      if (splitContainer) {
        if (splitContainer.classList.contains('split-vertical')) {
          splitContainer.classList.remove('split-vertical');
          eventBus.emit(AppEvents.VIEW_MODE_CHANGED, 'DUAL SPLIT');
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: 'Switched to Horizontal Split' });
        } else {
          splitContainer.classList.remove('view-source', 'view-preview');
          splitContainer.classList.add('split-vertical');
          eventBus.emit(AppEvents.VIEW_MODE_CHANGED, 'SPLIT VERTICAL');
          eventBus.emit(AppEvents.NOTIFICATION, { type: 'info', message: 'Switched to Vertical Split' });
        }
      }
    });

    // Tab Revision History button
    this.container.querySelector('#tabHistoryBtn')?.addEventListener('click', () => {
      const active = documentStateManager.getActiveDocument();
      if (active) {
        eventBus.emit(AppEvents.HISTORY_OPEN_REQUESTED, { docId: active.id, filePath: active.path });
      }
    });

    // Tab More Options button
    this.container.querySelector('#tabMoreOptionsBtn')?.addEventListener('click', () => {
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'command-palette' });
    });
  }

  triggerClose(id) {
    const doc = documentStateManager.documents.get(id);
    if (!doc) return;

    if (doc.state === DocumentState.DIRTY) {
      eventBus.emit(AppEvents.DIALOG_OPEN, {
        type: 'confirm-close',
        docId: id,
        docName: doc.name,
      });
    } else {
      documentStateManager.closeDocument(id);
    }
  }
}
