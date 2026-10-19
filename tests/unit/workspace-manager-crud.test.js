import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager } from '../../src/core/workspace-manager.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';

describe('WorkspaceManager CRUD Operations (Files & Folders)', () => {
  let manager;

  beforeEach(() => {
    documentStateManager.documents.clear();
    documentStateManager.activeDocumentId = null;
    fileSystemService.virtualStorage.clear();
    manager = new WorkspaceManager();
  });

  it('renames a file and updates all documents and recents references', async () => {
    await fileSystemService.createFile('docs/guide.md', '# Guide');
    const doc = documentStateManager.openDocument('docs/guide.md', '# Guide', 'hash1', Date.now());
    manager.recents.push({ path: 'docs/guide.md', name: 'guide.md' });

    const result = await manager.renameItem('docs/guide.md', 'manual.md', false);
    expect(result.success).toBe(true);
    expect(result.newPath).toBe('docs/manual.md');

    // Document in state manager should have updated path and name
    const updatedDoc = documentStateManager.documents.get(doc.id);
    expect(updatedDoc.path).toBe('docs/manual.md');
    expect(updatedDoc.name).toBe('manual.md');
  });

  it('renames a directory recursively updating all child files and open tabs', async () => {
    const doc1 = documentStateManager.openDocument('projects/api/overview.md', '# Overview', 'hash1', Date.now());
    const doc2 = documentStateManager.openDocument('projects/api/endpoints.md', '# Endpoints', 'hash2', Date.now());
    manager.createFolder('api', 'projects');

    const result = await manager.renameItem('projects/api', 'v2-api', true);
    expect(result.success).toBe(true);
    expect(result.newPath).toBe('projects/v2-api');

    expect(documentStateManager.documents.get(doc1.id).path).toBe('projects/v2-api/overview.md');
    expect(documentStateManager.documents.get(doc2.id).path).toBe('projects/v2-api/endpoints.md');
  });

  it('deletes a file and closes its open tab in documentStateManager', async () => {
    await fileSystemService.createFile('notes/temp1.md', '# Temp 1');
    const doc1 = documentStateManager.openDocument('notes/temp1.md', '# Temp 1', 'h1', Date.now());
    const doc2 = documentStateManager.openDocument('notes/temp2.md', '# Temp 2', 'h2', Date.now());
    documentStateManager.setActiveDocument(doc1.id);

    const result = await manager.deleteItem('notes/temp1.md', false);
    expect(result.success).toBe(true);

    // doc1 should be closed, doc2 should remain
    expect(documentStateManager.documents.has(doc1.id)).toBe(false);
    expect(documentStateManager.documents.has(doc2.id)).toBe(true);
    // active document should fall back to doc2
    expect(documentStateManager.getActiveDocument()?.id).toBe(doc2.id);
  });

  it('deletes a folder recursively and closes all child document tabs', async () => {
    const doc1 = documentStateManager.openDocument('drafts/post1.md', '# P1', 'h1', Date.now());
    const doc2 = documentStateManager.openDocument('drafts/nested/post2.md', '# P2', 'h2', Date.now());
    const safeDoc = documentStateManager.openDocument('safe/readme.md', '# Safe', 'h3', Date.now());

    const result = await manager.deleteItem('drafts', true);
    expect(result.success).toBe(true);

    expect(documentStateManager.documents.has(doc1.id)).toBe(false);
    expect(documentStateManager.documents.has(doc2.id)).toBe(false);
    expect(documentStateManager.documents.has(safeDoc.id)).toBe(true);
  });
});
