import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';
import { PublicationState, PublicationStateMachine, OutcomeState } from './publication-state.js';
import { publicationPreflightService } from './publication-preflight-service.js';
import { gitHubWriteClient, validateBranchName, isValidCommitSha } from './github-write-client.js';
import { publicationOutcomeVerifier } from './publication-outcome-verifier.js';
import { publicationRecordService } from './publication-record-service.js';
import { auditLogService } from './audit-log-service.js';
import { documentStateManager } from '../core/document-state-manager.js';
import { AppEvents, eventBus } from '../app/events.js';

/**
 * PublicationCoordinator
 * Central orchestrator of the Release 0.5 publishing lifecycle, enforcing:
 * - Invariant 1: Explicit user action initiates publication; no background writes.
 * - Invariant 4: Review snapshot immutability; edit invalidates confirmation.
 * - Invariant 8: Single write boundary; passes single-use tickets to write client.
 * - Invariant 14: Safe working branch workflow.
 * - Invariant 15: Distinct Pull Request lifecycle tracking.
 */
export class PublicationCoordinator {
  constructor(deps = {}) {
    this.preflight = deps.preflight || publicationPreflightService;
    this.writeClient = deps.writeClient || gitHubWriteClient;
    this.verifier = deps.verifier || publicationOutcomeVerifier;
    this.recordService = deps.recordService || publicationRecordService;
    this.stateManager = deps.stateManager || documentStateManager;
    this.auditLog = deps.auditLog || auditLogService;
    
    this.stateMachine = new PublicationStateMachine(PublicationState.DRAFT, [
      (newState, oldState, ctx) => this.onStateChange(newState, oldState, ctx),
    ]);

    this.activeSession = null;
  }

  /**
   * Internal listener emitting app-wide events on state transitions.
   */
  onStateChange(newState, oldState, context) {
    eventBus.emit('publication:state_change', {
      newState,
      oldState,
      context,
      attemptId: this.activeSession?.attempt?.attemptId,
    });
  }

  /**
   * Returns current state machine state.
   */
  getState() {
    return this.stateMachine.getState();
  }

  /**
   * Returns the active session if one is in-flight.
   */
  getActiveSession() {
    return this.activeSession;
  }

  /**
   * Initiates the publishing flow for a document: runs preflight and prepares review snapshot.
   * @param {string} docId
   * @returns {Promise<Object>}
   */
  async startPublication(docId) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document ${docId} not found.`);
    }

    // Reset state machine to DRAFT if previously in a terminal state
    const current = this.stateMachine.getState();
    if ([PublicationState.CANCELLED, PublicationState.FAILED_FINAL, PublicationState.FAILED_RETRYABLE, PublicationState.PUBLISHED].includes(current)) {
      this.stateMachine = new PublicationStateMachine(PublicationState.DRAFT, [
        (newState, oldState, ctx) => this.onStateChange(newState, oldState, ctx),
      ]);
    }

    this.stateMachine.transition(PublicationState.VALIDATING, { docId });

    try {
      // 1. Run preflight
      const preflightResult = await this.preflight.executePreflight(docId);

      // Handle Stale Base
      if (preflightResult.isStaleBase) {
        this.stateMachine.transition(PublicationState.STALE_BASE, preflightResult);
        this.stateMachine.transition(PublicationState.CONFLICT_REVIEW_REQUIRED, preflightResult);
        return {
          success: false,
          state: PublicationState.CONFLICT_REVIEW_REQUIRED,
          isStaleBase: true,
          details: preflightResult,
        };
      }

      this.stateMachine.transition(PublicationState.REMOTE_REFRESHING, { docId });
      this.stateMachine.transition(PublicationState.READY_FOR_REVIEW, { snapshot: preflightResult.snapshot });
      this.stateMachine.transition(PublicationState.AWAITING_CONFIRMATION, { snapshot: preflightResult.snapshot });

      const snapshot = preflightResult.snapshot;
      const attempt = this.recordService.createAttempt({
        documentId: docId,
        revision: snapshot.revision,
        reviewedSnapshot: {
          content: snapshot.content,
          contentHash: snapshot.contentHash,
          length: snapshot.length,
          linesCount: snapshot.linesCount,
        },
        destination: snapshot.destination,
        commitMessage: 'Update ' + snapshot.destination.path,
      });

      this.activeSession = {
        docId,
        snapshot,
        attempt,
      };

      return {
        success: true,
        state: PublicationState.AWAITING_CONFIRMATION,
        snapshot,
        attemptId: attempt.attemptId,
      };
    } catch (err) {
      if (this.stateMachine.canTransition(PublicationState.PREFLIGHT_FAILED)) {
        this.stateMachine.transition(PublicationState.PREFLIGHT_FAILED, { error: err.message });
      }
      throw err;
    }
  }

  /**
   * Confirms and executes publication after explicit user review.
   * 
   * @param {Object} params
   * @param {string} params.attemptId
   * @param {string} params.commitMessage
   * @param {string|null} [params.workingBranch]
   * @param {boolean} [params.openPullRequest=false]
   * @returns {Promise<Object>}
   */
  async confirmPublication({
    attemptId,
    commitMessage,
    workingBranch = null,
    openPullRequest = false,
  }) {
    if (this.stateMachine.getState() !== PublicationState.AWAITING_CONFIRMATION) {
      throw new StudioError(
        ErrorCode.INVALID_INPUT,
        `Cannot confirm publication in state ${this.stateMachine.getState()}. Preflight review is required.`
      );
    }

    if (!this.activeSession || this.activeSession.attempt.attemptId !== attemptId) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Active publication session mismatch or expired.');
    }

    const { docId, snapshot, attempt } = this.activeSession;
    const currentDoc = this.stateManager.documents.get(docId);

    // Invariant 4: Invalidate confirmation if document or destination changed after review
    const validation = this.preflight.validateConfirmation(snapshot, currentDoc);
    if (!validation.valid) {
      this.stateMachine.transition(PublicationState.CANCELLED, { reason: validation.reason });
      this.activeSession = null;
      throw new StudioError(
        ErrorCode.UNREVIEWED_CHANGE,
        `Publication confirmation rejected: The document was modified after review (${validation.reason}). Fresh preflight and review are required.`
      );
    }

    // Update attempt with final commit message
    const sanitizedMsg = redactSensitiveData(commitMessage || `Update ${snapshot.destination.path}`);
    const updatedAttempt = this.recordService.updateAttempt(attemptId, {
      commitMessage: sanitizedMsg,
      state: PublicationState.PUBLISHING,
    });
    this.activeSession.attempt = updatedAttempt || { ...attempt, commitMessage: sanitizedMsg };

    this.stateMachine.transition(PublicationState.PUBLISHING, { attemptId });

    // Create single-use ticket (Invariant 8)
    const ticket = {
      attemptId,
      issuedAt: new Date().toISOString(),
      consumed: false,
    };

    let targetBranch = snapshot.destination.branch;

    try {
      // Milestone G: Working branch workflow
      if (workingBranch && workingBranch.trim()) {
        const cleanBranch = workingBranch.trim();
        const branchValidation = validateBranchName(cleanBranch);
        if (!branchValidation.valid) {
          throw new StudioError(ErrorCode.INVALID_INPUT, `Invalid working branch name: ${branchValidation.error}`);
        }

        const targetBaseSha = snapshot.destination.currentBranchSha || snapshot.destination.baseCommitSha;
        if (!targetBaseSha || !isValidCommitSha(targetBaseSha)) {
          throw new StudioError(
            ErrorCode.PREFLIGHT_FAILED,
            `Cannot create working branch "${cleanBranch}": Base commit SHA is missing or invalid from remote preflight. Please refresh remote state and retry.`
          );
        }

        const branchTicket = {
          attemptId,
          issuedAt: new Date().toISOString(),
          consumed: false,
        };
        await this.writeClient.createBranch({
          ticket: branchTicket,
          owner: snapshot.destination.owner,
          repo: snapshot.destination.repo,
          branchName: cleanBranch,
          baseCommitSha: targetBaseSha,
        });
        targetBranch = cleanBranch;
      }

      // Publish file via GitHub Contents API
      const apiResponse = await this.writeClient.publishFile({
        ticket,
        owner: snapshot.destination.owner,
        repo: snapshot.destination.repo,
        path: snapshot.destination.path,
        branch: targetBranch,
        content: snapshot.content,
        commitMessage: sanitizedMsg,
        sha: snapshot.destination.isNewFile ? null : snapshot.destination.baseBlobSha,
        isNewFile: snapshot.destination.isNewFile,
      });

      // Remote write succeeded at provider level; transition to VERIFYING (Invariant 11)
      this.stateMachine.transition(PublicationState.VERIFYING, { apiResponse });

      const verifiedResult = await this.verifier.verifyPublicationOutcome(this.activeSession.attempt, apiResponse);

      // Milestone G: Open Pull Request if requested
      let prResult = null;
      if (openPullRequest && workingBranch) {
        try {
          prResult = await this.writeClient.createPullRequest({
            owner: snapshot.destination.owner,
            repo: snapshot.destination.repo,
            title: sanitizedMsg,
            body: `Automated documentation update for \`${snapshot.destination.path}\` via DevspireHub Markdown Studio.`,
            head: workingBranch,
            base: snapshot.destination.branch,
          });
          this.stateMachine.transition(PublicationState.PULL_REQUEST_CREATED, { workingBranch, prResult });
        } catch (prErr) {
          console.warn('Pull request creation failed:', prErr);
          this.stateMachine.transition(PublicationState.PUBLISHED, { verifiedResult });
        }
      } else {
        this.stateMachine.transition(PublicationState.PUBLISHED, { verifiedResult });
      }

      const finalState = this.stateMachine.getState();
      this.activeSession = null;

      this.auditLog.recordEvent({
        documentKey: snapshot.destination.path,
        action: 'PUBLISH_ATTEMPT',
        outcome: 'SUCCESS',
        contentHash: snapshot.destination.baseBlobSha || '',
        summary: `Published to ${snapshot.destination.owner}/${snapshot.destination.repo}:${targetBranch} (${verifiedResult.commitSha.slice(0, 7)})`,
        details: {
          attemptId,
          owner: snapshot.destination.owner,
          repo: snapshot.destination.repo,
          branch: targetBranch,
          commitSha: verifiedResult.commitSha,
          pullRequest: prResult ? prResult.html_url : null,
        },
      });

      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: `Successfully published ${snapshot.destination.path} to GitHub (${verifiedResult.commitSha.slice(0, 7)}).`,
      });

      return {
        success: true,
        state: finalState,
        verifiedResult,
        prResult,
      };
    } catch (err) {
      if (err.code === ErrorCode.CONFLICT_DETECTED) {
        this.recordService.updateAttempt(attemptId, {
          state: PublicationState.CONFLICT_REVIEW_REQUIRED,
          outcomeState: OutcomeState.REJECTED,
          error: err.message,
        });
        this.auditLog.recordEvent({
          documentKey: snapshot?.destination?.path || 'unknown',
          action: 'PUBLISH_ATTEMPT',
          outcome: 'FAILURE',
          summary: `Publication rejected (conflict): ${err.message}`,
          details: { attemptId, error: err.message },
        });
        this.stateMachine.transition(PublicationState.CONFLICT_REVIEW_REQUIRED, { error: err.message });
        return {
          success: false,
          state: PublicationState.CONFLICT_REVIEW_REQUIRED,
          error: err.message,
        };
      }

      if (err.code === ErrorCode.OUTCOME_UNCERTAIN) {
        // Invariant 9: Enter OUTCOME_UNCERTAIN and attempt reconciliation
        this.stateMachine.transition(PublicationState.OUTCOME_UNCERTAIN, { error: err.message });
        try {
          const targetAttempt = this.activeSession?.attempt || attempt;
          const reconcileResult = await this.verifier.reconcileAmbiguousOutcome(targetAttempt);
          if (reconcileResult.verified) {
            this.stateMachine.transition(PublicationState.VERIFYING, reconcileResult);
            this.stateMachine.transition(PublicationState.PUBLISHED, reconcileResult);
            this.auditLog.recordEvent({
              documentKey: snapshot?.destination?.path || 'unknown',
              action: 'PUBLISH_ATTEMPT',
              outcome: 'SUCCESS',
              summary: `Reconciled after uncertain outcome: published to ${targetBranch}`,
              details: { attemptId, reconciled: true },
            });
            this.activeSession = null;
            return {
              success: true,
              state: PublicationState.PUBLISHED,
              reconciled: true,
              verifiedResult: reconcileResult,
            };
          } else {
            this.stateMachine.transition(PublicationState.FAILED_RETRYABLE, reconcileResult);
            this.auditLog.recordEvent({
              documentKey: snapshot?.destination?.path || 'unknown',
              action: 'PUBLISH_ATTEMPT',
              outcome: 'FAILURE',
              summary: `Reconciliation failed: ${reconcileResult.message}`,
              details: { attemptId, reconciled: true },
            });
            return {
              success: false,
              state: PublicationState.FAILED_RETRYABLE,
              reconciled: true,
              message: reconcileResult.message,
            };
          }
        } catch (recErr) {
          // If reconciliation query also errors, remain OUTCOME_UNCERTAIN
          this.auditLog.recordEvent({
            documentKey: snapshot?.destination?.path || 'unknown',
            action: 'PUBLISH_ATTEMPT',
            outcome: 'UNCERTAIN',
            summary: `Uncertain publication outcome: ${recErr.message}`,
            details: { attemptId, error: recErr.message },
          });
          return {
            success: false,
            state: PublicationState.OUTCOME_UNCERTAIN,
            error: recErr.message,
          };
        }
      }

      if (this.stateMachine.canTransition(PublicationState.FAILED_RETRYABLE)) {
        this.stateMachine.transition(PublicationState.FAILED_RETRYABLE, { error: err.message });
      } else if (this.stateMachine.canTransition(PublicationState.FAILED_FINAL)) {
        this.stateMachine.transition(PublicationState.FAILED_FINAL, { error: err.message });
      }

      this.recordService.updateAttempt(attemptId, {
        state: this.stateMachine.getState(),
        error: err.message,
      });

      this.auditLog.recordEvent({
        documentKey: snapshot?.destination?.path || 'unknown',
        action: 'PUBLISH_ATTEMPT',
        outcome: 'FAILURE',
        summary: `Publication failed: ${err.message}`,
        details: { attemptId, error: err.message },
      });

      throw err;
    }
  }

  /**
   * Explicitly cancels an in-progress review or preflight before write.
   */
  cancelPublication() {
    const current = this.stateMachine.getState();
    if (this.stateMachine.canTransition(PublicationState.CANCELLED)) {
      this.stateMachine.transition(PublicationState.CANCELLED, { reason: 'USER_CANCELLED' });
      this.stateMachine.transition(PublicationState.DRAFT);
      this.auditLog.recordEvent({
        documentKey: this.activeSession?.snapshot?.destination?.path || 'unknown',
        action: 'PUBLISH_ATTEMPT',
        outcome: 'CANCELLED',
        summary: 'Publication cancelled by user',
        details: { attemptId: this.activeSession?.attempt?.attemptId },
      });
    }
    this.activeSession = null;
  }

  /**
   * Checks for and reconciles any uncertain publication attempts left from previous crashes or restarts.
   * Invariant 17: Restart recoverability.
   * @returns {Promise<Array<Object>>}
   */
  async recoverPendingAttempts() {
    const pending = this.recordService.getPendingAttempts();
    const results = [];

    for (const attempt of pending) {
      try {
        const res = await this.verifier.reconcileAmbiguousOutcome(attempt);
        results.push({ attemptId: attempt.attemptId, status: 'RECONCILED', res });
      } catch (err) {
        results.push({ attemptId: attempt.attemptId, status: 'RECONCILIATION_FAILED', error: err.message });
      }
    }

    return results;
  }
}

export const publicationCoordinator = new PublicationCoordinator();
