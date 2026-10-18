import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveCoordinator } from '../../src/core/save-coordinator.js';
import { crashRecoveryManager } from '../../src/core/recovery-manager.js';
import { gitHubWriteClient } from '../../src/services/github-write-client.js';
import { publicationCoordinator } from '../../src/services/publication-coordinator.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { StudioError } from '../../src/services/error-service.js';

describe('Security Invariants Audit (Release 0.5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Invariant 1: Local saveCoordinator NEVER triggers remote writes', async () => {
    const writeSpy = vi.spyOn(gitHubWriteClient, 'publishFile');

    const doc = documentStateManager.openDocument(
      'sec_test.md',
      '# Local Content',
      'hash_1',
      Date.now()
    );
    doc.remoteMetadata = {
      provider: 'github',
      owner: 'devspirehub',
      repo: 'repo',
      branch: 'main',
      path: 'sec_test.md',
      baseCommitSha: 'sha1',
    };

    await saveCoordinator.save(doc.id);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('Invariant 1: Crash recovery manager NEVER triggers remote writes', async () => {
    const writeSpy = vi.spyOn(gitHubWriteClient, 'publishFile');

    crashRecoveryManager.recordJournalEntry({
      id: 'doc_rec',
      name: 'rec.md',
      content: '# Recovered Text',
      state: 'DIRTY',
      revision: 1,
      remoteMetadata: {
        owner: 'o', repo: 'r', branch: 'main', path: 'p.md',
      },
    });

    const entries = crashRecoveryManager.getPendingRecoveries();
    expect(entries.length).toBeGreaterThan(0);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('Invariant 8: Direct write attempts without coordinator ticket are rejected', async () => {
    await expect(
      gitHubWriteClient.publishFile({
        ticket: null, // Bypassing coordinator
        owner: 'devspirehub',
        repo: 'repo',
        path: 'bypass.md',
        branch: 'main',
        content: '# Malicious Injected Write',
      })
    ).rejects.toThrow(StudioError);
  });

  it('Invariant 4: Stale confirmation after local edit is strictly rejected', async () => {
    const doc = documentStateManager.openDocument(
      'audit.md',
      '# Initial Spec',
      'hash_init',
      Date.now()
    );
    doc.remoteMetadata = {
      provider: 'github',
      owner: 'devspirehub',
      repo: 'audit-repo',
      branch: 'main',
      path: 'audit.md',
      baseCommitSha: 'sha_base',
      baseBlobSha: 'blob_base',
      baseContent: '# Initial Spec',
    };

    // Preflight
    vi.spyOn(publicationCoordinator.preflight, 'verifyAuthorization').mockResolvedValue(true);
    vi.spyOn(publicationCoordinator.preflight, 'checkRemoteFreshness').mockResolvedValue({
      currentBranchSha: 'sha_base',
      currentBlobSha: 'blob_base',
      isNewFile: false,
      isStaleBase: false,
    });

    const session = await publicationCoordinator.startPublication(doc.id);
    expect(session.success).toBe(true);

    // Attacker or user edits the document after review snapshot
    documentStateManager.updateContent(doc.id, '# Tampered Content After Review');

    // Attempting confirmation must fail immediately
    await expect(
      publicationCoordinator.confirmPublication({
        attemptId: session.attemptId,
        commitMessage: 'Tampered commit',
      })
    ).rejects.toThrow(StudioError);
  });

  it('Invariant 6: Concurrency safeguards cannot be bypassed (No Force Overwrite)', async () => {
    const validTicket = { attemptId: 'att_valid', consumed: false };
    
    // Attempting update without sha
    await expect(
      gitHubWriteClient.publishFile({
        ticket: validTicket,
        owner: 'o',
        repo: 'r',
        path: 'p.md',
        branch: 'main',
        content: 'content',
        sha: null,
        isNewFile: false,
      })
    ).rejects.toThrow(StudioError);
  });
});
