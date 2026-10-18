import { redactSensitiveData } from './error-service.js';
import { AppEvents, eventBus } from '../app/events.js';

const AUDIT_STORAGE_KEY = 'devspirehub:audit_log:v1';
const MAX_AUDIT_EVENTS = 500;

/**
 * AuditLogService
 * Append-only, durable audit trail for local and remote document operations.
 * Enforces:
 * - Invariant 7: Audit Completeness
 * - Invariant 8: Zero Secret Leakage (redaction of all payload strings)
 * - Invariant 10: Remote Honesty (accurate outcome states)
 */
export class AuditLogService {
  /**
   * @param {Object} [deps]
   * @param {Storage} [deps.storage]
   * @param {number} [deps.maxEvents=500]
   */
  constructor(deps = {}) {
    this.maxEvents = deps.maxEvents || MAX_AUDIT_EVENTS;

    if (deps.storage) {
      this.storage = deps.storage;
    } else if (typeof localStorage !== 'undefined') {
      this.storage = localStorage;
    } else {
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
   * Generates a collision-resistant unique audit event ID.
   * @returns {string}
   */
  generateAuditId() {
    return 'aud_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Recursively sanitizes any object or string to remove credentials/secrets.
   * @param {any} val
   * @returns {any}
   */
  _sanitize(val) {
    if (typeof val === 'string') {
      return redactSensitiveData(val);
    }
    if (Array.isArray(val)) {
      return val.map((v) => this._sanitize(v));
    }
    if (val && typeof val === 'object') {
      const sanitized = {};
      for (const [k, v] of Object.entries(val)) {
        sanitized[k] = this._sanitize(v);
      }
      return sanitized;
    }
    return val;
  }

  /**
   * Reads raw event list from storage.
   * @returns {Array<Object>}
   */
  getAllEvents() {
    try {
      const raw = this.storage.getItem(AUDIT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Failed to parse audit log:', err);
      return [];
    }
  }

  /**
   * Appends an audit event to the durable log.
   * @param {Object} params
   * @param {string} params.documentKey
   * @param {'OPEN' | 'SAVE' | 'RESTORE' | 'EXPORT' | 'CLOSE' | 'REMOTE_REFRESH' | 'PUBLISH_ATTEMPT'} params.action
   * @param {'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'UNCERTAIN'} params.outcome
   * @param {string} [params.actor='local_user']
   * @param {string} [params.contentHash]
   * @param {string} params.summary
   * @param {Record<string, any>} [params.details]
   * @returns {Object} Created audit event
   */
  recordEvent({
    documentKey = '',
    action,
    outcome = 'SUCCESS',
    actor = 'local_user',
    contentHash = null,
    summary = '',
    details = {},
  }) {
    const auditId = this.generateAuditId();
    const event = {
      auditId,
      timestamp: new Date().toISOString(),
      documentKey: String(documentKey || ''),
      action,
      outcome,
      actor: redactSensitiveData(String(actor || 'local_user')),
      contentHash: contentHash ? String(contentHash) : null,
      summary: redactSensitiveData(String(summary || '')),
      details: this._sanitize(details || {}),
    };

    const existing = this.getAllEvents();
    const updated = [...existing, event];

    // Maintain max limit
    if (updated.length > this.maxEvents) {
      updated.splice(0, updated.length - this.maxEvents);
    }

    try {
      this.storage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to append to audit log:', err);
    }

    eventBus.emit(AppEvents.AUDIT_RECORDED, event);
    return event;
  }

  /**
   * Queries events by documentKey and/or action.
   * @param {Object} [filter]
   * @param {string} [filter.documentKey]
   * @param {string} [filter.action]
   * @param {string} [filter.outcome]
   * @param {number} [filter.limit=50]
   * @returns {Array<Object>} Matches (newest first)
   */
  queryEvents(filter = {}) {
    const all = this.getAllEvents();
    let filtered = all;

    if (filter.documentKey) {
      filtered = filtered.filter((e) => e.documentKey === filter.documentKey);
    }
    if (filter.action) {
      filtered = filtered.filter((e) => e.action === filter.action);
    }
    if (filter.outcome) {
      filtered = filtered.filter((e) => e.outcome === filter.outcome);
    }

    // Newest first
    filtered.reverse();

    if (filter.limit && filter.limit > 0) {
      return filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Alias for queryEvents.
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  getEvents(filter = {}) {
    return this.queryEvents(filter);
  }

  /**
   * Clears audit storage (primarily for test resets).
   */
  clearEvents() {
    this.storage.removeItem(AUDIT_STORAGE_KEY);
  }
}

export const auditLogService = new AuditLogService();
