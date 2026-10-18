import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';
import { AppEvents, eventBus } from '../app/events.js';

const BLOB_PREFIX = 'devspirehub:history:blob:';
const INDEX_PREFIX = 'devspirehub:history:index:';
const DEFAULT_MAX_ENTRIES = 50;

/**
 * Fast deterministic content hash (FNV-1a 32-bit).
 * @param {string} str
 * @returns {string}
 */
export function computeContentHash(str = '') {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Validates documentKey to prevent path traversal (Invariant 9: Workspace Boundary).
 * @param {string} key
 * @returns {boolean}
 */
export function isValidDocumentKey(key) {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return false;
  }
  return true;
}

/**
 * RevisionHistoryStore
 * Content-addressed, append-only document revision history storage.
 * Enforces:
 * - Invariant 1: History Non-Mutation (append-only)
 * - Invariant 5: Hash Integrity (hash checks on write and read; fail closed on corruption)
 * - Invariant 8: Zero Secret Leakage (redacted summaries)
 * - Invariant 9: Workspace Boundary (no path traversal)
 * - Invariant 12: Failure Containment
 */
export class RevisionHistoryStore {
  /**
   * @param {Object} [deps]
   * @param {Storage} [deps.storage]
   * @param {number} [deps.maxEntriesPerDoc=50]
   * @param {number} [deps.maxRevisions]
   */
  constructor(deps = {}) {
    this.maxEntriesPerDoc = deps.maxEntriesPerDoc || deps.maxRevisions || DEFAULT_MAX_ENTRIES;
    this.pinnedHistoryIds = new Set();

    if (deps.storage) {
      this.storage = deps.storage;
    } else if (typeof localStorage !== 'undefined') {
      this.storage = localStorage;
    } else {
      // Memory fallback for headless tests
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
   * Normalizes document key and validates against path traversal (Invariant 9).
   * @param {string} key
   * @returns {string}
   */
  normalizeKey(key) {
    if (!key || typeof key !== 'string') {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Document key cannot be empty.');
    }
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!isValidDocumentKey(normalized)) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, `Invalid document key "${key}": Path traversal prohibited.`);
    }
    return normalized;
  }

  /**
   * Deterministic content hashing helper.
   * @param {string} content
   * @returns {string}
   */
  hashContent(content) {
    return computeContentHash(content || '');
  }

  /**
   * Generates a collision-resistant unique history ID (Schema: rev_<ts>_<rand>).
   * @returns {string}
   */
  generateHistoryId() {
    return 'rev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Alias for listHistory (returns list newest first).
   * @param {string} documentKey
   * @returns {Array<Object>}
   */
  getHistory(documentKey) {
    return this.listHistory(documentKey);
  }

  /**
   * Retrieves snapshot metadata and verifies content blob integrity (Invariant 5).
   * @param {string} documentKey
   * @param {string} historyId
   * @returns {Promise<Object>}
   */
  async getRevision(documentKey, historyId) {
    const snapshot = this.getSnapshot(documentKey, historyId);
    if (!snapshot) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Snapshot "${historyId}" not found for "${documentKey}".`);
    }
    const content = await this.getSnapshotContent(documentKey, historyId);
    return { ...snapshot, content };
  }

  /**
   * Alias for rekeyDocumentHistory.
   * @param {string} oldKey
   * @param {string} newKey
   * @returns {number}
   */
  async rekeyDocument(oldKey, newKey) {
    return this.rekeyDocumentHistory(oldKey, newKey);
  }

  /**
   * Pins a historyId to protect it from eviction during in-flight restore preview.
   * @param {string} historyId
   */
  pinHistoryId(historyId) {
    if (historyId) this.pinnedHistoryIds.add(historyId);
  }

  /**
   * Unpins a historyId after restore preview or cancellation completes.
   * @param {string} historyId
   */
  unpinHistoryId(historyId) {
    if (historyId) this.pinnedHistoryIds.delete(historyId);
  }

  /**
   * Reads raw index from storage.
   * @private
   * @param {string} key
   * @returns {Array<Object>}
   */
  _readIndex(key) {
    try {
      const raw = this.storage.getItem(INDEX_PREFIX + key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn(`Failed to read history index for "${key}":`, err);
      return [];
    }
  }

  /**
   * Writes index to storage.
   * @private
   * @param {string} key
   * @param {Array<Object>} list
   */
  _writeIndex(key, list) {
    try {
      this.storage.setItem(INDEX_PREFIX + key, JSON.stringify(list));
    } catch (err) {
      throw new StudioError(ErrorCode.HISTORY_STORAGE_ERROR, `Failed to persist history index: ${err.message}`, err);
    }
  }

  /**
   * Stores a content blob in content-addressed storage.
   * @private
   * @param {string} hash
   * @param {string} content
   */
  _writeBlob(hash, content) {
    try {
      const blobKey = BLOB_PREFIX + hash;
      if (!this.storage.getItem(blobKey)) {
        this.storage.setItem(blobKey, content);
      }
    } catch (err) {
      throw new StudioError(ErrorCode.HISTORY_STORAGE_ERROR, `Failed to store content blob: ${err.message}`, err);
    }
  }

  /**
   * Records an immutable revision snapshot.
   * @param {Object} params
   * @param {string} params.documentKey - Canonical path or session doc ID
   * @param {string} params.content - Full Markdown content string
   * @param {'local_save' | 'autosnapshot' | 'restore' | 'publish' | 'remote_refresh'} params.source
   * @param {string} params.summary - Human-readable summary
   * @param {Object} [params.metadata]
   * @returns {Promise<Object>} Created RevisionSnapshot
   */
  async recordSnapshot({
    documentKey,
    content = '',
    source = 'local_save',
    summary = 'Document revision',
    metadata = {},
  }) {
    if (!isValidDocumentKey(documentKey)) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, `Invalid document key "${documentKey}": Directory traversal or invalid syntax prohibited.`);
    }

    if (typeof content !== 'string') {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Snapshot content must be a string.');
    }

    const contentHash = computeContentHash(content);
    // Write to content-addressed blob store
    this._writeBlob(contentHash, content);

    const existingIndex = this._readIndex(documentKey);
    const nextRevisionNumber = existingIndex.length > 0
      ? (existingIndex[existingIndex.length - 1].revisionNumber || existingIndex.length) + 1
      : 1;

    const historyId = this.generateHistoryId();
    const sanitizedSummary = redactSensitiveData(summary || 'Document revision');

    const snapshot = {
      historyId,
      documentKey,
      createdAt: new Date().toISOString(),
      source,
      revisionNumber: nextRevisionNumber,
      summary: sanitizedSummary,
      contentHash,
      contentRef: contentHash,
      metadata: {
        linesCount: content.split(/\r?\n/).length,
        charCount: content.length,
        ...metadata,
      },
    };

    // Append-only (Invariant 1: History Non-Mutation)
    const updatedIndex = [...existingIndex, snapshot];

    // Eviction cap enforcement (maxEntriesPerDoc)
    while (updatedIndex.length > this.maxEntriesPerDoc) {
      const evictIdx = updatedIndex.findIndex((candidate) => !this.pinnedHistoryIds.has(candidate.historyId));
      if (evictIdx !== -1) {
        updatedIndex.splice(evictIdx, 1);
      } else {
        break; // All entries are currently pinned
      }
    }

    this._writeIndex(documentKey, updatedIndex);
    eventBus.emit(AppEvents.HISTORY_SNAPSHOT_RECORDED, { documentKey, snapshot });
    return snapshot;
  }

  /**
   * Lists all recorded snapshots for a document, ordered newest first.
   * @param {string} documentKey
   * @returns {Array<Object>}
   */
  listHistory(documentKey) {
    if (!isValidDocumentKey(documentKey)) {
      return [];
    }
    const index = this._readIndex(documentKey);
    // Return newest first
    return [...index].reverse();
  }

  /**
   * Retrieves a snapshot metadata by historyId.
   * @param {string} documentKey
   * @param {string} historyId
   * @returns {Object | null}
   */
  getSnapshot(documentKey, historyId) {
    if (!isValidDocumentKey(documentKey) || !historyId) return null;
    const index = this._readIndex(documentKey);
    return index.find((s) => s.historyId === historyId) || null;
  }

  /**
   * Retrieves content of a snapshot with mandatory Hash Integrity verification (Invariant 5).
   * @param {string} documentKey
   * @param {string} historyId
   * @returns {Promise<string>}
   */
  async getSnapshotContent(documentKey, historyId) {
    const snapshot = this.getSnapshot(documentKey, historyId);
    if (!snapshot) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Snapshot "${historyId}" not found for document "${documentKey}".`);
    }

    const blobKey = BLOB_PREFIX + snapshot.contentHash;
    const content = this.storage.getItem(blobKey);

    if (content === null || content === undefined) {
      throw new StudioError(
        ErrorCode.CORRUPT_HISTORY,
        `Content blob for snapshot "${historyId}" (${snapshot.contentHash}) is missing from storage.`
      );
    }

    // Hash Integrity (Invariant 5)
    const recomputedHash = computeContentHash(content);
    if (recomputedHash !== snapshot.contentHash) {
      throw new StudioError(
        ErrorCode.CORRUPT_HISTORY,
        `Hash mismatch for snapshot "${historyId}". Expected ${snapshot.contentHash}, but content recomputed to ${recomputedHash}. Data may be corrupt; restoration aborted.`
      );
    }

    return content;
  }

  /**
   * Re-keys history index from old key to new key (e.g. Untitled doc -> canonical path Save As).
   * @param {string} oldKey
   * @param {string} newKey
   * @returns {number} Number of migrated snapshots
   */
  rekeyDocumentHistory(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return 0;
    if (!isValidDocumentKey(oldKey) || !isValidDocumentKey(newKey)) return 0;

    const oldEntries = this._readIndex(oldKey);
    if (oldEntries.length === 0) return 0;

    const newEntries = this._readIndex(newKey);
    const migrated = oldEntries.map((item) => ({
      ...item,
      documentKey: newKey,
    }));

    const merged = [...newEntries, ...migrated];
    this._writeIndex(newKey, merged);
    this.storage.removeItem(INDEX_PREFIX + oldKey);

    return migrated.length;
  }

  /**
   * Clears all history for a document.
   * @param {string} documentKey
   */
  clearDocumentHistory(documentKey) {
    if (isValidDocumentKey(documentKey)) {
      this.storage.removeItem(INDEX_PREFIX + documentKey);
    }
  }
}

export const revisionHistoryStore = new RevisionHistoryStore();
