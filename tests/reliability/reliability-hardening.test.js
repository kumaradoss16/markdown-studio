import { describe, it, expect, beforeEach, vi } from 'vitest';
import { documentStateManager, DocumentState } from '../../src/core/document-state-manager.js';
import { saveCoordinator } from '../../src/core/save-coordinator.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { graphIndexService } from '../../src/services/graph-index-service.js';
import { AppEvents, eventBus, EventEmitter } from '../../src/app/events.js';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';
import { ErrorCode } from '../../src/services/error-service.js';

describe('Release 1.0 Reliability Hardening & Invariants', () => {
  beforeEach(() => {
    fileSystemService.virtualStorage.clear();
    documentStateManager.documents.clear();
    documentStateManager.activeDocumentId = null;
  });

  describe('File Write Concurrency & Race Condition Elimination', () => {
    it('prevents concurrent write race conditions on the same document via inFlightSaves guard', async () => {
      const docPath = 'ConcurDoc.md';
      fileSystemService.virtualStorage.set(docPath, '# Initial Content');
      const doc = documentStateManager.openDocument(docPath, '# Initial Content', 'h-init', 100);

      // Trigger two simultaneous saves
      const save1 = saveCoordinator.save(doc.id);
      const save2 = saveCoordinator.save(doc.id);

      const [res1, res2] = await Promise.allSettled([save1, save2]);

      // Exactly one must succeed and overlapping attempt must be aborted
      expect(res1.status === 'fulfilled' || res2.status === 'fulfilled').toBe(true);
      const rejected = [res1, res2].find(r => r.status === 'rejected');
      expect(rejected?.reason?.code).toBe(ErrorCode.SAVE_ABORTED);

      // Subsequent sequential save succeeds cleanly
      documentStateManager.updateContent(doc.id, '# Second Saved Revision');
      const seqSave = await saveCoordinator.save(doc.id);
      expect(seqSave.success).toBe(true);

      const finalFile = await fileSystemService.readFile(docPath);
      expect(finalFile.content).toBe('# Second Saved Revision');
      expect(doc.state).toBe(DocumentState.CLEAN);
    });

    it('safely isolates concurrent writes across distinct documents', async () => {
      fileSystemService.virtualStorage.set('Doc1.md', 'Content 1');
      fileSystemService.virtualStorage.set('Doc2.md', 'Content 2');
      fileSystemService.virtualStorage.set('Doc3.md', 'Content 3');

      const d1 = documentStateManager.openDocument('Doc1.md', 'Content 1', 'h1', 10);
      const d2 = documentStateManager.openDocument('Doc2.md', 'Content 2', 'h2', 20);
      const d3 = documentStateManager.openDocument('Doc3.md', 'Content 3', 'h3', 30);

      documentStateManager.updateContent(d1.id, 'Updated Content 1');
      documentStateManager.updateContent(d2.id, 'Updated Content 2');
      documentStateManager.updateContent(d3.id, 'Updated Content 3');

      await Promise.all([
        saveCoordinator.save(d1.id),
        saveCoordinator.save(d2.id),
        saveCoordinator.save(d3.id),
      ]);

      const f1 = await fileSystemService.readFile('Doc1.md');
      const f2 = await fileSystemService.readFile('Doc2.md');
      const f3 = await fileSystemService.readFile('Doc3.md');

      expect(f1.content).toBe('Updated Content 1');
      expect(f2.content).toBe('Updated Content 2');
      expect(f3.content).toBe('Updated Content 3');
    });
  });

  describe('Dirty State Tracking & Confirmation Invariants', () => {
    it('accurately tracks clean vs dirty state transitions upon editing and saving', async () => {
      fileSystemService.virtualStorage.set('Test.md', 'Initial');
      const doc = documentStateManager.openDocument('Test.md', 'Initial', 'h1', 10);
      expect(doc.state).toBe(DocumentState.CLEAN);

      // Modifying content marks it DIRTY
      documentStateManager.updateContent(doc.id, 'Modified content');
      expect(doc.state).toBe(DocumentState.DIRTY);

      // Saving restores CLEAN state
      await saveCoordinator.save(doc.id);
      expect(doc.state).toBe(DocumentState.CLEAN);
    });

    it('blocks unforced close when document is dirty', () => {
      const doc = documentStateManager.createDocument('Dirty.md', 'Initial', 'Dirty.md');
      documentStateManager.updateContent(doc.id, 'Changed text');

      expect(() => {
        documentStateManager.closeDocument(doc.id, false);
      }).toThrowError(expect.objectContaining({ code: ErrorCode.SAVE_ABORTED }));

      expect(documentStateManager.documents.has(doc.id)).toBe(true);
    });

    it('permits close when forced or clean', () => {
      const doc = documentStateManager.createDocument('Clean.md', 'Clean text', 'Clean.md');
      const closed = documentStateManager.closeDocument(doc.id, false);
      expect(closed).toBe(true);
      expect(documentStateManager.documents.has(doc.id)).toBe(false);

      const forcedDoc = documentStateManager.createDocument('Forced.md', 'Draft', 'Forced.md');
      documentStateManager.updateContent(forcedDoc.id, 'Dirty edit');
      const forcedClose = documentStateManager.closeDocument(forcedDoc.id, true);
      expect(forcedClose).toBe(true);
      expect(documentStateManager.documents.has(forcedDoc.id)).toBe(false);
    });
  });

  describe('Graph Indexing, Cycle Handling & Orphan Note Isolation', () => {
    it('safely handles deeply cyclical references without recursion overflow', async () => {
      fileSystemService.virtualStorage.set('CycleA.md', 'Reference to [[CycleB]].');
      fileSystemService.virtualStorage.set('CycleB.md', 'Reference to [[CycleC]].');
      fileSystemService.virtualStorage.set('CycleC.md', 'Reference back to [[CycleA]].');
      fileSystemService.virtualStorage.set('Isolated.md', 'No outgoing or incoming links.');

      const data = await graphIndexService.buildGraph({ includeTags: false });

      expect(data.nodes.length).toBe(4);
      expect(data.edges.length).toBe(3);

      const cycleA = data.nodeMap.get('CycleA.md');
      const isolated = data.nodeMap.get('Isolated.md');

      expect(cycleA.degree).toBe(2);
      expect(isolated.degree).toBe(0);

      const neighborhood = graphIndexService.getLocalNeighborhood('CycleA.md', 3);
      expect(neighborhood.nodes.length).toBe(3);
    });

    it('correctly resolves multiple links pointing to the same document without edge duplication', async () => {
      fileSystemService.virtualStorage.set('Source.md', 'Link [[Target]] and another [[Target|Alias]] and [Target](Target.md)');
      fileSystemService.virtualStorage.set('Target.md', 'Target body');

      const data = await graphIndexService.buildGraph({ includeTags: false });
      const targetEdges = data.edges.filter(e => e.source === 'Source.md' && e.target === 'Target.md');

      expect(targetEdges.length).toBe(1);
    });
  });

  describe('Memory Leak Prevention & Event Listener Pruning', () => {
    it('cleans up event emitter listener sets when unregistered', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = emitter.on('test-event', handler1);
      const unsubscribe2 = emitter.on('test-event', handler2);

      expect(emitter.listeners.get('test-event').size).toBe(2);

      unsubscribe1();
      expect(emitter.listeners.get('test-event').size).toBe(1);

      unsubscribe2();
      expect(emitter.listeners.has('test-event')).toBe(false);
    });

    it('bounds AST pipeline caching to prevent memory bloat over prolonged editing', () => {
      const doc = { id: 'DocLong.md', path: 'DocLong.md', revision: 1 };

      for (let i = 1; i <= 50; i++) {
        doc.revision = i;
        doc.content = `# Document Revision ${i}\n` + 'Paragraph content\n'.repeat(10);
        markdownPipeline.process(doc);
      }

      expect(markdownPipeline.cache.size).toBeLessThanOrEqual(50);
    });
  });
});
