import { redactSensitiveData } from './error-service.js';
import { PublicationState, OutcomeState } from './publication-state.js';

const STORAGE_KEY = 'devspirehub:publication_journal:v1';

/**
 * PublicationRecordService
 * Durably journals publication attempts across app restarts and crashes,
 * enforcing Invariant 16 (zero credential leakage) and Invariant 17 (restart recoverability).
 */
export class PublicationRecordService {
  constructor(storage = null) {
    if (storage) {
      this.storage = storage;
    } else if (typeof localStorage !== 'undefined') {
      this.storage = localStorage;
    } else {
      // In-memory fallback for headless or non-browser environments
      this.storage = {
        _data: {},
        getItem: (k) => (this.storage._data[k] !== undefined ? this.storage._data[k] : null),
        setItem: (k, v) => { this.storage._data[k] = String(v); },
        removeItem: (k) => { delete this.storage._data[k]; },
        clear: () => { this.storage._data = {}; },
      };
    }
  }

  /**
   * Generates a collision-resistant unique attempt ID.
   * @returns {string}
   */
  generateAttemptId() {
    return 'pub_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Loads all recorded attempts from storage.
   * @returns {Array<Object>}
   */
  getAllAttempts() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Failed to parse publication journal:', err);
      return [];
    }
  }

  /**
   * Persists attempts array to storage.
   * @param {Array<Object>} attempts
   */
  saveAttempts(attempts) {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(attempts));
    } catch (err) {
      console.error('Failed to save publication journal to storage:', err);
    }
  }

  /**
   * Creates a new durable publication attempt record.
   * @param {Object} params
   * @param {string} params.documentId
   * @param {number|string} params.revision
   * @param {Object} params.reviewedSnapshot - { contentHash, length, linesCount }
   * @param {Object} params.destination - { provider, owner, repo, branch, path, baseCommitSha, baseBlobSha }
   * @param {string} params.commitMessage
   * @returns {Object} Created attempt record
   */
  createAttempt({ documentId, revision, reviewedSnapshot, destination, commitMessage }) {
    const attemptId = this.generateAttemptId();
    const now = new Date().toISOString();

    const record = {
      attemptId,
      documentId: String(documentId || ''),
      revision: revision !== undefined ? revision : 1,
      reviewedSnapshot: {
        content: reviewedSnapshot?.content || '',
        contentHash: reviewedSnapshot?.contentHash || '',
        length: reviewedSnapshot?.length || 0,
        linesCount: reviewedSnapshot?.linesCount || 0,
      },
      destination: {
        provider: destination?.provider || 'github',
        owner: destination?.owner || '',
        repo: destination?.repo || '',
        branch: destination?.branch || '',
        path: destination?.path || '',
        baseCommitSha: destination?.baseCommitSha || null,
        baseBlobSha: destination?.baseBlobSha || null,
      },
      commitMessage: redactSensitiveData(commitMessage || 'Update markdown via DevspireHub Markdown Studio'),
      state: PublicationState.READY_FOR_REVIEW,
      outcomeState: OutcomeState.NOT_SENT,
      createdAt: now,
      updatedAt: now,
      resultCommitSha: null,
      resultBlobSha: null,
      reconciliationNotes: [],
      error: null,
    };

    const attempts = this.getAllAttempts();
    attempts.unshift(record);
    // Keep at most 100 historical records
    if (attempts.length > 100) {
      attempts.length = 100;
    }
    this.saveAttempts(attempts);
    return record;
  }

  /**
   * Updates an existing publication attempt.
   * @param {string} attemptId
   * @param {Object} updates
   * @returns {Object|null}
   */
  updateAttempt(attemptId, updates) {
    const attempts = this.getAllAttempts();
    const idx = attempts.findIndex((a) => a.attemptId === attemptId);
    if (idx === -1) return null;

    const current = attempts[idx];
    const sanitizedError = updates.error ? redactSensitiveData(String(updates.error)) : current.error;

    const updated = {
      ...current,
      ...updates,
      error: sanitizedError,
      updatedAt: new Date().toISOString(),
    };

    if (updates.reconciliationNote) {
      updated.reconciliationNotes = [
        ...(current.reconciliationNotes || []),
        `[${new Date().toISOString()}] ${redactSensitiveData(updates.reconciliationNote)}`,
      ];
    }

    attempts[idx] = updated;
    this.saveAttempts(attempts);
    return updated;
  }

  /**
   * Retrieves an attempt by ID.
   * @param {string} attemptId
   * @returns {Object|null}
   */
  getAttempt(attemptId) {
    const attempts = this.getAllAttempts();
    return attempts.find((a) => a.attemptId === attemptId) || null;
  }

  /**
   * Retrieves pending attempts (in-flight or uncertain) for crash recovery reconciliation.
   * @returns {Array<Object>}
   */
  getPendingAttempts() {
    const pendingStates = [
      PublicationState.PUBLISHING,
      PublicationState.OUTCOME_UNCERTAIN,
      PublicationState.VERIFYING,
    ];
    return this.getAllAttempts().filter((a) => pendingStates.includes(a.state));
  }

  /**
   * Retrieves all attempts for a given document.
   * @param {string} documentId
   * @returns {Array<Object>}
   */
  getAttemptsForDocument(documentId) {
    return this.getAllAttempts().filter((a) => a.documentId === String(documentId));
  }

  /**
   * Clears all attempt records (useful for test isolation).
   */
  clearAll() {
    this.storage.removeItem(STORAGE_KEY);
  }
}

export const publicationRecordService = new PublicationRecordService();
