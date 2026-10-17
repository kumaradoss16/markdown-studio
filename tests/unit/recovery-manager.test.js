import { describe, it, expect, beforeEach } from 'vitest';
import { CrashRecoveryManager } from '../../src/core/recovery-manager.js';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) { return this.store[k] || null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
}

describe('CrashRecoveryManager', () => {
  let mockStorage;
  let recovery;
  let stateManager;

  beforeEach(() => {
    mockStorage = new MockStorage();
    recovery = new CrashRecoveryManager(mockStorage);
    stateManager = new DocumentStateManager();
  });

  it('journals dirty document snapshots in storage', () => {
    const doc = stateManager.createDocument('Draft.md', 'Initial');
    stateManager.updateContent(doc.id, 'Dirty Unsaved Edit');

    recovery.recordJournalEntry(doc);

    expect(recovery.hasPendingRecoveries()).toBe(true);
    const pending = recovery.getPendingRecoveries();
    expect(pending.length).toBe(1);
    expect(pending[0].content).toBe('Dirty Unsaved Edit');
  });

  it('clears journal entry upon successful save or clean close', () => {
    const doc = stateManager.createDocument('Draft.md', 'Initial');
    stateManager.updateContent(doc.id, 'Edit');
    recovery.recordJournalEntry(doc);

    expect(recovery.hasPendingRecoveries()).toBe(true);
    recovery.clearJournalEntry(doc.id);
    expect(recovery.hasPendingRecoveries()).toBe(false);
  });
});
