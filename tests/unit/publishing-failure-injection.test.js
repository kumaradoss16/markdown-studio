import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicationCoordinator } from '../../src/services/publication-coordinator.js';
import { PublicationPreflightService } from '../../src/services/publication-preflight-service.js';
import { GitHubWriteClient } from '../../src/services/github-write-client.js';
import { PublicationOutcomeVerifier } from '../../src/services/publication-outcome-verifier.js';
import { PublicationRecordService } from '../../src/services/publication-record-service.js';
import { PublicationState, OutcomeState } from '../../src/services/publication-state.js';
import { StudioError, ErrorCode } from '../../src/services/error-service.js';

describe('Failure-Injection Testing (Release 0.5 Section 18.D)', () => {
  let coordinator;
  let mockClient;
  let mockAuth;
  let mockRepoService;
  let mockStateManager;
  let recordService;
  let mockStorage;
  let writeClient;
  let verifier;
  let preflight;

  beforeEach(() => {
    mockStorage = {
      _data: {},
      getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    };
    recordService = new PublicationRecordService(mockStorage);
    mockAuth = { getToken: vi.fn().mockResolvedValue('test_token') };
    mockClient = { get: vi.fn() };
    mockRepoService = { getBranchCommitSha: vi.fn().mockResolvedValue('sha_current') };
    mockStateManager = { documents: new Map() };

    preflight = new PublicationPreflightService({
      client: mockClient,
      auth: mockAuth,
      repoService: mockRepoService,
      stateManager: mockStateManager,
    });

    writeClient = new GitHubWriteClient({
      auth: mockAuth,
      transport: vi.fn(),
    });

    verifier = new PublicationOutcomeVerifier({
      client: mockClient,
      auth: mockAuth,
      stateManager: mockStateManager,
      recordService,
    });

    coordinator = new PublicationCoordinator({
      preflight,
      writeClient,
      verifier,
      recordService,
      stateManager: mockStateManager,
    });
  });

  it('Scenario 1: Request rejected before transmission (offline) transitions to FAILED_RETRYABLE', async () => {
    const doc = {
      id: 'doc_fi_1',
      revision: 1,
      content: '# Offline Test',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'offline.md',
        baseCommitSha: 'sha_current', baseBlobSha: 'blob_current', baseContent: '# Old',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/contents/')) return { sha: 'blob_current' };
      return { permissions: { push: true } };
    });

    // Write transport fails immediately (offline)
    writeClient.setTransport(async () => {
      throw new Error('Network error: ENOTFOUND');
    });

    const session = await coordinator.startPublication(doc.id);
    expect(session.success).toBe(true);

    const result = await coordinator.confirmPublication({
      attemptId: session.attemptId,
      commitMessage: 'Offline commit',
    });

    // The coordinator caught OUTCOME_UNCERTAIN and ran reconciliation.
    // Reconciliation saw the commit was not written, transitioning safely to FAILED_RETRYABLE!
    expect(result.state).toBe(PublicationState.FAILED_RETRYABLE);
    expect(result.reconciled).toBe(true);
  });

  it('Scenario 3: Server commits but HTTP response is lost; reconciliation verifies commit', async () => {
    const doc = {
      id: 'doc_fi_3',
      revision: 1,
      content: '# Recovered Commit Content',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'timeout.md',
        baseCommitSha: 'sha_base', baseBlobSha: 'blob_base', baseContent: '# Old Content',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/contents/timeout.md?ref=sha_base')) {
        return { sha: 'blob_base' };
      }
      if (url.includes('/commits?')) {
        return [{
          sha: 'commit_lost_found',
          commit: { message: 'Lost response commit' },
          parents: [{ sha: 'sha_base' }],
        }];
      }
      if (url.includes('/commits/commit_lost_found')) {
        return { sha: 'commit_lost_found', html_url: 'url' };
      }
      if (url.includes('/contents/timeout.md?ref=commit_lost_found')) {
        return { sha: 'blob_lost_found' };
      }
      return { permissions: { push: true } };
    });

    // Write throws AbortError (timeout)
    writeClient.setTransport(async () => {
      const err = new Error('The request timed out.');
      err.name = 'AbortError';
      throw err;
    });

    mockRepoService.getBranchCommitSha.mockResolvedValue('sha_base');

    const session = await coordinator.startPublication(doc.id);
    const result = await coordinator.confirmPublication({
      attemptId: session.attemptId,
      commitMessage: 'Lost response commit',
    });

    // Reconciled successfully via commit history!
    expect(result.success).toBe(true);
    expect(result.reconciled).toBe(true);
    expect(result.state).toBe(PublicationState.PUBLISHED);
    expect(result.verifiedResult.commitSha).toBe('commit_lost_found');
  });

  it('Scenario 4: Server returns 200 but remote verification fails -> VERIFICATION_FAILED', async () => {
    const doc = {
      id: 'doc_fi_4',
      revision: 1,
      content: '# Content',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'doc.md',
        baseCommitSha: 'sha_base', baseBlobSha: 'blob_base', baseContent: '# Old',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/contents/')) return { sha: 'blob_base' };
      if (url.includes('/commits/sha_bad_commit')) {
        // Commit vanished or could not be found
        return null;
      }
      return { permissions: { push: true } };
    });

    writeClient.setTransport(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        commit: { sha: 'sha_bad_commit' },
        content: { sha: 'blob_new' },
      }),
    }));

    mockRepoService.getBranchCommitSha.mockResolvedValue('sha_base');

    const session = await coordinator.startPublication(doc.id);
    await expect(
      coordinator.confirmPublication({
        attemptId: session.attemptId,
        commitMessage: 'Test verification failure',
      })
    ).rejects.toThrow(StudioError);

    expect(coordinator.getState()).toBe(PublicationState.FAILED_FINAL);
  });

  it('Scenario 7 & Invariant 17: Application restarts with pending/uncertain attempt and reconciles', async () => {
    // Simulate an attempt left in OUTCOME_UNCERTAIN before crash
    const crashedAttempt = recordService.createAttempt({
      documentId: 'doc_crash',
      revision: 1,
      reviewedSnapshot: { content: '# Crash Recover' },
      destination: { owner: 'o', repo: 'r', branch: 'main', path: 'crash.md', baseCommitSha: 'sha_0' },
      commitMessage: 'Pre-crash commit',
    });

    recordService.updateAttempt(crashedAttempt.attemptId, {
      state: PublicationState.OUTCOME_UNCERTAIN,
    });

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/commits?')) {
        return [{
          sha: 'commit_after_crash',
          commit: { message: 'Pre-crash commit' },
          parents: [{ sha: 'sha_0' }],
        }];
      }
      if (url.includes('/commits/commit_after_crash')) {
        return { sha: 'commit_after_crash' };
      }
      if (url.includes('/contents/')) {
        return { sha: 'blob_crash_verified' };
      }
      return {};
    });

    const recoveryResults = await coordinator.recoverPendingAttempts();
    expect(recoveryResults.length).toBe(1);
    expect(recoveryResults[0].status).toBe('RECONCILED');

    const recovered = recordService.getAttempt(crashedAttempt.attemptId);
    expect(recovered.state).toBe(PublicationState.PUBLISHED);
  });
});
