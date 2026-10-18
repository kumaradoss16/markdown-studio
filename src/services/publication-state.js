import { StudioError, ErrorCode } from './error-service.js';

/**
 * Publication State Definitions for Release 0.5
 */
export const PublicationState = {
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
  REMOTE_REFRESHING: 'REMOTE_REFRESHING',
  STALE_BASE: 'STALE_BASE',
  CONFLICT_REVIEW_REQUIRED: 'CONFLICT_REVIEW_REQUIRED',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  PUBLISHING: 'PUBLISHING',
  OUTCOME_UNCERTAIN: 'OUTCOME_UNCERTAIN',
  VERIFYING: 'VERIFYING',
  PUBLISHED: 'PUBLISHED',
  PULL_REQUEST_CREATED: 'PULL_REQUEST_CREATED',
  PULL_REQUEST_VERIFICATION_PENDING: 'PULL_REQUEST_VERIFICATION_PENDING',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
  CANCELLED: 'CANCELLED',
};

/**
 * Network / Write Outcome States
 */
export const OutcomeState = {
  NOT_SENT: 'NOT_SENT',
  REJECTED: 'REJECTED',
  COMMIT_CONFIRMED: 'COMMIT_CONFIRMED',
  OUTCOME_UNCERTAIN: 'OUTCOME_UNCERTAIN',
  VERIFIED: 'VERIFIED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
};

/**
 * Valid state transition rules enforcing Invariant 1 (explicit intent),
 * Invariant 2 (mandatory preflight), Invariant 4 (snapshot review),
 * and Invariant 9 (reconciliation before retry).
 */
export const VALID_TRANSITIONS = {
  [PublicationState.DRAFT]: [
    PublicationState.VALIDATING,
  ],
  [PublicationState.VALIDATING]: [
    PublicationState.PREFLIGHT_FAILED,
    PublicationState.REMOTE_REFRESHING,
    PublicationState.STALE_BASE,
    PublicationState.FAILED_FINAL,
    PublicationState.CANCELLED,
  ],
  [PublicationState.PREFLIGHT_FAILED]: [
    PublicationState.DRAFT,
    PublicationState.VALIDATING,
    PublicationState.CANCELLED,
  ],
  [PublicationState.REMOTE_REFRESHING]: [
    PublicationState.STALE_BASE,
    PublicationState.READY_FOR_REVIEW,
    PublicationState.FAILED_RETRYABLE,
    PublicationState.FAILED_FINAL,
    PublicationState.CANCELLED,
  ],
  [PublicationState.STALE_BASE]: [
    PublicationState.CONFLICT_REVIEW_REQUIRED,
    PublicationState.DRAFT,
    PublicationState.VALIDATING,
    PublicationState.CANCELLED,
  ],
  [PublicationState.CONFLICT_REVIEW_REQUIRED]: [
    PublicationState.DRAFT,
    PublicationState.VALIDATING,
    PublicationState.CANCELLED,
  ],
  [PublicationState.READY_FOR_REVIEW]: [
    PublicationState.AWAITING_CONFIRMATION,
    PublicationState.DRAFT,
    PublicationState.CANCELLED,
    PublicationState.VALIDATING,
  ],
  [PublicationState.AWAITING_CONFIRMATION]: [
    PublicationState.PUBLISHING,
    PublicationState.CANCELLED,
    PublicationState.DRAFT,
    PublicationState.VALIDATING,
    PublicationState.STALE_BASE,
  ],
  [PublicationState.PUBLISHING]: [
    PublicationState.OUTCOME_UNCERTAIN,
    PublicationState.VERIFYING,
    PublicationState.FAILED_RETRYABLE,
    PublicationState.FAILED_FINAL,
    PublicationState.CONFLICT_REVIEW_REQUIRED,
  ],
  [PublicationState.OUTCOME_UNCERTAIN]: [
    PublicationState.VERIFYING,
    PublicationState.CONFLICT_REVIEW_REQUIRED,
    PublicationState.FAILED_RETRYABLE,
    PublicationState.FAILED_FINAL,
    PublicationState.DRAFT,
  ],
  [PublicationState.VERIFYING]: [
    PublicationState.PUBLISHED,
    PublicationState.PULL_REQUEST_CREATED,
    PublicationState.VERIFICATION_FAILED,
    PublicationState.OUTCOME_UNCERTAIN,
    PublicationState.FAILED_FINAL,
  ],
  [PublicationState.PUBLISHED]: [
    PublicationState.DRAFT,
    PublicationState.PULL_REQUEST_CREATED,
    PublicationState.VALIDATING,
  ],
  [PublicationState.PULL_REQUEST_CREATED]: [
    PublicationState.PUBLISHED,
    PublicationState.PULL_REQUEST_VERIFICATION_PENDING,
    PublicationState.DRAFT,
  ],
  [PublicationState.PULL_REQUEST_VERIFICATION_PENDING]: [
    PublicationState.PULL_REQUEST_CREATED,
    PublicationState.DRAFT,
  ],
  [PublicationState.FAILED_RETRYABLE]: [
    PublicationState.VALIDATING,
    PublicationState.DRAFT,
    PublicationState.CANCELLED,
  ],
  [PublicationState.FAILED_FINAL]: [
    PublicationState.DRAFT,
  ],
  [PublicationState.CANCELLED]: [
    PublicationState.DRAFT,
    PublicationState.VALIDATING,
  ],
};

/**
 * PublicationStateMachine
 * Tracks state transitions, maintains history, and verifies invariants.
 */
export class PublicationStateMachine {
  constructor(initialState = PublicationState.DRAFT, listeners = []) {
    this.currentState = initialState;
    this.history = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        context: null,
      },
    ];
    this.listeners = [...listeners];
  }

  /**
   * Current state getter
   */
  getState() {
    return this.currentState;
  }

  /**
   * History getter
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Validates if transition is allowed
   * @param {string} nextState
   * @returns {boolean}
   */
  canTransition(nextState) {
    const allowed = VALID_TRANSITIONS[this.currentState] || [];
    return allowed.includes(nextState);
  }

  /**
   * Executes a state transition. Throws if invalid.
   * @param {string} nextState
   * @param {Object} [context]
   */
  transition(nextState, context = {}) {
    if (!this.canTransition(nextState)) {
      throw new StudioError(
        ErrorCode.INVALID_INPUT,
        `Invalid publication state transition from ${this.currentState} to ${nextState}.`
      );
    }

    const previousState = this.currentState;
    this.currentState = nextState;
    const record = {
      from: previousState,
      to: nextState,
      timestamp: new Date().toISOString(),
      context,
    };
    this.history.push(record);

    for (const listener of this.listeners) {
      try {
        listener(nextState, previousState, context);
      } catch (err) {
        console.error('Publication state listener error:', err);
      }
    }

    return record;
  }

  /**
   * Subscribes a listener to state changes
   * @param {Function} listener
   * @returns {Function} unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
