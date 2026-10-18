import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialStore } from '../../src/services/credential-store.js';
import { GitHubAuthService, AuthState } from '../../src/services/github-auth-service.js';
import { redactSensitiveData, ErrorCode } from '../../src/services/error-service.js';

describe('GitHub Authentication & Credential Storage (Release 0.4)', () => {
  let store;
  let clientMock;
  let authService;

  beforeEach(async () => {
    store = new CredentialStore();
    clientMock = {
      get: vi.fn(),
    };
    authService = new GitHubAuthService({ store, client: clientMock });
  });

  describe('CredentialStore', () => {
    it('encrypts credentials using cryptographic isolation without storing plaintext', async () => {
      const rawToken = 'ghp_secretToken1234567890abcdefghijklmn';
      await store.storeCredential(rawToken, 'octocat');

      expect(store.memoryVault).toBeDefined();
      expect(store.memoryVault.ciphertext).toBeInstanceOf(Uint8Array);
      expect(store.memoryVault.iv).toBeInstanceOf(Uint8Array);
      // Ensure raw plaintext is NOT in memoryVault
      expect(JSON.stringify(store.memoryVault)).not.toContain(rawToken);

      // Decrypt and verify match
      const decrypted = await store.getCredential();
      expect(decrypted).toBe(rawToken);
    });

    it('wipes memory buffers upon clearCredential and fails closed', async () => {
      await store.storeCredential('ghp_tokenExample1234567890abcdef', 'octocat');
      expect(await store.hasCredential()).toBe(true);

      await store.clearCredential();
      expect(await store.hasCredential()).toBe(false);
      expect(await store.getCredential()).toBeNull();
      expect(store.getStatus().authenticated).toBe(false);
    });

    it('redacts sensitive access tokens, bearer headers, and secrets in error strings', () => {
      const sensitiveMsg = 'Error: Bearer ghp_secretToken1234567890abcdefghijklmn failed on token=xyz123';
      const redacted = redactSensitiveData(sensitiveMsg);

      expect(redacted).not.toContain('ghp_secretToken1234567890abcdefghijklmn');
      expect(redacted).toContain('[REDACTED]');
    });
  });

  describe('GitHubAuthService', () => {
    it('authenticates with valid token by verifying identity against /user', async () => {
      clientMock.get.mockResolvedValueOnce({
        id: 12345,
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://github.com/images/error/octocat_happy.gif',
      });

      const user = await authService.authenticateWithToken('ghp_validToken1234567890abcdef');
      expect(user).toBeDefined();
      expect(user.login).toBe('octocat');
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.state).toBe(AuthState.AUTHENTICATED);

      // Verify token is retrievable from secure store
      const storedToken = await authService.getToken();
      expect(storedToken).toBe('ghp_validToken1234567890abcdef');
    });

    it('rejects invalid or empty tokens without changing state', async () => {
      await expect(authService.authenticateWithToken('')).rejects.toThrow();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.state).toBe(AuthState.SIGNED_OUT);
    });

    it('marks state as REAUTH_REQUIRED if stored token is rejected as expired on restore', async () => {
      await store.storeCredential('ghp_expiredToken1234567890abcdef', 'octocat');

      const expiredErr = new Error('Bad credentials');
      expiredErr.code = ErrorCode.AUTH_EXPIRED;
      clientMock.get.mockRejectedValueOnce(expiredErr);

      await authService.restoreSession();
      expect(authService.state).toBe(AuthState.REAUTH_REQUIRED);
    });

    it('disconnects identity, wipes stored credentials, and preserves local state', async () => {
      clientMock.get.mockResolvedValueOnce({ id: 1, login: 'octocat' });
      await authService.authenticateWithToken('ghp_token1234567890abcdefghijklmn');
      expect(authService.isAuthenticated()).toBe(true);

      await authService.disconnect();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.state).toBe(AuthState.SIGNED_OUT);
      expect(await store.hasCredential()).toBe(false);
    });
  });

  describe('GitHub Panel Auth UX (Publish Permissions Guidance)', () => {
    it('prompts user with write token guidance and does not claim read-only is sufficient', async () => {
      const { GitHubPanelComponent } = await import('../../src/components/github/github-panel.js');
      const container = document.createElement('div');
      const panel = new GitHubPanelComponent(container);

      await panel.render();
      const html = container.innerHTML;

      // Ensure read-only wording is NOT in signed out UI
      expect(html).not.toContain('read-only');
      expect(html).toContain('Contents: Read and write');
      expect(html).toContain('repo');

      // Verify promptTokenAuth uses write-capable guidance
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
      await panel.promptTokenAuth();

      expect(promptSpy).toHaveBeenCalled();
      const promptArg = promptSpy.mock.calls[0][0];
      expect(promptArg).not.toContain('read-only');
      expect(promptArg).toContain('Contents: Read and write');
      expect(promptArg).toContain('repo');

      promptSpy.mockRestore();
    });
  });
});
