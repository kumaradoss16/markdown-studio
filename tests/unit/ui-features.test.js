import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager } from '../../src/core/workspace-manager.js';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';
import { SLASH_COMMANDS } from '../../src/components/editor/slash-menu.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { populateTestFixtures } from '../fixtures/sample-workspace.js';

describe('UI and Workspace Features', () => {
  let workspace;
  let docManager;

  beforeEach(() => {
    workspace = new WorkspaceManager();
    populateTestFixtures(fileSystemService, workspace);
    docManager = new DocumentStateManager();
  });

  describe('Filename validation and sanitization', () => {
    it('accepts valid filenames', () => {
      expect(workspace.isValidFilename('Architecture')).toBe(true);
      expect(workspace.isValidFilename('My Doc 2026-03')).toBe(true);
      expect(workspace.isValidFilename('spec-v1.0')).toBe(true);
    });

    it('rejects empty, null, or dot-only filenames', () => {
      expect(workspace.isValidFilename('')).toBe(false);
      expect(workspace.isValidFilename('   ')).toBe(false);
      expect(workspace.isValidFilename(null)).toBe(false);
      expect(workspace.isValidFilename(undefined)).toBe(false);
      expect(workspace.isValidFilename('.')).toBe(false);
      expect(workspace.isValidFilename('..')).toBe(false);
    });

    it('rejects OS forbidden characters \\ / : * ? " < > |', () => {
      expect(workspace.isValidFilename('doc/name')).toBe(false);
      expect(workspace.isValidFilename('doc\\name')).toBe(false);
      expect(workspace.isValidFilename('doc:test')).toBe(false);
      expect(workspace.isValidFilename('star*doc')).toBe(false);
      expect(workspace.isValidFilename('question?mark')).toBe(false);
      expect(workspace.isValidFilename('quote"doc')).toBe(false);
      expect(workspace.isValidFilename('<bracket>')).toBe(false);
      expect(workspace.isValidFilename('pipe|line')).toBe(false);
    });

    it('rejects Windows reserved device names', () => {
      expect(workspace.isValidFilename('con')).toBe(false);
      expect(workspace.isValidFilename('CON')).toBe(false);
      expect(workspace.isValidFilename('prn.txt')).toBe(false);
      expect(workspace.isValidFilename('aux')).toBe(false);
      expect(workspace.isValidFilename('nul')).toBe(false);
      expect(workspace.isValidFilename('com1')).toBe(false);
      expect(workspace.isValidFilename('lpt9.md')).toBe(false);
    });
  });

  describe('Workspace file and folder operations', () => {
    it('creates a new valid folder and rejects duplicate folder', () => {
      const folder = workspace.createFolder('specifications');
      expect(folder.name).toBe('specifications');
      expect(folder.path).toBe('ExampleVault/specifications');
      expect(workspace.folders.some(f => f.name === 'specifications')).toBe(true);

      expect(() => workspace.createFolder('specifications')).toThrowError(/already exists/);
      expect(() => workspace.createFolder('bad/name')).toThrowError(/Invalid folder name/);
    });

    it('creates a new file with sanitized name', async () => {
      const node = await workspace.createFile('Telemetry Log');
      expect(node.name).toBe('Telemetry Log');
      expect(node.path).toBe('ExampleVault/Telemetry Log.md');
      expect(workspace.knowledgeBase.some(k => k.name === 'Telemetry Log')).toBe(true);

      await expect(workspace.createFile('invalid:name')).rejects.toThrowError(/Invalid file name/);
    });

    it('renames an existing file and updates knowledgeBase and recents', async () => {
      const oldPath = 'ExampleVault/System Architecture.md';
      const result = await workspace.renameItem(oldPath, 'System Architecture V2');
      expect(result.newPath).toBe('ExampleVault/System Architecture V2.md');

      const found = workspace.knowledgeBase.find(k => k.path === 'ExampleVault/System Architecture V2.md');
      expect(found).toBeDefined();
      expect(found.name).toBe('System Architecture V2');
    });

    it('duplicates a file and registers duplicate in knowledgeBase', async () => {
      const source = 'ExampleVault/Mission Log.md';
      const dup = await workspace.duplicateItem(source);
      expect(dup.name.toLowerCase()).toContain('mission log (copy');
      expect(dup.path.toLowerCase()).toContain('mission log (copy');
      expect(workspace.knowledgeBase.some(k => k.path === dup.path)).toBe(true);
    });

    it('deletes an item and removes from knowledgeBase, recents, and folders', async () => {
      const target = 'ExampleVault/Mission Briefing.md';
      await workspace.deleteItem(target);
      expect(workspace.knowledgeBase.some(k => k.path === target)).toBe(false);
      expect(workspace.recents.some(r => r.path === target)).toBe(false);
    });
  });

  describe('Document state manager tab reordering', () => {
    it('reorders open documents preserving map ordering', () => {
      const doc1 = docManager.createDocument('Doc1.md', 'Content 1');
      const doc2 = docManager.createDocument('Doc2.md', 'Content 2');
      const doc3 = docManager.createDocument('Doc3.md', 'Content 3');

      expect(docManager.getOpenDocuments().map(d => d.id)).toEqual([doc1.id, doc2.id, doc3.id]);

      // Move doc3 before doc1
      docManager.reorderDocument(doc3.id, doc1.id);
      expect(docManager.getOpenDocuments().map(d => d.id)).toEqual([doc3.id, doc1.id, doc2.id]);

      // Move doc1 to end
      docManager.reorderDocument(doc1.id, null);
      expect(docManager.getOpenDocuments().map(d => d.id)).toEqual([doc3.id, doc2.id, doc1.id]);
    });
  });

  describe('Slash Commands Specification Palette', () => {
    it('defines all required block types from UI specifications', () => {
      const ids = SLASH_COMMANDS.map(c => c.id);
      expect(ids).toContain('h1');
      expect(ids).toContain('h2');
      expect(ids).toContain('h3');
      expect(ids).toContain('h4');
      expect(ids).toContain('bullet-list');
      expect(ids).toContain('numbered-list');
      expect(ids).toContain('todo-list');
      expect(ids).toContain('toggle-list');
      expect(ids).toContain('code-block');
      expect(ids).toContain('blockquote');
      expect(ids).toContain('callout-note');
      expect(ids).toContain('equation-block');
      expect(ids).toContain('synced-block');
      expect(ids).toContain('multi-column');
    });

    it('provides correct syntax for headings and toggle lists', () => {
      const h1 = SLASH_COMMANDS.find(c => c.id === 'h1');
      expect(h1.snippet).toBe('# ');

      const toggle = SLASH_COMMANDS.find(c => c.id === 'toggle-list');
      expect(toggle.snippet).toContain('<details>');
      expect(toggle.snippet).toContain('<summary>');
    });

    it('provides correct syntax for math equations and columns', () => {
      const eq = SLASH_COMMANDS.find(c => c.id === 'equation-block');
      expect(eq.snippet).toContain('$$\n');

      const cols = SLASH_COMMANDS.find(c => c.id === 'multi-column');
      expect(cols.snippet).toContain('grid-template-columns: 1fr 1fr');
      expect(cols.snippet).toContain('Column 1');
    });
  });
});
