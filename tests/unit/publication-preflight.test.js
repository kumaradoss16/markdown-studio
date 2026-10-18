import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicationPreflightService, computeContentHash } from '../../src/services/publication-preflight-service.js';
import { StudioError, ErrorCode } from '../../src/services/error-service.js';

describe('PublicationPreflightService (Release 0.5)', () => {
  let preflightService;
  let mockClient;
  let mockAuth;
  let mockRepoService;
  let mockStateManager;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    };
    mockAuth = {
      getToken: vi.fn().mockResolvedValue('test_valid_token'),
    };
    mockRepoService = {
      getBranchCommitSha: vi.fn().mockResolvedValue('commit_sha_current'),
    };
    mockStateManager = {
      documents: new Map(),
    };

    preflightService = new PublicationPreflightService({
      client: mockClient,
      auth: mockAuth,
      repoService: mockRepoService,
      stateManager: mockStateManager,
    });
  });

  it('rejects drafts with path traversal or invalid characters', () => {
    const invalidDoc = {
      id: 'doc_trav',
      content: 'Sample text',
      remoteMetadata: {
        owner: 'owner',
        repo: 'repo',
        path: '../secret.md',
      },
    };
    expect(() => preflightService.validateLocalDraft(invalidDoc)).toThrow(StudioError);

    invalidDoc.remoteMetadata.path = 'docs/invalid*file.md';
    expect(() => preflightService.validateLocalDraft(invalidDoc)).toThrow(StudioError);
  });

  it('verifies write authorization against repository permissions', async () => {
    // Has push access
    mockClient.get.mockResolvedValueOnce({
      permissions: { push: true, admin: false },
    });
    const authorized = await preflightService.verifyAuthorization('owner', 'repo');
    expect(authorized).toBe(true);

    // Lacks push access
    mockClient.get.mockResolvedValueOnce({
      permissions: { push: false, admin: false },
    });
    await expect(preflightService.verifyAuthorization('owner', 'repo')).rejects.toThrow(
      StudioError
    );

    // HTTP 404
    mockClient.get.mockRejectedValueOnce({ status: 404, message: 'Not Found' });
    await expect(preflightService.verifyAuthorization('owner', 'repo')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });

    // HTTP 401
    mockClient.get.mockRejectedValueOnce({ status: 401, message: 'Bad credentials' });
    await expect(preflightService.verifyAuthorization('owner', 'repo')).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
    });

    // HTTP 403
    mockClient.get.mockRejectedValueOnce({ status: 403, message: 'Must have push access' });
    await expect(preflightService.verifyAuthorization('owner', 'repo')).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED_WRITE,
    });
  });

  it('detects STALE_BASE when remote branch has advanced', async () => {
    const meta = {
      owner: 'testowner',
      repo: 'testrepo',
      branch: 'main',
      path: 'README.md',
      baseCommitSha: 'commit_sha_old',
      baseBlobSha: 'blob_123',
    };

    // Branch commit is 'commit_sha_current', which differs from 'commit_sha_old'
    mockRepoService.getBranchCommitSha.mockResolvedValue('commit_sha_current');
    mockClient.get.mockResolvedValue({
      sha: 'blob_123',
    });

    const freshness = await preflightService.checkRemoteFreshness(meta);
    expect(freshness.isStaleBase).toBe(true);
    expect(freshness.staleReason).toContain('Branch main has moved');
  });

  it('detects STALE_BASE when remote file blob SHA has changed', async () => {
    const meta = {
      owner: 'testowner',
      repo: 'testrepo',
      branch: 'main',
      path: 'README.md',
      baseCommitSha: 'commit_sha_current',
      baseBlobSha: 'blob_old',
    };

    mockRepoService.getBranchCommitSha.mockResolvedValue('commit_sha_current');
    mockClient.get.mockResolvedValue({
      sha: 'blob_new_modified',
    });

    const freshness = await preflightService.checkRemoteFreshness(meta);
    expect(freshness.isStaleBase).toBe(true);
    expect(freshness.staleReason).toContain('blob SHA mismatch');
  });

  it('generates an immutable review snapshot on successful preflight', async () => {
    const doc = {
      id: 'doc_preflight_1',
      revision: 2,
      content: '# Heading\nUpdated line content',
      remoteMetadata: {
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        path: 'docs/guide.md',
        baseCommitSha: 'commit_sha_current',
        baseBlobSha: 'blob_sha_123',
        baseContent: '# Heading\nOriginal line content',
      },
    };
    mockStateManager.documents.set(doc.id, doc);

    // Repo check
    mockClient.get.mockImplementation(async (url) => {
      if (url.includes('/repos/testowner/testrepo/contents')) {
        return { sha: 'blob_sha_123', type: 'file' };
      }
      return { permissions: { push: true } };
    });

    const result = await preflightService.executePreflight(doc.id);
    expect(result.success).toBe(true);
    expect(result.isStaleBase).toBe(false);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.content).toBe(doc.content);
    expect(result.snapshot.contentHash).toBe(computeContentHash(doc.content));
    expect(result.snapshot.diff.length).toBeGreaterThan(0);
  });

  it('enforces Invariant 4: Any document edit after review invalidates confirmation', () => {
    const originalDoc = {
      id: 'doc_inv4',
      revision: 2,
      content: 'Original reviewed content',
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'file.md',
      },
    };

    const snapshot = {
      snapshotId: 'snap_123',
      documentId: 'doc_inv4',
      revision: 2,
      content: 'Original reviewed content',
      contentHash: computeContentHash('Original reviewed content'),
      destination: {
        owner: 'o', repo: 'r', branch: 'main', path: 'file.md',
      },
    };

    // Valid when identical
    expect(preflightService.validateConfirmation(snapshot, originalDoc).valid).toBe(true);

    // Invalid when user typed something new
    const editedDoc = {
      ...originalDoc,
      revision: 3,
      content: 'Original reviewed content + NEW EDITS',
    };
    const invalidation = preflightService.validateConfirmation(snapshot, editedDoc);
    expect(invalidation.valid).toBe(false);
    expect(invalidation.reason).toBe('REVISION_CHANGED');
  });
});
