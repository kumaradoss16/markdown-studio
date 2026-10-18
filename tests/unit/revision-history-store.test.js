import { describe, it, expect, beforeEach } from 'vitest';
import { RevisionHistoryStore } from '../../src/services/revision-history-store.js';
import { ErrorCode } from '../../src/services/error-service.js';

describe('RevisionHistoryStore (Release 0.6)', () => {
  let store;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      _data: {},
      getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    };
    store = new RevisionHistoryStore({ storage: mockStorage, maxRevisions: 5 });
  });

  it('normalizes document keys consistently and rejects path traversal', () => {
    expect(store.normalizeKey('notes/doc.md')).toBe('notes/doc.md');
    expect(store.normalizeKey('notes\\doc.md')).toBe('notes/doc.md');
    expect(store.normalizeKey('/notes/doc.md')).toBe('notes/doc.md');

    // Invariant 9: Path Traversal Rejection
    expect(() => store.normalizeKey('../secret.md')).toThrow();
    expect(() => store.normalizeKey('notes/../../etc/passwd')).toThrow();
  });

  it('computes deterministic content hashes', () => {
    const hash1 = store.hashContent('# Hello World\n');
    const hash2 = store.hashContent('# Hello World\n');
    const hash3 = store.hashContent('# Different content\n');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(typeof hash1).toBe('string');
  });

  it('creates immutable, content-addressed snapshots', async () => {
    const content = '# Title\nSome content';
    const snapshot = await store.recordSnapshot({
      documentKey: 'guide.md',
      content,
      source: 'local_save',
      author: 'local_user',
      metadata: { editType: 'save' },
    });

    expect(snapshot).toBeDefined();
    expect(snapshot.historyId).toMatch(/^rev_/);
    expect(snapshot.documentKey).toBe('guide.md');
    expect(snapshot.source).toBe('local_save');
    expect(snapshot.contentHash).toBe(store.hashContent(content));

    // Content blob is stored separately under contentHash
    const retrieved = await store.getRevision('guide.md', snapshot.historyId);
    expect(retrieved.content).toBe(content);
  });

  it('deduplicates content storage for identical content blobs', async () => {
    const content = '# Same Content\nNo changes';
    const snap1 = await store.recordSnapshot({
      documentKey: 'doc1.md',
      content,
      source: 'local_save',
    });
    const snap2 = await store.recordSnapshot({
      documentKey: 'doc2.md',
      content,
      source: 'local_save',
    });

    expect(snap1.contentHash).toBe(snap2.contentHash);
    // Only one blob stored in mockStorage
    const blobKey = `devspirehub:history:blob:${snap1.contentHash}`;
    expect(mockStorage.getItem(blobKey)).toBe(content);
  });

  it('detects content hash mismatch and throws CORRUPT_HISTORY (Invariant 5)', async () => {
    const content = 'Original text';
    const snapshot = await store.recordSnapshot({
      documentKey: 'test.md',
      content,
      source: 'local_save',
    });

    // Tamper with the stored blob
    const blobKey = `devspirehub:history:blob:${snapshot.contentHash}`;
    mockStorage.setItem(blobKey, 'Tampered corrupted text');

    await expect(store.getRevision('test.md', snapshot.historyId)).rejects.toMatchObject({
      code: ErrorCode.CORRUPT_HISTORY,
    });
  });

  it('enforces FIFO eviction capped at maxRevisions (5) for unpinned revisions', async () => {
    for (let i = 1; i <= 7; i++) {
      await store.recordSnapshot({
        documentKey: 'cap.md',
        content: `Version ${i}`,
        summary: `Version ${i}`,
        source: 'local_save',
      });
    }

    const history = await store.getHistory('cap.md');
    expect(history.length).toBe(5);
    // Oldest revisions (1 and 2) should have been evicted
    const summaries = history.map(h => h.summary);
    expect(summaries).toContain('Version 7');
    expect(summaries).toContain('Version 3');
    expect(summaries).not.toContain('Version 1');
    expect(summaries).not.toContain('Version 2');
  });

  it('protects pinned revisions from eviction even when older than max limit (Invariant 2/3)', async () => {
    // Record first snapshot and pin it (simulating an active restore preview)
    const snap1 = await store.recordSnapshot({
      documentKey: 'pinned.md',
      content: 'Important Base Version 1',
      summary: 'Version 1',
      source: 'local_save',
    });
    store.pinHistoryId(snap1.historyId);

    // Record 5 more snapshots (which would normally evict snap1 if unpinned)
    for (let i = 2; i <= 6; i++) {
      await store.recordSnapshot({
        documentKey: 'pinned.md',
        content: `Version ${i}`,
        summary: `Version ${i}`,
        source: 'local_save',
      });
    }

    const history = await store.getHistory('pinned.md');
    // snap1 must still exist because it was pinned!
    const foundPinned = history.find(h => h.historyId === snap1.historyId);
    expect(foundPinned).toBeDefined();

    // After unpinning, subsequent snapshot allows eviction
    store.unpinHistoryId(snap1.historyId);
    await store.recordSnapshot({
      documentKey: 'pinned.md',
      content: 'Version 7',
      summary: 'Version 7',
      source: 'local_save',
    });

    const updatedHistory = await store.getHistory('pinned.md');
    expect(updatedHistory.length).toBe(5);
  });

  it('re-keys revision history when a document is renamed or Saved As', async () => {
    await store.recordSnapshot({
      documentKey: 'draft.md',
      content: '# Initial Draft',
      source: 'local_save',
    });

    await store.rekeyDocument('draft.md', 'final-report.md');

    const oldHist = await store.getHistory('draft.md');
    const newHist = await store.getHistory('final-report.md');

    expect(oldHist.length).toBe(0);
    expect(newHist.length).toBe(1);
    expect(newHist[0].documentKey).toBe('final-report.md');
  });
});
