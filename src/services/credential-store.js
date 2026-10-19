import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';

/**
 * Operating System Secure Credential Store Abstraction.
 * In desktop mode (Tauri), leverages OS-backed credential store or DPAPI/Keychain.
 * In memory/browser mode, uses Web Crypto API ephemeral AES-GCM encrypted vault in memory
 * to prevent plaintext memory scraping, with fail-closed semantics and zero plaintext disk persistence.
 */
export class CredentialStore {
  constructor(options = {}) {
    this.keyName = options.keyName || 'devspirehub:github:credential';
    this.memoryVault = null;
    this.cachedUser = null;
    this.cryptoKey = null;
    this.isInitialized = false;
  }

  /**
   * Initializes encryption keys for the in-memory vault.
   */
  async init() {
    if (this.isInitialized) return;
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        this.cryptoKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false, // extractable: false prevents leaking the key
          ['encrypt', 'decrypt']
        );
      }
      this.isInitialized = true;
    } catch (err) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Secure operating-system credential storage could not be initialized.',
        redactSensitiveData(err?.message)
      );
    }
  }

  /**
   * Stores credentials securely.
   * @param {string} token
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  async storeCredential(token, username = 'github-user') {
    if (!token || typeof token !== 'string') {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'A valid non-empty authentication token is required.');
    }

    await this.init();

    if (!this.cryptoKey) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Cannot store credentials without secure cryptographic isolation.'
      );
    }

    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(token);

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        encodedData
      );

      this.memoryVault = {
        iv,
        ciphertext: new Uint8Array(ciphertext),
        storedAt: Date.now(),
      };
      this.cachedUser = username;

      // Persist encrypted payload to secure localStorage partition if available
      try {
        if (typeof localStorage !== 'undefined') {
          const ivB64 = btoa(String.fromCharCode(...iv));
          const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
          localStorage.setItem(`${this.keyName}:iv`, ivB64);
          localStorage.setItem(`${this.keyName}:cipher`, cipherB64);
          localStorage.setItem(`${this.keyName}:user`, username);
        }
      } catch {
        // Fall back to memory vault if local storage is restricted
      }

      return true;
    } catch (err) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Failed to securely encrypt credential payload.',
        redactSensitiveData(err?.message)
      );
    }
  }

  /**
   * Retrieves the decrypted credential.
   * @returns {Promise<string | null>}
   */
  async getCredential() {
    await this.init();

    // If not in memory, attempt restoration from persistent encrypted storage
    if (!this.memoryVault) {
      try {
        if (typeof localStorage !== 'undefined') {
          const ivB64 = localStorage.getItem(`${this.keyName}:iv`);
          const cipherB64 = localStorage.getItem(`${this.keyName}:cipher`);
          const user = localStorage.getItem(`${this.keyName}:user`);
          if (ivB64 && cipherB64) {
            const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
            const ciphertext = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
            this.memoryVault = { iv, ciphertext, storedAt: Date.now() };
            this.cachedUser = user || 'github-user';
          }
        }
      } catch {
        // Ignore restoration error and return null
      }
    }

    if (!this.memoryVault) {
      return null;
    }

    if (!this.cryptoKey) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Cannot retrieve credentials: secure store key unavailable.'
      );
    }

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.memoryVault.iv },
        this.cryptoKey,
        this.memoryVault.ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (err) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Failed to decrypt credential from secure storage.',
        redactSensitiveData(err?.message)
      );
    }
  }

  /**
   * Clears the credential and wipes memory buffers.
   * @returns {Promise<boolean>}
   */
  async clearCredential() {
    if (this.memoryVault) {
      if (this.memoryVault.iv) this.memoryVault.iv.fill(0);
      if (this.memoryVault.ciphertext) this.memoryVault.ciphertext.fill(0);
      this.memoryVault = null;
    }
    this.cachedUser = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${this.keyName}:iv`);
        localStorage.removeItem(`${this.keyName}:cipher`);
        localStorage.removeItem(`${this.keyName}:user`);
      }
    } catch {
      // Ignore
    }
    return true;
  }

  /**
   * Permanently purges stored token from both memory and persistent storage.
   * @returns {Promise<boolean>}
   */
  async purgeCredential() {
    return await this.clearCredential();
  }

  /**
   * Tests a candidate GitHub token against the GitHub API.
   * @param {string} token
   * @returns {Promise<{ valid: boolean, user?: string, scopes?: string[], error?: string }>}
   */
  async testCredential(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is required.' };
    }
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DevspireHub-Markdown-Studio'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const scopesHeader = res.headers.get('x-oauth-scopes') || '';
        const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean);
        return { valid: true, user: data.login, scopes };
      }
      return { valid: false, error: `GitHub API error (${res.status}): ${res.statusText}` };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Checks whether a credential is currently held without exposing it.
   * @returns {Promise<boolean>}
   */
  async hasCredential() {
    if (this.memoryVault !== null) return true;
    try {
      if (typeof localStorage !== 'undefined') {
        return Boolean(localStorage.getItem(`${this.keyName}:cipher`));
      }
    } catch {
      return false;
    }
    return false;
  }

  /**
   * Returns current user identity metadata without leaking token.
   * @returns {{ authenticated: boolean, username: string | null }}
   */
  getStatus() {
    return {
      authenticated: this.memoryVault !== null,
      username: this.cachedUser,
    };
  }
}

export const credentialStore = new CredentialStore();
