import { describe, it, expect, beforeEach } from 'vitest';
import { PublicationRecordService } from '../../src/services/publication-record-service.js';
import { PublicationState, OutcomeState } from '../../src/services/publication-state.js';

describe('PublicationRecordService (Release 0.5)', () => {
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
  });

  it('generates unique collision-resistant attempt IDs', () => {
    const id1 = recordService.generateAttemptId();
    const id2 = recordService.generateAttemptId();
    expect(id1).toMatch(/^pub_/);
    expect(id2).toMatch(/^pub_/);
    expect(id1).not.toBe(id2);
  });

  it('creates attempt records and persists to durable storage', () => {
    const attempt = recordService.createAttempt({
      documentId: 'doc_123',
      revision: 3,
      reviewedSnapshot: { contentHash: 'abc12345', length: 100, linesCount: 5 },
      destination: {
        provider: 'github',
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        path: 'docs/test.md',
        baseCommitSha: 'sha111',
      },
      commitMessage: 'Add initial documentation',
    });

    expect(attempt.attemptId).toBeDefined();
    expect(attempt.documentId).toBe('doc_123');
    expect(attempt.state).toBe(PublicationState.READY_FOR_REVIEW);
    expect(attempt.outcomeState).toBe(OutcomeState.NOT_SENT);

    const fetched = recordService.getAttempt(attempt.attemptId);
    expect(fetched).not.toBeNull();
    expect(fetched.destination.path).toBe('docs/test.md');
  });

  it('enforces Invariant 16: Zero credentials or tokens saved in journal records', () => {
    const sensitiveToken = 'ghp_1234567890abcdef1234567890abcdef1234';
    const attempt = recordService.createAttempt({
      documentId: 'doc_sec',
      revision: 1,
      reviewedSnapshot: { contentHash: '123' },
      destination: { owner: 'owner', repo: 'repo', branch: 'main', path: 'file.md' },
      commitMessage: `Update with token ${sensitiveToken}`,
    });

    expect(attempt.commitMessage).not.toContain(sensitiveToken);
    expect(attempt.commitMessage).toContain('[REDACTED_TOKEN]');

    // Also verify errors are sanitized
    const updated = recordService.updateAttempt(attempt.attemptId, {
      error: `Failed auth: Bearer ${sensitiveToken}`,
    });
    expect(updated.error).not.toContain(sensitiveToken);
    expect(updated.error).toContain('[REDACTED]');
  });

  it('returns pending attempts for crash/restart recovery (Invariant 17)', () => {
    const attempt1 = recordService.createAttempt({
      documentId: 'doc_1',
      destination: { owner: 'o', repo: 'r', branch: 'main', path: 'p1.md' },
    });
    const attempt2 = recordService.createAttempt({
      documentId: 'doc_2',
      destination: { owner: 'o', repo: 'r', branch: 'main', path: 'p2.md' },
    });

    // Mark attempt1 as PUBLISHING (in-flight when crash occurs)
    recordService.updateAttempt(attempt1.attemptId, {
      state: PublicationState.PUBLISHING,
    });

    // Mark attempt2 as OUTCOME_UNCERTAIN
    recordService.updateAttempt(attempt2.attemptId, {
      state: PublicationState.OUTCOME_UNCERTAIN,
    });

    const pending = recordService.getPendingAttempts();
    expect(pending.length).toBe(2);
    expect(pending.map(p => p.attemptId)).toContain(attempt1.attemptId);
    expect(pending.map(p => p.attemptId)).toContain(attempt2.attemptId);
  });
});
