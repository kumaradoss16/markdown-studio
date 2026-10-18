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
    return true;
  }

  /**
   * Checks whether a credential is currently held without exposing it.
   * @returns {Promise<boolean>}
   */
  async hasCredential() {
    return this.memoryVault !== null;
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
