import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';
import { RemoteDraftService, RemoteRelationshipState } from '../../src/services/remote-draft-service.js';
import { CrashRecoveryManager } from '../../src/core/recovery-manager.js';

describe('Remote-Backed Draft Data Model & Invariants (Release 0.4)', () => {
  let stateManager;
  let draftService;
  let mockStorage;
  let recoveryManager;

  beforeEach(() => {
    stateManager = new DocumentStateManager();
    draftService = new RemoteDraftService({ stateManager });

    mockStorage = {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = v; },
      removeItem(k) { delete this.data[k]; },
    };
    recoveryManager = new CrashRecoveryManager(mockStorage);
  });

  const sampleRemoteDoc = {
    provider: 'github',
    owner: 'devspirehub',
    repo: 'markdown-studio',
    branch: 'main',
    path: 'docs/ARCHITECTURE.md',
    baseCommitSha: 'a1b2c3d4e5f678901234567890abcdef12345678',
    baseBlobSha: 'blob123456',
    content: '# Architecture Overview\nImmutable baseline.',
    fetchTimestamp: 1700000000000,
  };

  it('creates a remote-backed draft with exact immutable provenance metadata', () => {
    const doc = draftService.openRemoteDraft(sampleRemoteDoc);

    expect(doc).toBeDefined();
    expect(draftService.isRemoteDraft(doc)).toBe(true);
    expect(doc.remoteMetadata.owner).toBe('devspirehub');
    expect(doc.remoteMetadata.repo).toBe('markdown-studio');
    expect(doc.remoteMetadata.branch).toBe('main');
    expect(doc.remoteMetadata.path).toBe('docs/ARCHITECTURE.md');
    expect(doc.remoteMetadata.baseCommitSha).toBe(sampleRemoteDoc.baseCommitSha);
    expect(doc.remoteMetadata.baseContent).toBe(sampleRemoteDoc.content);
    expect(doc.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_CLEAN);
  });

  it('focuses existing draft when the same remote file and commit are opened again', () => {
    const doc1 = draftService.openRemoteDraft(sampleRemoteDoc);
    const doc2 = draftService.openRemoteDraft(sampleRemoteDoc);

    expect(doc1.id).toBe(doc2.id);
    expect(stateManager.documents.size).toBe(1);
  });

  it('transitions state to REMOTE_DIRTY when local edits are made', () => {
    const doc = draftService.openRemoteDraft(sampleRemoteDoc);
    expect(doc.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_CLEAN);

    stateManager.updateContent(doc.id, '# Architecture Overview\nLocally modified content.');
    draftService.updateDraftRelationship(doc);

    expect(doc.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_DIRTY);
    expect(doc.remoteMetadata.baseContent).toBe(sampleRemoteDoc.content); // Base preserved!
  });

  it('transitions state to REMOTE_DIVERGED when local edits exist and remote has changed', () => {
    const doc = draftService.openRemoteDraft(sampleRemoteDoc);

    // 1. Local modification
    stateManager.updateContent(doc.id, '# Local change');
    // 2. Remote update recorded
    doc.remoteMetadata.latestRemoteContent = '# Remote update';
    doc.remoteMetadata.isStaleBase = true;

    draftService.updateDraftRelationship(doc);
    expect(doc.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_DIVERGED);
  });

  it('preserves remoteMetadata across CrashRecoveryManager journaling', () => {
    const doc = draftService.openRemoteDraft(sampleRemoteDoc);
    stateManager.updateContent(doc.id, '# Unsaved edit before crash');
    recoveryManager.recordJournalEntry(doc);

    const journal = recoveryManager.getJournal();
    expect(journal[doc.id]).toBeDefined();
    expect(journal[doc.id].remoteMetadata).toBeDefined();
    expect(journal[doc.id].remoteMetadata.owner).toBe('devspirehub');
    expect(journal[doc.id].remoteMetadata.baseCommitSha).toBe(sampleRemoteDoc.baseCommitSha);
  });
});
