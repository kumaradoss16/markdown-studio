import { describe, it, expect, vi } from 'vitest';
import { PublicationState, OutcomeState, PublicationStateMachine } from '../../src/services/publication-state.js';
import { StudioError, ErrorCode } from '../../src/services/error-service.js';

describe('PublicationStateMachine (Release 0.5)', () => {
  it('initializes in DRAFT state with empty history except initial', () => {
    const sm = new PublicationStateMachine();
    expect(sm.getState()).toBe(PublicationState.DRAFT);
    expect(sm.getHistory().length).toBe(1);
    expect(sm.getHistory()[0].state).toBe(PublicationState.DRAFT);
  });

  it('allows valid state progression: DRAFT -> VALIDATING -> REMOTE_REFRESHING -> READY_FOR_REVIEW -> AWAITING_CONFIRMATION', () => {
    const sm = new PublicationStateMachine();
    expect(sm.canTransition(PublicationState.VALIDATING)).toBe(true);

    sm.transition(PublicationState.VALIDATING);
    expect(sm.getState()).toBe(PublicationState.VALIDATING);

    sm.transition(PublicationState.REMOTE_REFRESHING);
    expect(sm.getState()).toBe(PublicationState.REMOTE_REFRESHING);

    sm.transition(PublicationState.READY_FOR_REVIEW);
    expect(sm.getState()).toBe(PublicationState.READY_FOR_REVIEW);

    sm.transition(PublicationState.AWAITING_CONFIRMATION);
    expect(sm.getState()).toBe(PublicationState.AWAITING_CONFIRMATION);
  });

  it('rejects invalid state transitions (e.g. DRAFT directly to PUBLISHING)', () => {
    const sm = new PublicationStateMachine();
    expect(() => sm.transition(PublicationState.PUBLISHING)).toThrow(StudioError);
    expect(() => sm.transition(PublicationState.PUBLISHED)).toThrow(StudioError);
  });

  it('records full audit history on transitions', () => {
    const sm = new PublicationStateMachine();
    sm.transition(PublicationState.VALIDATING, { testKey: 'val1' });
    const history = sm.getHistory();
    expect(history.length).toBe(2);
    expect(history[1].from).toBe(PublicationState.DRAFT);
    expect(history[1].to).toBe(PublicationState.VALIDATING);
    expect(history[1].context.testKey).toBe('val1');
  });

  it('notifies subscribers on transition', () => {
    const listener = vi.fn();
    const sm = new PublicationStateMachine(PublicationState.DRAFT, [listener]);
    sm.transition(PublicationState.VALIDATING, { docId: 'doc1' });
    expect(listener).toHaveBeenCalledWith(
      PublicationState.VALIDATING,
      PublicationState.DRAFT,
      { docId: 'doc1' }
    );
  });

  it('supports cancellation from AWAITING_CONFIRMATION back to DRAFT', () => {
    const sm = new PublicationStateMachine();
    sm.transition(PublicationState.VALIDATING);
    sm.transition(PublicationState.REMOTE_REFRESHING);
    sm.transition(PublicationState.READY_FOR_REVIEW);
    sm.transition(PublicationState.AWAITING_CONFIRMATION);

    sm.transition(PublicationState.CANCELLED);
    expect(sm.getState()).toBe(PublicationState.CANCELLED);

    sm.transition(PublicationState.DRAFT);
    expect(sm.getState()).toBe(PublicationState.DRAFT);
  });

  it('handles STALE_BASE branching and CONFLICT_REVIEW_REQUIRED', () => {
    const sm = new PublicationStateMachine();
    sm.transition(PublicationState.VALIDATING);
    sm.transition(PublicationState.REMOTE_REFRESHING);
    sm.transition(PublicationState.STALE_BASE);
    expect(sm.getState()).toBe(PublicationState.STALE_BASE);

    sm.transition(PublicationState.CONFLICT_REVIEW_REQUIRED);
    expect(sm.getState()).toBe(PublicationState.CONFLICT_REVIEW_REQUIRED);
  });
});
