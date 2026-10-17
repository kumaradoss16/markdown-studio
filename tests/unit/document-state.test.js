import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { ErrorCode, StudioError } from '../../src/services/error-service.js';

describe('DocumentStateManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DocumentStateManager();
  });

  it('creates a new document with clean state', () => {
    const doc = manager.createDocument('Test.md', '# Hello World');
    expect(doc.id).toBeDefined();
    expect(doc.name).toBe('Test.md');
    expect(doc.content).toBe('# Hello World');
    expect(doc.revision).toBe(0);
    expect(doc.savedRevision).toBe(0);
    expect(doc.state).toBe(DocumentState.CLEAN);
  });

  it('increments revision and transitions to DIRTY on edit', () => {
    const doc = manager.createDocument('Doc.md', 'Initial');
    expect(doc.state).toBe(DocumentState.CLEAN);

    manager.updateContent(doc.id, 'Edited content');
    expect(doc.revision).toBe(1);
    expect(doc.content).toBe('Edited content');
    expect(doc.state).toBe(DocumentState.DIRTY);
  });

  it('detects duplicate open path and focuses existing document', () => {
    const doc1 = manager.openDocument('vault/test.md', 'Content', 'hash1');
    const doc2 = manager.openDocument('vault/test.md', 'Content', 'hash1');
    expect(doc1.id).toBe(doc2.id);
    expect(manager.getOpenDocuments().length).toBe(1);
  });

  it('refuses to close dirty document without force', () => {
    const doc = manager.createDocument('Draft.md', 'Content');
    manager.updateContent(doc.id, 'Modified draft');

    expect(() => manager.closeDocument(doc.id, false)).toThrowError(StudioError);
    expect(manager.documents.has(doc.id)).toBe(true);

    // Force close succeeds
    const closed = manager.closeDocument(doc.id, true);
    expect(closed).toBe(true);
    expect(manager.documents.has(doc.id)).toBe(false);
  });

  it('transitions to CLEAN when saved revision matches current revision', () => {
    const doc = manager.createDocument('SaveTest.md', 'Initial');
    manager.updateContent(doc.id, 'Edit 1');
    expect(doc.state).toBe(DocumentState.DIRTY);

    const savingRev = manager.markSaving(doc.id);
    expect(doc.state).toBe(DocumentState.SAVING);

    manager.markSaved(doc.id, savingRev, 'hash-new');
    expect(doc.state).toBe(DocumentState.CLEAN);
    expect(doc.savedRevision).toBe(1);
  });

  it('remains DIRTY if edited while save was in flight', () => {
    const doc = manager.createDocument('RaceTest.md', 'Initial');
    manager.updateContent(doc.id, 'Edit 1');
    const savingRev = manager.markSaving(doc.id);

    // Newer edit occurs while saving
    manager.updateContent(doc.id, 'Edit 2 (in flight)');
    expect(doc.revision).toBe(2);

    manager.markSaved(doc.id, savingRev, 'hash-edit1');
    expect(doc.state).toBe(DocumentState.DIRTY);
    expect(doc.savedRevision).toBe(1);
    expect(doc.revision).toBe(2);
  });
});
