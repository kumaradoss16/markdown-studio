/**
 * ClipboardHistoryService
 * Module G — User-controlled, local-first clipboard import history for MarkForge.
 *
 * Privacy & Security Guarantees:
 * - Disabled by default; operates strictly on an opt-in basis.
 * - Stored exclusively in local client-side storage (never transmitted externally).
 * - Implements automated sensitive-token scrubbing (API keys, PATs, JWTs, private keys).
 * - Enforces configurable retention limits and provides complete user-controlled purge.
 */

const HISTORY_STORAGE_KEY = 'markforge:clipboard_history';
export const DEFAULT_HISTORY_LIMIT = 15;

// Patterns matching sensitive secrets that must never be persisted to history
const SENSITIVE_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/, // GitHub Personal Access Token
  /github_pat_[a-zA-Z0-9_]{82}/, // GitHub Fine-Grained Token
  /sk-[a-zA-Z0-9]{32,}/, // OpenAI API Key
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i, // Bearer Token
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWT
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, // PEM Private Key
  /AKIA[0-9A-Z]{16}/, // AWS Access Key
];

export class ClipboardHistoryService {
  constructor() {
    this.memoryEntries = [];
  }

  /**
   * Sniffs whether a text snippet contains sensitive tokens or cryptographic secrets.
   * @param {string} text
   * @returns {boolean}
   */
  containsSensitiveData(text) {
    if (!text || typeof text !== 'string') return false;
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) return true;
    }
    return false;
  }

  /**
   * Adds an entry to local clipboard history if history is enabled and data is non-sensitive.
   *
   * @param {{
   *   source: string,
   *   format: 'markdown' | 'html' | 'text' | 'image',
   *   snippet: string,
   *   markdown: string,
   *   counts?: { headings: number, paragraphs: number, lists: number, tables: number, codeBlocks: number },
   * }} entry
   * @param {{ enabled?: boolean, limit?: number }} [options]
   * @returns {boolean} True if recorded, false if rejected or disabled
   */
  addEntry(entry, options = {}) {
    const isEnabled = options.enabled === true;
    if (!isEnabled) {
      return false;
    }

    if (!entry || !entry.markdown) {
      return false;
    }

    // Security check: reject persistence if sensitive token is present
    if (this.containsSensitiveData(entry.markdown) || this.containsSensitiveData(entry.snippet)) {
      return false;
    }

    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : DEFAULT_HISTORY_LIMIT;
    const entries = this.getEntries();

    const record = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      source: entry.source || 'clipboard',
      format: entry.format || 'html',
      snippet: (entry.snippet || entry.markdown).slice(0, 160).trim(),
      markdown: entry.markdown,
      counts: entry.counts || {},
    };

    // Prepend new entry
    entries.unshift(record);

    // Apply retention limit
    const trimmed = entries.slice(0, limit);
    this._persist(trimmed);
    return true;
  }

  /**
   * Retrieves all recorded clipboard history entries.
   * @returns {Array<{ id: string, timestamp: number, source: string, format: string, snippet: string, markdown: string, counts: any }>}
   */
  getEntries() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch {}
    return [...this.memoryEntries];
  }

  /**
   * Searches history entries by query string.
   * @param {string} query
   * @returns {Array<any>}
   */
  search(query = '') {
    const q = query.toLowerCase().trim();
    if (!q) return this.getEntries();

    return this.getEntries().filter(e =>
      (e.snippet && e.snippet.toLowerCase().includes(q)) ||
      (e.markdown && e.markdown.toLowerCase().includes(q)) ||
      (e.format && e.format.toLowerCase().includes(q))
    );
  }

  /**
   * Deletes a specific history record by ID.
   * @param {string} id
   * @returns {boolean}
   */
  deleteEntry(id) {
    const entries = this.getEntries();
    const filtered = entries.filter(e => e.id !== id);
    if (filtered.length !== entries.length) {
      this._persist(filtered);
      return true;
    }
    return false;
  }

  /**
   * Purges all clipboard history completely.
   */
  clear() {
    this.memoryEntries = [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      }
    } catch {}
  }

  /**
   * Persists entries to storage.
   * @private
   */
  _persist(entries) {
    this.memoryEntries = entries;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
      }
    } catch {}
  }
}

export const clipboardHistoryService = new ClipboardHistoryService();
