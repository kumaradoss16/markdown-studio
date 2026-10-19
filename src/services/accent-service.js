/**
 * Accent Presets and Color Management Service.
 * Allows independent switching of the application's primary accent color.
 */

export const ACCENT_PRESETS = [
  { id: 'cyan', label: 'Cyan (Default)', hex: '#00e5ff', lightHex: '#0284c7' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6', lightHex: '#2563eb' },
  { id: 'sky', label: 'Sky', hex: '#38bdf8', lightHex: '#0284c7' },
  { id: 'green', label: 'Green / Emerald', hex: '#10b981', lightHex: '#059669' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6', lightHex: '#0d9488' },
  { id: 'orange', label: 'Orange / Amber', hex: '#f59e0b', lightHex: '#d97706' },
  { id: 'red', label: 'Red / Rose', hex: '#f43f5e', lightHex: '#e11d48' },
  { id: 'grey', label: 'Grey / Slate', hex: '#94a3b8', lightHex: '#475569' },
  { id: 'violet', label: 'Violet', hex: '#a855f7', lightHex: '#7c3aed' }
];

export const DEFAULT_ACCENT = 'cyan';
export const ACCENT_STORAGE_KEY = 'devspirehub:accent';

export class AccentService {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.presets = ACCENT_PRESETS;
    this.validIds = new Set(ACCENT_PRESETS.map(p => p.id));
  }

  /**
   * Checks if an accent ID is valid.
   * @param {string} id
   * @returns {boolean}
   */
  isValidAccent(id) {
    return typeof id === 'string' && this.validIds.has(id.toLowerCase());
  }

  /**
   * Retrieves the current accent ID from DOM or storage, falling back to default.
   * @returns {string}
   */
  getAccent() {
    if (typeof document !== 'undefined' && document.documentElement) {
      const domAccent = document.documentElement.getAttribute('data-accent');
      if (this.isValidAccent(domAccent)) {
        return domAccent.toLowerCase();
      }
    }

    try {
      if (this.storage) {
        const stored = this.storage.getItem(ACCENT_STORAGE_KEY);
        if (this.isValidAccent(stored)) {
          return stored.toLowerCase();
        }
      }
    } catch (e) {
      console.warn('Could not read accent from storage:', e);
    }

    return DEFAULT_ACCENT;
  }

  /**
   * Applies the accent attribute to documentElement.
   * @param {string} id
   * @returns {string} The normalized applied accent ID
   */
  applyAccent(id) {
    const validId = this.isValidAccent(id) ? id.toLowerCase() : DEFAULT_ACCENT;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-accent', validId);
    }
    return validId;
  }

  /**
   * Applies and persists the selected accent color.
   * @param {string} id
   * @returns {string} The normalized applied accent ID
   */
  setAccent(id) {
    const validId = this.applyAccent(id);
    try {
      if (this.storage) {
        this.storage.setItem(ACCENT_STORAGE_KEY, validId);
      }
    } catch (e) {
      console.warn('Could not persist accent to storage:', e);
    }
    return validId;
  }

  /**
   * Gets preset descriptor for a given ID.
   * @param {string} id
   * @returns {Object}
   */
  getPreset(id) {
    const norm = (id || '').toLowerCase();
    return this.presets.find(p => p.id === norm) || this.presets[0];
  }

  /**
   * Returns list of all available presets.
   * @returns {Array<Object>}
   */
  listPresets() {
    return [...this.presets];
  }
}

export const accentService = new AccentService();
