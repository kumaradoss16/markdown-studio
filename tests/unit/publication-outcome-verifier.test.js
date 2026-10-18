import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicationOutcomeVerifier } from '../../src/services/publication-outcome-verifier.js';
import { PublicationRecordService } from '../../src/services/publication-record-service.js';
import { PublicationState, OutcomeState } from '../../src/services/publication-state.js';
import { StudioError } from '../../src/services/error-service.js';

describe('PublicationOutcomeVerifier (Release 0.5)', () => {
  let verifier;
  let mockClient;
  let mockAuth;
  let mockStateManager;
  let recordService;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      _data: {},
      getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    };
    recordService = new PublicationRecordService(mockStorage);
    mockClient = { get: vi.fn() };
    mockAuth = { getToken: vi.fn().mockResolvedValue('test_token') };
    mockStateManager = { documents: new Map() };

    verifier = new PublicationOutcomeVerifier({
      client: mockClient,
      auth: mockAuth,
      stateManager: mockStateManager,
      recordService,
    });
  });

  it('authoritatively verifies commit and blob presence on GitHub', async () => {
    const attempt = recordService.createAttempt({
      documentId: 'doc_1',
      revision: 1,
      reviewedSnapshot: { content: '# Clean Doc' },
      destination: { owner: 'o', repo: 'r', branch: 'main', path: 'doc.md' },
    });

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/commits/')) {
        return { sha: 'commit_verified_sha', html_url: 'https://github.com/o/r/commit/xyz' };
      }
      if (url.includes('/contents/')) {
        return { sha: 'blob_verified_sha' };
      }
      return {};
    });

    const res = await verifier.verifyPublicationOutcome(attempt, {
      commit: { sha: 'commit_verified_sha' },
      content: { sha: 'blob_verified_sha' },
    });

    expect(res.verified).toBe(true);
    expect(res.commitSha).toBe('commit_verified_sha');
    expect(res.blobSha).toBe('blob_verified_sha');

    const updated = recordService.getAttempt(attempt.attemptId);
    expect(updated.state).toBe(PublicationState.PUBLISHED);
    expect(updated.outcomeState).toBe(OutcomeState.VERIFIED);
  });

  it('enforces Invariant 12: Preserves in-flight local edits (Revision N+1) when Revision N is published', () => {
    const doc = {
      id: 'doc_inv12',
      revision: 4,
      content: '# Document with UNPUBLISHED edits in Revision 4',
      state: 'MODIFIED',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'doc.md',
        baseCommitSha: 'commit_old',
        baseContent: '# Document original',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    const attempt = {
      attemptId: 'att_inv12',
      revision: 3, // Older revision that was reviewed
      reviewedSnapshot: { content: '# Document snapshot at Revision 3' },
    };

    verifier.reconcileLocalDraft(doc.id, attempt, {
      commitSha: 'commit_new_verified',
      blobSha: 'blob_new_verified',
    });

    // Content of Revision 4 is preserved!
    expect(doc.content).toBe('# Document with UNPUBLISHED edits in Revision 4');
    // Document state remains MODIFIED, NOT clean!
    expect(doc.state).toBe('MODIFIED');
    // Base metadata is advanced to verified commit
    expect(doc.remoteMetadata.baseCommitSha).toBe('commit_new_verified');
    expect(doc.remoteMetadata.baseBlobSha).toBe('blob_new_verified');
    expect(doc.lastPublishedRevision).toBe(3);
  });

  it('marks draft clean when no intermediate edits were made during publication', () => {
    const doc = {
      id: 'doc_clean',
      revision: 2,
      content: '# Stable content',
      state: 'MODIFIED',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'doc.md',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    const attempt = {
      attemptId: 'att_clean',
      revision: 2,
      reviewedSnapshot: { content: '# Stable content' },
    };

    verifier.reconcileLocalDraft(doc.id, attempt, {
      commitSha: 'commit_clean',
      blobSha: 'blob_clean',
    });

    expect(doc.state).toBe('CLEAN');
    expect(doc.savedRevision).toBe(2);
  });

  it('reconciles ambiguous timeout when matching commit exists on remote branch', async () => {
    const attempt = recordService.createAttempt({
      documentId: 'doc_ambig',
      revision: 1,
      reviewedSnapshot: { content: '# Ambig content' },
      destination: { owner: 'o', repo: 'r', branch: 'main', path: 'doc.md', baseCommitSha: 'commit_base' },
      commitMessage: 'Update doc.md',
    });

    // Mock commits returning the commit with matching message and parent
    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/commits?')) {
        return [
          {
            sha: 'commit_ambig_found',
            commit: { message: 'Update doc.md' },
            parents: [{ sha: 'commit_base' }],
          },
        ];
      }
      if (url.includes('/commits/commit_ambig_found')) {
        return { sha: 'commit_ambig_found', html_url: 'url' };
      }
      if (url.includes('/contents/')) {
        return { sha: 'blob_ambig_found' };
      }
      return {};
    });

    const res = await verifier.reconcileAmbiguousOutcome(attempt);
    expect(res.verified).toBe(true);
    expect(res.commitSha).toBe('commit_ambig_found');

    const updated = recordService.getAttempt(attempt.attemptId);
    expect(updated.state).toBe(PublicationState.PUBLISHED);
    expect(updated.outcomeState).toBe(OutcomeState.VERIFIED);
  });
});
