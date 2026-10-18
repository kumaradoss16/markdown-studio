import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicationCoordinator } from '../../src/services/publication-coordinator.js';
import { PublicationPreflightService } from '../../src/services/publication-preflight-service.js';
import { GitHubWriteClient } from '../../src/services/github-write-client.js';
import { PublicationOutcomeVerifier } from '../../src/services/publication-outcome-verifier.js';
import { PublicationRecordService } from '../../src/services/publication-record-service.js';
import { PublicationState } from '../../src/services/publication-state.js';

describe('Integration: Safe GitHub Publishing Workflow (Release 0.5)', () => {
  let coordinator;
  let mockClient;
  let mockAuth;
  let mockRepoService;
  let mockStateManager;
  let mockStorage;
  let recordService;
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
    mockAuth = { getToken: vi.fn().mockResolvedValue('ghp_test_token') };
    mockClient = { get: vi.fn() };
    mockRepoService = { getBranchCommitSha: vi.fn().mockResolvedValue('commit_base_sha') };
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

  it('completes end-to-end safe publication of an existing Markdown file', async () => {
    const doc = {
      id: 'doc_publish_e2e',
      revision: 1,
      content: '# Verified System Specs\nAll systems operational.',
      state: 'MODIFIED',
      remoteMetadata: {
        provider: 'github',
        owner: 'devspirehub',
        repo: 'specs',
        branch: 'main',
        path: 'specs/system.md',
        baseCommitSha: 'commit_base_sha',
        baseBlobSha: 'blob_base_sha',
        baseContent: '# System Specs\nDrafting.',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    // Mock GitHub API responses
    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/repos/devspirehub/specs/commits/commit_new_sha')) {
        return { sha: 'commit_new_sha', html_url: 'https://github.com/devspirehub/specs/commit/commit_new_sha' };
      }
      if (url.includes('ref=commit_new_sha')) {
        return { sha: 'blob_new_sha', type: 'file' };
      }
      if (url.includes('/repos/devspirehub/specs/contents/')) {
        return { sha: 'blob_base_sha', type: 'file' };
      }
      if (url.includes('/repos/devspirehub/specs/commits')) {
        return { sha: 'commit_base_sha' };
      }
      return { permissions: { push: true } };
    });

    writeClient.setTransport(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        commit: { sha: 'commit_new_sha' },
        content: { sha: 'blob_new_sha' },
      }),
    }));

    // Step 1: Start publication (Preflight & Review Snapshot)
    const reviewResult = await coordinator.startPublication(doc.id);
    expect(reviewResult.success).toBe(true);
    expect(reviewResult.state).toBe(PublicationState.AWAITING_CONFIRMATION);
    expect(reviewResult.snapshot.destination.path).toBe('specs/system.md');

    // Step 2: Confirm publication with commit message
    const confirmResult = await coordinator.confirmPublication({
      attemptId: reviewResult.attemptId,
      commitMessage: 'docs: finalize system specifications',
    });

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.state).toBe(PublicationState.PUBLISHED);
    expect(confirmResult.verifiedResult.commitSha).toBe('commit_new_sha');

    // Verify local document was reconciled
    expect(doc.remoteMetadata.baseCommitSha).toBe('commit_new_sha');
    expect(doc.remoteMetadata.baseBlobSha).toBe('blob_new_sha');
    expect(doc.state).toBe('CLEAN');
  });

  it('blocks publication when remote state is stale (Invariant 5)', async () => {
    const doc = {
      id: 'doc_stale',
      revision: 1,
      content: '# Local Changes',
      remoteMetadata: {
        owner: 'devspirehub',
        repo: 'specs',
        branch: 'main',
        path: 'specs/system.md',
        baseCommitSha: 'commit_old_sha',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    // Branch commit has moved to 'commit_new_remote_sha'
    mockRepoService.getBranchCommitSha.mockResolvedValue('commit_new_remote_sha');
    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/contents/')) return { sha: 'blob_remote' };
      return { permissions: { push: true } };
    });

    const result = await coordinator.startPublication(doc.id);
    expect(result.success).toBe(false);
    expect(result.isStaleBase).toBe(true);
    expect(coordinator.getState()).toBe(PublicationState.CONFLICT_REVIEW_REQUIRED);
  });

  it('supports working-branch and pull-request workflow (Invariant 14 & 15)', async () => {
    const doc = {
      id: 'doc_pr',
      revision: 1,
      content: '# Feature Proposal',
      state: 'MODIFIED',
      remoteMetadata: {
        owner: 'devspirehub',
        repo: 'specs',
        branch: 'main',
        path: 'specs/proposal.md',
        baseCommitSha: 'commit_base_sha',
        baseBlobSha: 'blob_base_sha',
        baseContent: '# Initial Proposal',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('ref=commit_feature_sha')) return { sha: 'blob_feature_sha', type: 'file' };
      if (url.includes('/contents/')) return { sha: 'blob_base_sha', type: 'file' };
      if (url.includes('/commits/')) return { sha: 'commit_feature_sha', html_url: 'https://github.com/devspirehub/specs/commit/commit_feature_sha' };
      return { permissions: { push: true } };
    });

    const transportSpy = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/git/refs')) {
        return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/feature-branch' }) };
      }
      if (url.includes('/pulls')) {
        return { ok: true, status: 201, json: async () => ({ id: 42, number: 1, html_url: 'https://github.com/devspirehub/specs/pull/1' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          commit: { sha: 'commit_feature_sha' },
          content: { sha: 'blob_feature_sha' },
        }),
      };
    });
    writeClient.setTransport(transportSpy);

    const review = await coordinator.startPublication(doc.id);
    expect(review.success).toBe(true);

    const publishResult = await coordinator.confirmPublication({
      attemptId: review.attemptId,
      commitMessage: 'feat: add proposal document',
      workingBranch: 'feature-branch',
      openPullRequest: true,
    });

    expect(publishResult.success).toBe(true);
    expect(publishResult.prResult).toBeDefined();
    expect(publishResult.prResult.number).toBe(1);

    // Verify /git/refs WAS called with refs/heads/feature-branch
    expect(transportSpy).toHaveBeenCalledWith(
      expect.stringContaining('/git/refs'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ref: 'refs/heads/feature-branch',
          sha: 'commit_base_sha',
        }),
      })
    );
  });

  it('direct publish (no working branch) never calls /git/refs endpoint', async () => {
    const doc = {
      id: 'doc_direct_only',
      revision: 1,
      content: '# Direct Publish Only',
      state: 'MODIFIED',
      remoteMetadata: {
        owner: 'devspirehub',
        repo: 'specs',
        branch: 'main',
        path: 'specs/direct.md',
        baseCommitSha: 'commit_base_sha',
        baseBlobSha: 'blob_base_sha',
        baseContent: '# Initial',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('ref=commit_direct_sha')) return { sha: 'blob_direct_sha', type: 'file' };
      if (url.includes('/contents/')) return { sha: 'blob_base_sha', type: 'file' };
      if (url.includes('/commits/')) return { sha: 'commit_direct_sha', html_url: 'https://github.com/devspirehub/specs/commit/commit_direct_sha' };
      return { permissions: { push: true } };
    });

    const transportSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        commit: { sha: 'commit_direct_sha' },
        content: { sha: 'blob_direct_sha' },
      }),
    });
    writeClient.setTransport(transportSpy);

    const review = await coordinator.startPublication(doc.id);
    expect(review.success).toBe(true);

    // Confirm without workingBranch
    const res = await coordinator.confirmPublication({
      attemptId: review.attemptId,
      commitMessage: 'docs: update directly on main branch',
      workingBranch: null, // No working branch
    });

    expect(res.success).toBe(true);

    // Ensure /git/refs was NEVER called
    const gitRefsCalls = transportSpy.mock.calls.filter(([url]) => url.includes('/git/refs'));
    expect(gitRefsCalls).toHaveLength(0);
  });

  it('rejects confirmation before calling /git/refs if working branch name is invalid', async () => {
    const doc = {
      id: 'doc_invalid_branch',
      revision: 1,
      content: '# Invalid Branch Draft',
      state: 'MODIFIED',
      remoteMetadata: {
        owner: 'devspirehub',
        repo: 'specs',
        branch: 'main',
        path: 'specs/doc.md',
        baseCommitSha: 'commit_base_sha',
        baseBlobSha: 'blob_base_sha',
        baseContent: '# Old',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    mockClient.get.mockImplementation(async () => ({ permissions: { push: true } }));
    const transportSpy = vi.fn();
    writeClient.setTransport(transportSpy);

    const review = await coordinator.startPublication(doc.id);
    expect(review.success).toBe(true);

    // Invalid branch name with spaces and refs/heads prefix
    await expect(
      coordinator.confirmPublication({
        attemptId: review.attemptId,
        commitMessage: 'docs: test invalid branch',
        workingBranch: 'refs/heads/invalid branch name',
      })
    ).rejects.toThrowError(/Invalid working branch name/);

    expect(transportSpy).not.toHaveBeenCalled();
  });
});
