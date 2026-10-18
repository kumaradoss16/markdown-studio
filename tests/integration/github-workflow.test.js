import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialStore } from '../../src/services/credential-store.js';
import { GitHubApiClient } from '../../src/services/github-api-client.js';
import { GitHubAuthService } from '../../src/services/github-auth-service.js';
import { RepositoryService } from '../../src/services/repository-service.js';
import { RemoteDocumentService } from '../../src/services/remote-document-service.js';
import { RemoteDraftService, RemoteRelationshipState } from '../../src/services/remote-draft-service.js';
import { RevisionComparisonService, DiffClassification } from '../../src/services/revision-comparison-service.js';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';
import { CrashRecoveryManager } from '../../src/core/recovery-manager.js';
import { ErrorCode } from '../../src/services/error-service.js';

describe('GitHub Read & Draft Integration Workflow (Release 0.4)', () => {
  let store;
  let client;
  let authService;
  let repoService;
  let docService;
  let stateManager;
  let draftService;
  let comparisonService;
  let mockStorage;
  let recoveryManager;

  const mockApiRoutes = new Map();

  beforeEach(() => {
    mockApiRoutes.clear();
    store = new CredentialStore();

    // Deterministic fake transport routing
    const fakeTransport = vi.fn().mockImplementation(async (url, init = {}) => {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const search = parsedUrl.search;

      for (const [pattern, handler] of mockApiRoutes.entries()) {
        if (typeof pattern === 'string' && (pathname === pattern || `${pathname}${search}` === pattern)) {
          return handler(parsedUrl, init);
        }
        if (pattern instanceof RegExp && pattern.test(url)) {
          return handler(parsedUrl, init);
        }
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
        json: async () => ({ message: `Route not mocked: ${pathname}` }),
      };
    });

    client = new GitHubApiClient({ transport: fakeTransport });
    authService = new GitHubAuthService({ store, client });
    repoService = new RepositoryService({ client, auth: authService });
    docService = new RemoteDocumentService({ client, auth: authService });
    stateManager = new DocumentStateManager();
    draftService = new RemoteDraftService({ stateManager });
    comparisonService = new RevisionComparisonService({
      repoService,
      docService,
      draftService,
      stateManager,
    });

    mockStorage = {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = v; },
      removeItem(k) { delete this.data[k]; },
    };
    recoveryManager = new CrashRecoveryManager(mockStorage);
  });

  it('executes full authorized browsing, immutable drafting, divergence detection, and publishing block', async () => {
    // 1. Setup mock GitHub endpoints
    mockApiRoutes.set('/user', () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ id: 999, login: 'devspire-engineer', name: 'Devspire Engineer' }),
    }));

    mockApiRoutes.set(/\/user\/repos/, () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify([
        {
          id: 101,
          name: 'project-specs',
          full_name: 'devspire/project-specs',
          owner: { login: 'devspire' },
          default_branch: 'main',
          private: true,
        },
      ]),
    }));

    mockApiRoutes.set(/\/repos\/devspire\/project-specs\/branches/, () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify([
        { name: 'main', commit: { sha: 'commit-sha-base-111111' }, protected: true },
      ]),
    }));

    const originalContent = '# Technical Architecture\nBaseline architecture documentation.';
    const encodedContent = typeof Buffer !== 'undefined'
      ? Buffer.from(originalContent).toString('base64')
      : btoa(originalContent);

    mockApiRoutes.set(/\/repos\/devspire\/project-specs\/contents\/spec\.md/, (url) => {
      const ref = url.searchParams.get('ref');
      if (ref === 'commit-sha-base-111111') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          text: async () => JSON.stringify({
            type: 'file',
            encoding: 'base64',
            size: originalContent.length,
            name: 'spec.md',
            path: 'spec.md',
            sha: 'blob-sha-111111',
            content: encodedContent,
          }),
        };
      }

      // Updated remote revision
      const updatedRemoteContent = '# Technical Architecture\nBaseline architecture.\nUpdated by team.';
      const updatedEncoded = typeof Buffer !== 'undefined'
        ? Buffer.from(updatedRemoteContent).toString('base64')
        : btoa(updatedRemoteContent);

      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify({
          type: 'file',
          encoding: 'base64',
          size: updatedRemoteContent.length,
          name: 'spec.md',
          path: 'spec.md',
          sha: 'blob-sha-222222',
          content: updatedEncoded,
        }),
      };
    });

    // 2. Step 1: Authenticate
    const user = await authService.authenticateWithToken('ghp_testToken1234567890abcdef');
    expect(user.login).toBe('devspire-engineer');
    expect(authService.isAuthenticated()).toBe(true);

    // 3. Step 2: Browse Repositories
    const repos = await repoService.listRepositories();
    expect(repos.length).toBe(1);
    expect(repos[0].fullName).toBe('devspire/project-specs');

    // 4. Step 3: Browse Branches
    const branches = await repoService.listBranches('devspire', 'project-specs');
    expect(branches.length).toBe(1);
    expect(branches[0].name).toBe('main');
    expect(branches[0].commitSha).toBe('commit-sha-base-111111');

    // 5. Step 4: Load Remote Markdown into Local Draft
    const remoteDoc = await docService.fetchRemoteDocument({
      owner: 'devspire',
      repo: 'project-specs',
      path: 'spec.md',
      branch: 'main',
      commitSha: branches[0].commitSha,
      repoId: repos[0].id,
    });
    expect(remoteDoc.content).toBe(originalContent);

    const draft = draftService.openRemoteDraft(remoteDoc);
    expect(draftService.isRemoteDraft(draft)).toBe(true);
    expect(draft.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_CLEAN);

    // 6. Step 5: Edit draft locally (offline editing capability)
    stateManager.updateContent(draft.id, '# Technical Architecture\nMy local unsaved design edits.');
    draftService.updateDraftRelationship(draft);
    expect(draft.remoteMetadata.relationshipState).toBe(RemoteRelationshipState.REMOTE_DIRTY);

    // Verify CrashRecoveryManager journal includes remoteMetadata
    recoveryManager.recordJournalEntry(draft);
    const journal = recoveryManager.getJournal();
    expect(journal[draft.id].remoteMetadata.owner).toBe('devspire');
    expect(journal[draft.id].remoteMetadata.baseCommitSha).toBe('commit-sha-base-111111');

    // 7. Step 6: Simulate remote branch commit movement to a new revision
    mockApiRoutes.set(/\/repos\/devspire\/project-specs\/commits\/main/, () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ sha: 'commit-sha-updated-222222' }),
    }));

    // 8. Step 7: Refresh remote status and detect Stale Base & Divergence
    const comp = await comparisonService.refreshDraft(draft.id);
    expect(comp.classification).toBe(DiffClassification.DIVERGED);
    expect(comp.isStaleBase).toBe(true);
    expect(comp.baseCommitSha).toBe('commit-sha-base-111111');
    expect(comp.latestCommitSha).toBe('commit-sha-updated-222222');
    // Invariant 2 check: Local content is STILL user authored!
    expect(draft.content).toBe('# Technical Architecture\nMy local unsaved design edits.');

    // 9. Step 8: Verify line-by-line diff
    expect(comp.diffLocalVsRemote.length).toBeGreaterThan(0);

    // 10. Step 9: Invariant 1 & 15 check - Remote write attempts are rejected
    await expect(client.post('/repos/devspire/project-specs/contents/spec.md', {})).rejects.toMatchObject({
      code: ErrorCode.PUBLISHING_DISABLED,
    });
  });
});
