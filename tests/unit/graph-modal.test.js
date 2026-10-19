import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphModalComponent } from '../../src/components/graph/graph-modal.js';
import { AppEvents, eventBus } from '../../src/app/events.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';

describe('GraphModalComponent', () => {
  beforeEach(() => {
    graphModalComponent.close();
    document.body.innerHTML = '';
    fileSystemService.virtualStorage.clear();
    documentStateManager.documents.clear();
    documentStateManager.activeDocumentId = null;
  });

  it('opens modal on GRAPH_OPEN_REQUESTED event and renders canvas and controls', async () => {
    fileSystemService.virtualStorage.set('Alpha.md', 'Link to [[Beta]]');
    fileSystemService.virtualStorage.set('Beta.md', 'Content');

    eventBus.emit(AppEvents.GRAPH_OPEN_REQUESTED);

    // Allow async buildGraph to complete
    await new Promise(r => setTimeout(r, 50));

    expect(graphModalComponent.isOpen()).toBe(true);
    const modalEl = document.querySelector('.graph-modal-backdrop');
    expect(modalEl).not.toBeNull();

    const canvas = modalEl.querySelector('#graphViewCanvas');
    expect(canvas).not.toBeNull();

    const searchInput = modalEl.querySelector('#graphSearchInput');
    expect(searchInput).not.toBeNull();

    const ghostToggle = modalEl.querySelector('#toggleGhostNotes');
    expect(ghostToggle).not.toBeNull();

    const fitBtn = modalEl.querySelector('#graphFitBtn');
    expect(fitBtn).not.toBeNull();

    graphModalComponent.close();
    expect(graphModalComponent.isOpen()).toBe(false);
  });

  it('closes on Escape key press or close button click', async () => {
    await graphModalComponent.show();
    expect(graphModalComponent.isOpen()).toBe(true);

    const closeBtn = document.querySelector('#graphCloseBtn');
    closeBtn.click();
    expect(graphModalComponent.isOpen()).toBe(false);

    await graphModalComponent.show();
    expect(graphModalComponent.isOpen()).toBe(true);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escEvent);
    expect(graphModalComponent.isOpen()).toBe(false);
  });

  it('handles regular note clicks by activating or opening the document', async () => {
    fileSystemService.virtualStorage.set('Note.md', '# Note content');
    const doc = documentStateManager.openDocument('Note.md', '# Note content', 'h1', 100);

    await graphModalComponent.show();

    // Trigger handleNodeClick with Note.md
    await graphModalComponent.handleNodeClick({
      id: 'Note.md',
      label: 'Note',
      path: 'Note.md',
      isGhost: false,
      isTag: false
    });

    expect(documentStateManager.getActiveDocument().id).toBe(doc.id);
    expect(graphModalComponent.isOpen()).toBe(false);
  });

  it('handles ghost note clicks by creating the note and opening it', async () => {
    await graphModalComponent.show();

    await graphModalComponent.handleNodeClick({
      id: 'ghost:NewFeature',
      label: 'NewFeature',
      path: 'ghost:NewFeature',
      isGhost: true,
      isTag: false
    });

    const openDocs = documentStateManager.getOpenDocuments();
    expect(openDocs.some(d => d.path.includes('NewFeature.md') || d.name.includes('NewFeature'))).toBe(true);
    expect(graphModalComponent.isOpen()).toBe(false);
  });
});
