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
      <div class="tabs-scroll-area">
        ${docs.map(doc => {
          const isActive = activeDoc && activeDoc.id === doc.id;
          const isDirty = doc.state === DocumentState.DIRTY;
          return `
            <div class="doc-tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}" data-id="${doc.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>${doc.name}</span>
              <span class="tab-dirty-indicator" title="Unsaved changes"></span>
              <button class="tab-close-btn" data-close-id="${doc.id}" title="Close tab">✕</button>
            </div>
          `;
        }).join('')}
        <button class="tab-add-btn" id="newTabBtn" title="New document (⌘N)">+</button>
      </div>

      <div class="tabs-actions" style="display: flex; align-items: center; gap: 4px;">
        <button class="header-btn" title="Split pane"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg></button>
        <button class="header-btn" title="More options"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Tab click
    this.container.querySelectorAll('.doc-tab').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) return;
        const id = el.getAttribute('data-id');
        documentStateManager.setActiveDocument(id);
      });
    });

    // Close button
    this.container.querySelectorAll('.tab-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-close-id');
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
      });
    });

    // Add tab button
    const addBtn = this.container.querySelector('#newTabBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        documentStateManager.createDocument('Untitled.md', '# Untitled\n\nStart writing here...');
      });
    }
  }
}
