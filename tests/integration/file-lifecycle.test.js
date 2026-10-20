import { describe, it, expect, beforeEach } from 'vitest';
import { FileSystemService } from '../../src/services/filesystem-service.js';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';
import { SaveCoordinator } from '../../src/core/save-coordinator.js';
import { populateTestFixtures } from '../fixtures/sample-workspace.js';

describe('Integration: Document & Filesystem Lifecycle', () => {
  let fsService;
  let stateManager;
  let coordinator;

  beforeEach(() => {
    fsService = new FileSystemService();
    populateTestFixtures(fsService);
    stateManager = new DocumentStateManager();
    coordinator = new SaveCoordinator(stateManager, fsService);
  });

  it('reads pre-seeded workspace file and initializes document model', async () => {
    const fileData = await fsService.readFile('ExampleVault/Habitat Design.md');
    expect(fileData.name).toBe('Habitat Design.md');
    expect(fileData.content).toContain('Neo-Kyoto');

    const doc = stateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
    expect(doc.id).toBeDefined();
    expect(doc.name).toBe('Habitat Design.md');
    expect(doc.revision).toBe(0);
  });

  it('creates new file, writes content, reloads and verifies content integrity', async () => {
    const path = 'ExampleVault/Mission Briefing Alpha.md';
    const initialContent = '# Mission Briefing Alpha\n\nPrimary orbital trajectory approved.';

    await fsService.createFile(path, initialContent);
    const fileMeta = await fsService.readFile(path);
    const doc = stateManager.openDocument(path, initialContent, fileMeta.hash);

    // Make an edit and save
    stateManager.updateContent(doc.id, initialContent + '\n\n**Update:** Target rendezvous at 0400Z.');
    await coordinator.save(doc.id);

    // Read back directly from filesystem
    const reloaded = await fsService.readFile(path);
    expect(reloaded.content).toContain('Target rendezvous at 0400Z.');
  });

  it('lists workspace entries including standard files', async () => {
    const entries = await fsService.listWorkspace('ExampleVault');
    expect(entries.length).toBeGreaterThan(5);
    const names = entries.map(e => e.name);
    expect(names).toContain('Habitat Design.md');
    expect(names).toContain('Marcus Chen.md');
  });
});
