import { ErrorCode, StudioError } from './error-service.js';
import { gitHubApiClient } from './github-api-client.js';
import { gitHubAuthService } from './github-auth-service.js';
import { repositoryService } from './repository-service.js';
import { remoteDocumentService } from './remote-document-service.js';
import { documentStateManager } from '../core/document-state-manager.js';
import { computeLineDiff } from './revision-comparison-service.js';

/**
 * Fast string hash for content integrity checks.
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
 * PublicationPreflightService
 * Executes mandatory pre-publication checks enforcing:
 * - Invariant 1: Explicit user-initiated review.
 * - Invariant 2: Mandatory preflight validation.
 * - Invariant 3: Exact destination resolution and display.
 * - Invariant 4: Review snapshot immutability & invalidation.
 * - Invariant 5: Fresh remote base & stale-base rejection.
 */
export class PublicationPreflightService {
  constructor(deps = {}) {
    this.client = deps.client || gitHubApiClient;
    this.auth = deps.auth || gitHubAuthService;
    this.repoService = deps.repoService || repositoryService;
    this.docService = deps.docService || remoteDocumentService;
    this.stateManager = deps.stateManager || documentStateManager;
  }

  /**
   * Validates local draft content and structure.
   * @param {Object} doc - DocumentState instance
   */
  validateLocalDraft(doc) {
    if (!doc || !doc.id) {
      throw new StudioError(ErrorCode.PREFLIGHT_FAILED, 'Draft does not exist or has an invalid local ID.');
    }

    if (typeof doc.content !== 'string') {
      throw new StudioError(ErrorCode.PREFLIGHT_FAILED, 'Draft content is invalid or unreadable.');
    }

    const meta = doc.remoteMetadata;
    if (!meta || !meta.owner || !meta.repo || !meta.path) {
      throw new StudioError(
        ErrorCode.INVALID_DESTINATION,
        'Draft lacks valid remote source metadata (owner, repo, or path is missing).'
      );
    }

    // Path sanitization: repository-relative, no traversal, no illegal characters
    const path = meta.path;
    if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, `Invalid repository path "${path}": Path traversal prohibited.`);
    }

    if (/[*?"<>|]/.test(path)) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, `Path "${path}" contains invalid filesystem characters.`);
    }

    return true;
  }

  /**
   * Verifies that the current user has write permission to the destination repo.
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<boolean>}
   */
  async verifyAuthorization(owner, repo) {
    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'Authentication is required to publish changes.');
    }

    try {
      const repoData = await this.client.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });
      if (repoData && repoData.permissions) {
        if (!repoData.permissions.push && !repoData.permissions.admin) {
          throw new StudioError(
            ErrorCode.UNAUTHORIZED_WRITE,
            `You do not have write permissions to ${owner}/${repo}. Push access is required.`
          );
        }
      }
      return true;
    } catch (err) {
      if (err instanceof StudioError) throw err;
      if (err.status === 401 || err.code === ErrorCode.AUTH_REQUIRED || err.code === ErrorCode.AUTH_EXPIRED) {
        throw new StudioError(ErrorCode.AUTH_REQUIRED, 'GitHub authorization expired or invalid. Please reconnect your account.', err);
      }
      if (err.status === 403 || err.code === ErrorCode.PERMISSION_DENIED) {
        throw new StudioError(
          ErrorCode.UNAUTHORIZED_WRITE,
          `Access to repository "${owner}/${repo}" was denied (403). Ensure your token has access to this repository and write permissions.`,
          err
        );
      }
      if (err.status === 404 || err.code === ErrorCode.NOT_FOUND || String(err.message).includes('404')) {
        throw new StudioError(
          ErrorCode.NOT_FOUND,
          `Repository "${owner}/${repo}" not found (404). Verify the repository exists and ensure your token has been granted repository access.`,
          err
        );
      }
      throw new StudioError(ErrorCode.AUTH_REQUIRED, `Failed to verify authorization for ${owner}/${repo}: ${err.message}`, err);
    }
  }

  /**
   * Refreshes remote branch and file state to detect stale bases.
   * @param {Object} meta - Document remoteMetadata
   * @returns {Promise<Object>} Remote state info
   */
  async checkRemoteFreshness(meta) {
    const token = await this.auth.getToken();

    // 1. Get current commit SHA of target branch
    const currentBranchSha = await this.repoService.getBranchCommitSha(meta.owner, meta.repo, meta.branch);

    // 2. Check if file exists on remote branch
    const encodedPath = meta.path.split('/').map(encodeURIComponent).join('/');
    let remoteFile = null;
    let fileExists = true;

    try {
      remoteFile = await this.client.get(
        `/repos/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(currentBranchSha)}`,
        { token }
      );
    } catch (err) {
      if (err.code === ErrorCode.NOT_FOUND || String(err.message).includes('404')) {
        fileExists = false;
      } else {
        throw err;
      }
    }

    const currentBlobSha = remoteFile?.sha || null;
    const isNewFile = !fileExists;

    // Concurrency / Stale-base check
    let isStaleBase = false;
    let staleReason = null;

    if (fileExists) {
      if (meta.baseCommitSha && meta.baseCommitSha !== currentBranchSha) {
        isStaleBase = true;
        staleReason = `Branch ${meta.branch} has moved from ${meta.baseCommitSha.slice(0, 7)} to ${currentBranchSha.slice(0, 7)}.`;
      } else if (meta.baseBlobSha && currentBlobSha && meta.baseBlobSha !== currentBlobSha) {
        isStaleBase = true;
        staleReason = `Remote file "${meta.path}" has been modified on GitHub (blob SHA mismatch).`;
      }
    }

    return {
      currentBranchSha,
      currentBlobSha,
      isNewFile,
      isStaleBase,
      staleReason,
      remoteFile,
    };
  }

  /**
   * Executes complete preflight check and generates an immutable review snapshot.
   * @param {string} docId
   * @returns {Promise<Object>} Result object with snapshot and stale status
   */
  async executePreflight(docId) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Document with ID ${docId} not found.`);
    }

    // 1. Validate local draft integrity
    this.validateLocalDraft(doc);

    const meta = doc.remoteMetadata;

    // 2. Verify write authorization
    await this.verifyAuthorization(meta.owner, meta.repo);

    // 3. Refresh remote state
    const freshness = await this.checkRemoteFreshness(meta);

    // If base is stale, return early with STALE_BASE indication
    if (freshness.isStaleBase) {
      return {
        success: false,
        isStaleBase: true,
        staleReason: freshness.staleReason,
        baseCommitSha: meta.baseCommitSha,
        currentBranchSha: freshness.currentBranchSha,
        baseBlobSha: meta.baseBlobSha,
        currentBlobSha: freshness.currentBlobSha,
      };
    }

    // 4. Build immutable review snapshot
    const content = doc.content;
    const baseContent = meta.baseContent || '';
    const diff = computeLineDiff(baseContent, content);

    const snapshot = {
      snapshotId: 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      documentId: doc.id,
      revision: doc.revision || 1,
      content,
      contentHash: computeContentHash(content),
      length: content.length,
      linesCount: content.split('\n').length,
      destination: {
        provider: meta.provider || 'github',
        owner: meta.owner,
        repo: meta.repo,
        repoId: meta.repoId || null,
        branch: meta.branch,
        path: meta.path,
        baseCommitSha: meta.baseCommitSha,
        currentBranchSha: freshness.currentBranchSha,
        baseBlobSha: freshness.currentBlobSha || meta.baseBlobSha,
        isNewFile: freshness.isNewFile,
      },
      diff,
      timestamp: new Date().toISOString(),
    };

    return {
      success: true,
      isStaleBase: false,
      snapshot,
    };
  }

  /**
   * Verifies whether a confirmation remains valid against current document state.
   * Invariant 4: Any change to content, revision, repo, branch, or path invalidates review.
   * @param {Object} snapshot
   * @param {Object} currentDoc
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateConfirmation(snapshot, currentDoc) {
    if (!snapshot || !currentDoc) {
      return { valid: false, reason: 'MISSING_DATA' };
    }

    if (currentDoc.id !== snapshot.documentId) {
      return { valid: false, reason: 'DOCUMENT_MISMATCH' };
    }

    if (currentDoc.revision !== snapshot.revision) {
      return { valid: false, reason: 'REVISION_CHANGED' };
    }

    if (currentDoc.content !== snapshot.content) {
      return { valid: false, reason: 'CONTENT_CHANGED' };
    }

    const currentHash = computeContentHash(currentDoc.content);
    if (currentHash !== snapshot.contentHash) {
      return { valid: false, reason: 'CONTENT_HASH_MISMATCH' };
    }

    const meta = currentDoc.remoteMetadata;
    const dest = snapshot.destination;
    if (
      meta.owner !== dest.owner ||
      meta.repo !== dest.repo ||
      meta.branch !== dest.branch ||
      meta.path !== dest.path
    ) {
      return { valid: false, reason: 'DESTINATION_CHANGED' };
    }

    return { valid: true };
  }
}

export const publicationPreflightService = new PublicationPreflightService();
