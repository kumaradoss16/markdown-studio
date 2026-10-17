import { describe, it, expect, beforeEach } from 'vitest';
import { SaveCoordinator } from '../../src/core/save-coordinator.js';
import { DocumentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { FileSystemService } from '../../src/services/filesystem-service.js';
import { ErrorCode, StudioError } from '../../src/services/error-service.js';

describe('SaveCoordinator', () => {
  let stateManager;
  let fsService;
  let coordinator;

  beforeEach(() => {
    stateManager = new DocumentStateManager();
    fsService = new FileSystemService();
    coordinator = new SaveCoordinator(stateManager, fsService);
  });

  it('persists a document and resets dirty state', async () => {
    const doc = stateManager.createDocument('Doc.md', '# Initial', 'ExampleVault/Doc.md');
    stateManager.updateContent(doc.id, '# Updated Content');
    expect(doc.state).toBe(DocumentState.DIRTY);

    const result = await coordinator.save(doc.id);
    expect(result.success).toBe(true);
    expect(result.revision).toBe(1);
    expect(doc.state).toBe(DocumentState.CLEAN);
    expect(doc.savedRevision).toBe(1);

    // Verify stored content
    const reloaded = await fsService.readFile('ExampleVault/Doc.md');
    expect(reloaded.content).toBe('# Updated Content');
  });

  it('supports Save As to a new file location', async () => {
    const doc = stateManager.createDocument('Original.md', '# Content', 'ExampleVault/Original.md');
    await coordinator.saveAs(doc.id, 'ExampleVault/NewLocation.md');

    expect(doc.path).toBe('ExampleVault/NewLocation.md');
    expect(doc.name).toBe('NewLocation.md');
    expect(doc.state).toBe(DocumentState.CLEAN);

    const saved = await fsService.readFile('ExampleVault/NewLocation.md');
    expect(saved.content).toBe('# Content');
  });

  it('blocks save when external disk modification is detected', async () => {
    const doc = stateManager.openDocument('ExampleVault/Habitat Design.md', 'Initial Memory Content', 'initial-hash');

    // Simulate an external background process modifying the file on disk
    fsService.virtualStorage.set('ExampleVault/Habitat Design.md', 'External process edit');
    fsService.fileMetadata.set('ExampleVault/Habitat Design.md', {
      mtime: Date.now(),
      hash: 'external-hash-999',
      version: 5,
    });

    stateManager.updateContent(doc.id, 'Local uncoordinated edit');

    await expect(coordinator.save(doc.id)).rejects.toThrowError(StudioError);
    expect(doc.state).toBe(DocumentState.SAVE_ERROR);
    // User's in-memory content is strictly preserved, not overwritten!
    expect(doc.content).toBe('Local uncoordinated edit');
  });
});
