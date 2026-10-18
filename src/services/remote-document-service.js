import { gitHubApiClient } from './github-api-client.js';
import { gitHubAuthService } from './github-auth-service.js';
import { ErrorCode, StudioError } from './error-service.js';

/**
 * Helper to safely decode Base64 UTF-8 content across Node.js and Browser runtimes.
 * @param {string} base64Str
 * @returns {string}
 */
export function decodeBase64Utf8(base64Str) {
  if (!base64Str) return '';
  const cleanStr = base64Str.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleanStr, 'base64').toString('utf8');
  }
  const binary = atob(cleanStr);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * RemoteDocumentService
 * Fetches Markdown files from GitHub tied to immutable commit revisions.
 */
export class RemoteDocumentService {
  constructor(deps = {}) {
    this.client = deps.client || gitHubApiClient;
    this.auth = deps.auth || gitHubAuthService;
  }

  async getAuthToken() {
    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'GitHub authorization is required to fetch remote documents.');
    }
    return token;
  }

  /**
   * Fetches a Markdown file from an immutable commit SHA.
   * @param {Object} params
   * @param {string} params.owner
   * @param {string} params.repo
   * @param {string} params.path - Repository-relative file path
   * @param {string} params.branch
   * @param {string} params.commitSha - Immutable base commit SHA
   * @param {number} [params.repoId]
   * @returns {Promise<any>}
   */
  async fetchRemoteDocument({ owner, repo, path, branch, commitSha, repoId = null }) {
    if (!owner || !repo || !path || !commitSha) {
      throw new StudioError(
        ErrorCode.INVALID_INPUT,
        'Owner, repository, path, and immutable commit SHA are all required to fetch a remote document.'
      );
    }

    // Security path sanitization
    if (path.includes('..') || path.startsWith('/')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Path traversal detected in repository-relative path.');
    }

    const token = await this.getAuthToken();
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`;

    const data = await this.client.get(endpoint, { token });

    if (!data || data.type !== 'file') {
      throw new StudioError(ErrorCode.NOT_FOUND, `Target path "${path}" is not a file.`);
    }

    // Bounded content limit
    if (data.size > 5 * 1024 * 1024) {
      throw new StudioError(
        ErrorCode.PAYLOAD_TOO_LARGE,
        `Remote document (${(data.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size of 5 MB.`
      );
    }

    let decoded = '';
    if (data.encoding === 'base64' && data.content) {
      try {
        decoded = decodeBase64Utf8(data.content);
      } catch (decErr) {
        throw new StudioError(ErrorCode.INVALID_ENCODING, `Failed to decode Base64 file content for "${path}".`);
      }
    } else if (typeof data === 'string') {
      decoded = data;
    } else {
      throw new StudioError(ErrorCode.INVALID_ENCODING, `Unsupported remote content encoding: "${data.encoding}".`);
    }

    // Binary file check (presence of null bytes)
    if (decoded.includes('\0')) {
      throw new StudioError(ErrorCode.INVALID_ENCODING, `File "${path}" appears to be a binary file, not valid Markdown.`);
    }

    return {
      provider: 'github',
      owner,
      repo,
      repoId,
      branch: branch || 'main',
      path,
      baseCommitSha: commitSha,
      baseBlobSha: data.sha || '',
      content: decoded,
      size: data.size || decoded.length,
      fetchTimestamp: Date.now(),
    };
  }
}

export const remoteDocumentService = new RemoteDocumentService();
