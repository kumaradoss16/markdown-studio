import { credentialStore } from './credential-store.js';
import { gitHubApiClient } from './github-api-client.js';
import { AppEvents, eventBus } from '../app/events.js';
import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';

export const AuthState = {
  SIGNED_OUT: 'SIGNED_OUT',
  AUTHENTICATING: 'AUTHENTICATING',
  AUTHENTICATED: 'AUTHENTICATED',
  EXPIRED: 'EXPIRED',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
};

/**
 * GitHubAuthService
 * Manages GitHub authentication sessions, minimum permission boundaries,
 * identity verification, secure credential storage, and session lifecycle.
 */
export class GitHubAuthService {
  /**
   * @param {Object} [deps]
   * @param {import('./credential-store.js').CredentialStore} [deps.store]
   * @param {import('./github-api-client.js').GitHubApiClient} [deps.client]
   */
  constructor(deps = {}) {
    this.store = deps.store || credentialStore;
    this.client = deps.client || gitHubApiClient;
    this.state = AuthState.SIGNED_OUT;
    this.currentUser = null;
    this.lastError = null;
  }

  /**
   * Authenticates with a Personal Access Token (PAT) or OAuth token.
   * Immediately verifies authorization against `/user` before storing.
   * @param {string} token
   * @returns {Promise<any>}
   */
  async authenticateWithToken(token) {
    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'A valid non-empty authentication token is required.');
    }

    const cleanToken = token.trim();
    this.state = AuthState.AUTHENTICATING;
    this.lastError = null;
    eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, { state: this.state, user: null });

    try {
      // Identity and authorization verification via GET /user
      const user = await this.client.get('/user', { token: cleanToken });

      if (!user || !user.login) {
        throw new StudioError(ErrorCode.INVALID_ENCODING, 'GitHub API returned invalid user profile representation.');
      }

      // Store in operating-system-backed credential store
      await this.store.storeCredential(cleanToken, user.login);

      this.currentUser = {
        id: user.id,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url || '',
        html_url: user.html_url || `https://github.com/${user.login}`,
      };
      this.state = AuthState.AUTHENTICATED;

      eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, { state: this.state, user: this.currentUser });
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'success',
        message: `Connected GitHub account @${this.currentUser.login}`,
      });

      return this.currentUser;
    } catch (err) {
      this.state = AuthState.SIGNED_OUT;
      this.currentUser = null;
      this.lastError = err;
      eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, { state: this.state, user: null, error: err });
      throw err;
    }
  }

  /**
   * Restores an active session from the secure credential store.
   * @returns {Promise<any | null>}
   */
  async restoreSession() {
    const hasCred = await this.store.hasCredential();
    if (!hasCred) {
      this.state = AuthState.SIGNED_OUT;
      this.currentUser = null;
      return null;
    }

    try {
      const token = await this.store.getCredential();
      if (!token) {
        this.state = AuthState.SIGNED_OUT;
        return null;
      }

      // Revalidate authorization token against live API
      const user = await this.client.get('/user', { token });
      this.currentUser = {
        id: user.id,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url || '',
        html_url: user.html_url || `https://github.com/${user.login}`,
      };
      this.state = AuthState.AUTHENTICATED;

      eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, { state: this.state, user: this.currentUser });
      return this.currentUser;
    } catch (err) {
      if (err.code === ErrorCode.AUTH_EXPIRED || err.code === ErrorCode.PERMISSION_DENIED) {
        this.state = AuthState.REAUTH_REQUIRED;
        this.lastError = err;
      } else {
        // Network unavailable or offline: preserve credentials, indicate offline/unavailable
        this.state = AuthState.AUTHENTICATED; // Retain cached identity offline
        const status = this.store.getStatus();
        if (status.username) {
          this.currentUser = { login: status.username, name: status.username };
        }
      }

      eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, {
        state: this.state,
        user: this.currentUser,
        error: this.lastError,
      });
      return this.currentUser;
    }
  }

  /**
   * Disconnects the GitHub identity, clears secure credentials, and preserves drafts.
   * @returns {Promise<boolean>}
   */
  async disconnect() {
    try {
      await this.store.clearCredential();
    } catch (err) {
      throw new StudioError(
        ErrorCode.SECURE_STORE_UNAVAILABLE,
        'Failed to securely erase stored credential.',
        redactSensitiveData(err?.message)
      );
    }

    const previousUser = this.currentUser;
    this.state = AuthState.SIGNED_OUT;
    this.currentUser = null;
    this.lastError = null;

    eventBus.emit(AppEvents.GITHUB_AUTH_CHANGED, { state: this.state, user: null });
    eventBus.emit(AppEvents.NOTIFICATION, {
      type: 'info',
      message: `Disconnected GitHub account ${previousUser ? '@' + previousUser.login : ''}. Local drafts preserved.`,
    });

    return true;
  }

  /**
   * Retrieves active token for authorized requests.
   * @returns {Promise<string | null>}
   */
  async getToken() {
    if (this.state === AuthState.SIGNED_OUT) return null;
    return this.store.getCredential();
  }

  /**
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.state === AuthState.AUTHENTICATED && this.currentUser !== null;
  }

  /**
   * @returns {any | null}
   */
  getUser() {
    return this.currentUser;
  }

  /**
   * Retrieves high-level authentication status for dialogs and UI badges.
   * @returns {{ authenticated: boolean, state: string, user: any | null }}
   */
  getStatus() {
    return {
      authenticated: this.isAuthenticated(),
      state: this.state,
      user: this.currentUser,
    };
  }

  /**
   * Alias for disconnect().
   * @returns {Promise<boolean>}
   */
  async signOut() {
    return this.disconnect();
  }
}

export const gitHubAuthService = new GitHubAuthService();
