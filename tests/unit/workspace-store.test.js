import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceStore, DEFAULT_SETTINGS } from '../../src/services/workspace-store.js';
import { documentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';

describe('WorkspaceStore Engine', () => {
  let store;

  beforeEach(() => {
    localStorage.clear();
    documentStateManager.documents.clear();
    documentStateManager.activeDocumentId = null;
    store = new WorkspaceStore();
  });

  it('provides default settings when nothing is persisted', () => {
    const settings = store.getSettings();
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.tabSize).toBe(2);
    expect(settings.splitRatio).toBe(50);
    expect(settings.viewMode).toBe('DUAL SPLIT');
  });

  it('persists and retrieves updated settings', () => {
    store.saveSettings({
      theme: 'monokai',
      accent: 'emerald',
      fontSize: '15px',
      tabSize: 4,
      splitRatio: 65,
      viewMode: 'SOURCE'
    });

    const updated = store.getSettings();
    expect(updated.theme).toBe('monokai');
    expect(updated.accent).toBe('emerald');
    expect(updated.fontSize).toBe('15px');
    expect(updated.tabSize).toBe(4);
    expect(updated.splitRatio).toBe(65);
    expect(updated.viewMode).toBe('SOURCE');
  });

  it('saves and restores workspace state including unsaved draft buffers', async () => {
    // Mock fileSystemService.readFile
    vi.spyOn(fileSystemService, 'readFile').mockImplementation(async (path) => ({
      path,
      content: '# Saved disk content',
      hash: 'disk-hash-1',
      mtime: Date.now()
    }));

    // Save a state with one clean file and one dirty draft
    store.saveWorkspaceState({
      openFiles: [
        { path: 'doc1.md', name: 'doc1.md', isDirty: false },
        { path: 'doc2.md', name: 'doc2.md', isDirty: true, unsavedContent: '# Unsaved dirty draft buffer' }
      ],
      activePath: 'doc2.md'
    });

    const restored = await store.restoreWorkspace();
    expect(restored).toBe(true);

    const openDocs = documentStateManager.getOpenDocuments();
    expect(openDocs.length).toBe(2);

    const doc1 = openDocs.find(d => d.path === 'doc1.md');
    expect(doc1.content).toBe('# Saved disk content');
    expect(doc1.state).toBe(DocumentState.CLEAN);

    const doc2 = openDocs.find(d => d.path === 'doc2.md');
    expect(doc2.content).toBe('# Unsaved dirty draft buffer');
    expect(doc2.state).toBe(DocumentState.DIRTY);

    const activeDoc = documentStateManager.getActiveDocument();
    expect(activeDoc.path).toBe('doc2.md');
  });

  it('returns false when no saved workspace state exists', async () => {
    const restored = await store.restoreWorkspace();
    expect(restored).toBe(false);
  });

  it('supports wordWrap, showLineNumbers, fontFamily, and syncScroll options', () => {
    store.saveSettings({
      fontFamily: 'Fira Code',
      wordWrap: false,
      showLineNumbers: false,
      syncScroll: false
    });

    const settings = store.getSettings();
    expect(settings.fontFamily).toBe('Fira Code');
    expect(settings.wordWrap).toBe(false);
    expect(settings.showLineNumbers).toBe(false);
    expect(settings.syncScroll).toBe(false);
  });

  it('resets settings to factory defaults with resetSettings', () => {
    store.saveSettings({
      theme: 'matrix',
      accent: 'rose',
      fontSize: '17px',
      tabSize: 4,
      wordWrap: false
    });

    const reset = store.resetSettings();
    expect(reset.theme).toBe('cyberpunk');
    expect(reset.tabSize).toBe(2);
    expect(reset.wordWrap).toBe(true);

    const fromStore = store.getSettings();
    expect(fromStore.theme).toBe('cyberpunk');
    expect(fromStore.tabSize).toBe(2);
  });
});
