import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';
import { gitHubApiClient } from './github-api-client.js';
import { gitHubAuthService } from './github-auth-service.js';
import { documentStateManager } from '../core/document-state-manager.js';
import { remoteDraftService, RemoteRelationshipState } from './remote-draft-service.js';
import { OutcomeState, PublicationState } from './publication-state.js';
import { publicationRecordService } from './publication-record-service.js';

/**
 * PublicationOutcomeVerifier
 * Handles post-write remote state verification, ambiguous network outcome reconciliation,
 * and local draft revision segregation enforcing:
 * - Invariant 9: Ambiguous-outcome reconciliation before retry.
 * - Invariant 11: Authoritative remote verification (HTTP 200 is acceptance, not verified proof).
 * - Invariant 12: Local revision segregation (publishing revision N preserves revision N+1).
 * - Invariant 17: Restart recoverability.
 */
export class PublicationOutcomeVerifier {
  constructor(deps = {}) {
    this.client = deps.client || gitHubApiClient;
    this.auth = deps.auth || gitHubAuthService;
    this.stateManager = deps.stateManager || documentStateManager;
    this.draftService = deps.draftService || remoteDraftService;
    this.recordService = deps.recordService || publicationRecordService;
  }

  /**
   * Authoritatively verifies that the published change exists on the remote repository.
   * 
   * @param {Object} params
   * @param {Object} params.attemptRecord
   * @param {Object} params.apiResponse - Direct response from GitHub Contents API
   * @returns {Promise<Object>} Verification details
   */
  async verifyPublicationOutcome(attemptRecord, apiResponse = null) {
    const dest = attemptRecord.destination;
    const token = await this.auth.getToken();

    const resultCommitSha = apiResponse?.commit?.sha || attemptRecord.resultCommitSha;
    const resultBlobSha = apiResponse?.content?.sha || attemptRecord.resultBlobSha;

    if (!resultCommitSha) {
      throw new StudioError(
        ErrorCode.VERIFICATION_FAILED,
        'Cannot verify outcome: No commit SHA available from publication response.'
      );
    }

    try {
      // 1. Verify remote commit exists on branch
      const commitEndpoint = `/repos/${encodeURIComponent(dest.owner)}/${encodeURIComponent(dest.repo)}/commits/${encodeURIComponent(resultCommitSha)}`;
      const commitData = await this.client.get(commitEndpoint, { token });

      if (!commitData || commitData.sha !== resultCommitSha) {
        throw new StudioError(
          ErrorCode.VERIFICATION_FAILED,
          `Remote commit verification failed: Commit ${resultCommitSha} not found on ${dest.owner}/${dest.repo}.`
        );
      }

      // 2. Verify file content/blob at commit SHA
      const encodedPath = dest.path.split('/').map(encodeURIComponent).join('/');
      const contentsEndpoint = `/repos/${encodeURIComponent(dest.owner)}/${encodeURIComponent(dest.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(resultCommitSha)}`;
      const fileData = await this.client.get(contentsEndpoint, { token });

      if (!fileData || (resultBlobSha && fileData.sha !== resultBlobSha)) {
        throw new StudioError(
          ErrorCode.VERIFICATION_FAILED,
          `Remote file blob verification failed: Expected blob ${resultBlobSha}, found ${fileData?.sha}.`
        );
      }

      // Update durable record
      this.recordService.updateAttempt(attemptRecord.attemptId, {
        state: PublicationState.PUBLISHED,
        outcomeState: OutcomeState.VERIFIED,
        resultCommitSha,
        resultBlobSha: fileData.sha,
        reconciliationNote: `Successfully verified commit ${resultCommitSha.slice(0, 7)} and blob ${fileData.sha.slice(0, 7)} on branch ${dest.branch}.`,
      });

      // 3. Reconcile local draft state (Invariant 12)
      this.reconcileLocalDraft(attemptRecord.documentId, attemptRecord, {
        commitSha: resultCommitSha,
        blobSha: fileData.sha,
        content: attemptRecord.reviewedSnapshot.content,
      });

      return {
        verified: true,
        commitSha: resultCommitSha,
        blobSha: fileData.sha,
        commitUrl: commitData.html_url || `https://github.com/${dest.owner}/${dest.repo}/commit/${resultCommitSha}`,
      };
    } catch (err) {
      this.recordService.updateAttempt(attemptRecord.attemptId, {
        state: PublicationState.VERIFYING,
        outcomeState: OutcomeState.VERIFICATION_FAILED,
        error: `Verification error: ${err.message}`,
        reconciliationNote: `Verification query failed: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Reconciles an ambiguous network outcome (timeout or lost response).
   * Queries commit history and remote file state to deduce if the write occurred.
   * 
   * @param {Object} attemptRecord
   * @returns {Promise<Object>} Reconciliation status
   */
  async reconcileAmbiguousOutcome(attemptRecord) {
    const dest = attemptRecord.destination;
    const token = await this.auth.getToken();

    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'Authentication is required to reconcile publication outcome.');
    }

    this.recordService.updateAttempt(attemptRecord.attemptId, {
      state: PublicationState.OUTCOME_UNCERTAIN,
      outcomeState: OutcomeState.OUTCOME_UNCERTAIN,
      reconciliationNote: 'Initiated ambiguous outcome reconciliation against remote commit log.',
    });

    try {
      // 1. Query latest commits on the target branch for the specific file
      const encodedPath = dest.path.split('/').map(encodeURIComponent).join('/');
      const commitsEndpoint = `/repos/${encodeURIComponent(dest.owner)}/${encodeURIComponent(dest.repo)}/commits?path=${encodedPath}&sha=${encodeURIComponent(dest.branch)}&per_page=5`;
      
      const commits = await this.client.get(commitsEndpoint, { token });

      if (Array.isArray(commits) && commits.length > 0) {
        const latestCommit = commits[0];
        
        // Check commit message and parent
        const messageMatches = latestCommit.commit?.message?.trim() === attemptRecord.commitMessage?.trim();
        const parentMatches = dest.baseCommitSha
          ? latestCommit.parents?.some((p) => p.sha === dest.baseCommitSha)
          : true;

        // Fetch remote file at this latest commit
        const contentsEndpoint = `/repos/${encodeURIComponent(dest.owner)}/${encodeURIComponent(dest.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(latestCommit.sha)}`;
        const remoteFile = await this.client.get(contentsEndpoint, { token });

        if (messageMatches && parentMatches && remoteFile) {
          // Commit matches! Transition to VERIFYING and complete verification
          this.recordService.updateAttempt(attemptRecord.attemptId, {
            state: PublicationState.VERIFYING,
            outcomeState: OutcomeState.COMMIT_CONFIRMED,
            resultCommitSha: latestCommit.sha,
            resultBlobSha: remoteFile.sha,
            reconciliationNote: `Commit ${latestCommit.sha.slice(0, 7)} identified on ${dest.branch} matching intended publication.`,
          });

          return await this.verifyPublicationOutcome(attemptRecord, {
            commit: { sha: latestCommit.sha, html_url: latestCommit.html_url },
            content: { sha: remoteFile.sha },
          });
        }
      }

      // If no matching commit was found, check if branch moved
      const currentBranchSha = await this.client.get(`/repos/${encodeURIComponent(dest.owner)}/${encodeURIComponent(dest.repo)}/commits/${encodeURIComponent(dest.branch)}`, { token });
      
      const branchMoved = dest.baseCommitSha && currentBranchSha?.sha !== dest.baseCommitSha;

      if (branchMoved) {
        this.recordService.updateAttempt(attemptRecord.attemptId, {
          state: PublicationState.CONFLICT_REVIEW_REQUIRED,
          outcomeState: OutcomeState.REJECTED,
          reconciliationNote: `Branch ${dest.branch} moved independently to ${currentBranchSha?.sha?.slice(0, 7)}. Remote write did not commit.`,
        });

        return {
          verified: false,
          outcomeState: OutcomeState.REJECTED,
          reason: 'BRANCH_MOVED_EXTERNALLY',
          message: 'The publication did not commit; the remote branch has moved. A new review is required.',
        };
      }

      // Write was likely not accepted by GitHub before disconnect
      this.recordService.updateAttempt(attemptRecord.attemptId, {
        state: PublicationState.FAILED_RETRYABLE,
        outcomeState: OutcomeState.NOT_SENT,
        reconciliationNote: 'Reconciliation established that the write was not committed on the remote repository. Safe to retry after review.',
      });

      return {
        verified: false,
        outcomeState: OutcomeState.NOT_SENT,
        reason: 'NOT_COMMITTED',
        message: 'The write request was not committed on GitHub. You may retry after verifying your network connection.',
      };
    } catch (reconcileErr) {
      this.recordService.updateAttempt(attemptRecord.attemptId, {
        error: `Reconciliation error: ${reconcileErr.message}`,
        reconciliationNote: `Reconciliation query failed: ${reconcileErr.message}`,
      });
      throw reconcileErr;
    }
  }

  /**
   * Reconciles the local document state after verified publication.
   * Invariant 12: Preserves in-flight local edits (revision N+1) if user edited during publication!
   * 
   * @param {string} docId
   * @param {Object} attemptRecord
   * @param {Object} remoteInfo - { commitSha, blobSha, content }
   */
  reconcileLocalDraft(docId, attemptRecord, remoteInfo) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc) return;

    const publishedRevision = attemptRecord.revision;
    const reviewedContent = attemptRecord.reviewedSnapshot.content;

    // Advance base metadata to the verified remote commit and blob
    doc.remoteMetadata = {
      ...(doc.remoteMetadata || {}),
      baseCommitSha: remoteInfo.commitSha,
      baseBlobSha: remoteInfo.blobSha,
      baseContent: reviewedContent,
      lastFetchedCommitSha: remoteInfo.commitSha,
      lastRefreshTimestamp: Date.now(),
      relationshipState: RemoteRelationshipState.REMOTE_CLEAN,
      isStaleBase: false,
    };

    doc.lastPublishedRevision = publishedRevision;

    // Check if user edited document while publication was in-flight (Invariant 12)
    const userMadeEditsDuringPublication = doc.content !== reviewedContent;

    if (userMadeEditsDuringPublication) {
      // Preserve revision N+1! Keep document marked dirty / modified
      doc.state = 'MODIFIED';
      doc.remoteMetadata.relationshipState = RemoteRelationshipState.REMOTE_DIRTY;
    } else {
      // No subsequent edits: mark clean
      doc.state = 'CLEAN';
      doc.savedRevision = doc.revision;
    }
  }
}

export const publicationOutcomeVerifier = new PublicationOutcomeVerifier();
