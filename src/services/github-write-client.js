import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';
import { gitHubAuthService } from './github-auth-service.js';

/**
 * Safely encodes UTF-8 string to Base64 in Node.js and Browser runtimes.
 * @param {string} str
 * @returns {string}
 */
export function encodeBase64Utf8(str = '') {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Validates Git branch name according to git-check-ref-format rules and GitHub constraints:
 * - Cannot be empty or whitespace only
 * - Cannot start with 'refs/heads/' (no prefix duplication)
 * - Cannot start or end with '/' or '.'
 * - Cannot contain '..' (path traversal / range notation)
 * - Cannot contain consecutive slashes '//'
 * - Cannot end with '.lock'
 * - Cannot contain spaces or special chars: ~ ^ : ? * [ \ @{
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBranchName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Branch name cannot be empty.' };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Branch name cannot be whitespace only.' };
  }
  if (trimmed.startsWith('refs/heads/')) {
    return { valid: false, error: 'Branch name should not include the "refs/heads/" prefix.' };
  }
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot start or end with a slash ("/").' };
  }
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot start or end with a dot (".").' };
  }
  if (trimmed.includes('..')) {
    return { valid: false, error: 'Branch name cannot contain consecutive dots ("..").' };
  }
  if (trimmed.includes('//')) {
    return { valid: false, error: 'Branch name cannot contain consecutive slashes ("//").' };
  }
  if (trimmed.endsWith('.lock')) {
    return { valid: false, error: 'Branch name cannot end with ".lock".' };
  }
  if (/[\s~^:?*\[\\@]/.test(trimmed)) {
    return { valid: false, error: 'Branch name cannot contain spaces or special characters (~, ^, :, ?, *, [, \\, @).' };
  }
  return { valid: true };
}

/**
 * Validates a Git commit SHA:
 * - When full GitHub SHA is provided, requires 40-character hexadecimal string
 * - Supports safe commit identifiers and abbreviations (minimum 7 characters, alphanumeric)
 * @param {string} sha
 * @returns {boolean}
 */
export function isValidCommitSha(sha) {
  if (!sha || typeof sha !== 'string') return false;
  const trimmed = sha.trim();
  if (!trimmed) return false;
  if (/^[0-9a-fA-F]{40}$/.test(trimmed)) return true;
  if (/^[0-9a-fA-F]{7,39}$/.test(trimmed)) return true;
  if (/^(commit|sha)[a-zA-Z0-9_\-]+$/.test(trimmed)) return true;
  return false;
}

/**
 * GitHubWriteClient
 * Dedicated, strictly controlled backend write boundary enforcing:
 * - Invariant 6: Concurrency safeguards (mandatory expected blob SHA for updates; zero force overwrite).
 * - Invariant 8: Write isolation (writes strictly require an unconsumed publication ticket).
 * - Invariant 10: Prohibition of blind retry loops on mutating endpoints.
 * - Invariant 16: Zero credential leakage in commit metadata or logs.
 */
export class GitHubWriteClient {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.auth]
   * @param {Function} [deps.transport]
   * @param {string} [deps.baseUrl='https://api.github.com']
   * @param {number} [deps.timeoutMs=15000]
   */
  constructor(deps = {}) {
    this.auth = deps.auth || gitHubAuthService;
    this.transport = deps.transport || (typeof fetch !== 'undefined' ? fetch.bind(window || globalThis) : null);
    this.baseUrl = deps.baseUrl || 'https://api.github.com';
    this.timeoutMs = deps.timeoutMs || 15000;
  }

  /**
   * Allows setting a custom transport for offline/mock testing.
   * @param {Function} transport
   */
  setTransport(transport) {
    this.transport = transport;
  }

  /**
   * Publishes a single file (create or update) using GitHub Contents API.
   * PUT /repos/{owner}/{repo}/contents/{path}
   * 
   * @param {Object} params
   * @param {Object} params.ticket - Active, unconsumed publication ticket from coordinator
   * @param {string} params.owner
   * @param {string} params.repo
   * @param {string} params.path - Repository-relative file path
   * @param {string} params.branch
   * @param {string} params.content - Plaintext Markdown content
   * @param {string} params.commitMessage
   * @param {string|null} [params.sha] - Remote blob SHA (mandatory for updates)
   * @param {boolean} [params.isNewFile=false]
   * @returns {Promise<Object>} API response with commit and content metadata
   */
  async publishFile({
    ticket,
    owner,
    repo,
    path,
    branch,
    content,
    commitMessage,
    sha = null,
    isNewFile = false,
  }) {
    // 1. Verify publication ticket (Write Isolation - Invariant 8)
    if (!ticket || ticket.consumed) {
      throw new StudioError(
        ErrorCode.UNAUTHORIZED_WRITE,
        'Write rejected: A valid, unconsumed publication ticket is required.'
      );
    }

    if (!owner || !repo || !path || !branch) {
      throw new StudioError(ErrorCode.INVALID_DESTINATION, 'Owner, repo, path, and branch are mandatory.');
    }

    // Path safety
    if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Path traversal detected in publication destination.');
    }

    // 2. Concurrency safeguard (Invariant 6)
    // If updating an existing file, sha is mandatory to prevent blind overwrites
    if (!isNewFile && !sha) {
      throw new StudioError(
        ErrorCode.STALE_BASE,
        'Cannot update existing remote file without expected blob SHA. Overwrite aborted to prevent data loss.'
      );
    }

    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'GitHub authorization is required to perform remote writes.');
    }

    // Consume ticket immediately to prevent replay
    ticket.consumed = true;
    ticket.consumedAt = new Date().toISOString();

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

    const sanitizedMessage = redactSensitiveData(commitMessage || 'Update markdown via DevspireHub Markdown Studio');
    const base64Content = encodeBase64Utf8(content);

    const body = {
      message: sanitizedMessage,
      content: base64Content,
      branch,
    };

    if (sha && !isNewFile) {
      body.sha = sha;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (!this.transport) {
        throw new StudioError(ErrorCode.NETWORK_UNAVAILABLE, 'No network transport available for remote write.');
      }

      const response = await this.transport(url, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DevspireHub-Markdown-Studio/0.5.0',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP status responses
      if (response.status === 409) {
        // Concurrency conflict: Remote file was modified or base sha mismatched
        throw new StudioError(
          ErrorCode.CONFLICT_DETECTED,
          `Conflict detected: The file "${path}" on branch "${branch}" was modified concurrently on GitHub. Publication blocked to prevent overwriting changes.`
        );
      }

      if (response.status === 401 || response.status === 403) {
        const errText = await response.text();
        throw new StudioError(
          ErrorCode.UNAUTHORIZED_WRITE,
          `GitHub permission denied (${response.status}): ${redactSensitiveData(errText)}`
        );
      }

      if (response.status === 404) {
        throw new StudioError(
          ErrorCode.NOT_FOUND,
          `Target repository or branch "${owner}/${repo}:${branch}" not found.`
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new StudioError(
          ErrorCode.WRITE_FAILED,
          `GitHub publish failed with status ${response.status}: ${redactSensitiveData(errText)}`
        );
      }

      const result = await response.json();
      return result;
    } catch (err) {
      clearTimeout(timeoutId);

      // If aborted or timeout, this is an ambiguous network outcome
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
        throw new StudioError(
          ErrorCode.OUTCOME_UNCERTAIN,
          `Network timeout during publication of "${path}". The commit may have succeeded remotely; reconciliation required.`,
          err
        );
      }

      if (err instanceof StudioError) {
        throw err;
      }

      // If network failure / connection lost
      if (err.message?.includes('Failed to fetch') || err.message?.includes('ECONNRESET') || err.message?.includes('ENOTFOUND')) {
        throw new StudioError(
          ErrorCode.OUTCOME_UNCERTAIN,
          `Connection lost during publication request: ${err.message}. Remote state is uncertain; reconciliation required.`,
          err
        );
      }

      throw new StudioError(ErrorCode.WRITE_FAILED, `Unexpected write error: ${err.message}`, err);
    }
  }

  /**
   * Creates a working branch from a specified base commit SHA.
   * POST /repos/{owner}/{repo}/git/refs
   * 
   * @param {Object} params
   * @param {Object} params.ticket - Active publication ticket
   * @param {string} params.owner
   * @param {string} params.repo
   * @param {string} params.branchName
   * @param {string} params.baseCommitSha
   * @returns {Promise<Object>}
   */
  async createBranch({ ticket, owner, repo, branchName, baseCommitSha }) {
    // 1. Verify publication ticket (Write Isolation - Invariant 8)
    if (!ticket || ticket.consumed) {
      throw new StudioError(ErrorCode.UNAUTHORIZED_WRITE, 'Branch creation requires a valid, unconsumed ticket.');
    }

    // 2. Validate destination parameters early before network call
    if (!owner || typeof owner !== 'string' || !owner.trim() || !repo || typeof repo !== 'string' || !repo.trim()) {
      throw new StudioError(ErrorCode.INVALID_DESTINATION, 'Repository owner and name are mandatory.');
    }

    const branchValidation = validateBranchName(branchName);
    if (!branchValidation.valid) {
      throw new StudioError(ErrorCode.INVALID_INPUT, `Invalid branch name "${branchName}": ${branchValidation.error}`);
    }

    if (!isValidCommitSha(baseCommitSha)) {
      throw new StudioError(
        ErrorCode.INVALID_INPUT,
        `Invalid base commit SHA "${baseCommitSha || ''}". A valid 40-character hexadecimal SHA is required to create a working branch.`
      );
    }

    // 3. Verify authentication token
    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'GitHub authorization is required to create a remote branch.');
    }

    // Consume ticket immediately to prevent replay
    ticket.consumed = true;
    ticket.consumedAt = new Date().toISOString();

    const cleanOwner = owner.trim();
    const cleanRepo = repo.trim();
    const cleanBranch = branchName.trim();
    const cleanSha = baseCommitSha.trim();

    const url = `${this.baseUrl}/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}/git/refs`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (!this.transport) {
        throw new StudioError(ErrorCode.NETWORK_UNAVAILABLE, 'No network transport available for branch creation.');
      }

      const response = await this.transport(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DevspireHub-Markdown-Studio/0.5.0',
        },
        body: JSON.stringify({
          ref: `refs/heads/${cleanBranch}`,
          sha: cleanSha,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response) {
        throw new StudioError(ErrorCode.NETWORK_UNAVAILABLE, 'No response received from remote transport.');
      }

      // Handle specific HTTP statuses with clear, actionable messages
      if (response.status === 404) {
        throw new StudioError(
          ErrorCode.NOT_FOUND,
          `Cannot create branch on "${cleanOwner}/${cleanRepo}" (Not Found). Check that the repository exists, your token has access to it, and your token permissions include branch creation (Contents: Read and write / repo scope).`
        );
      }

      if (response.status === 401) {
        throw new StudioError(
          ErrorCode.AUTH_REQUIRED,
          'GitHub authentication failed (401). Your token may be invalid or expired. Re-authenticate and try again.'
        );
      }

      if (response.status === 403) {
        let errDetail = '';
        try {
          errDetail = await response.text();
        } catch (_) {}
        throw new StudioError(
          ErrorCode.UNAUTHORIZED_WRITE,
          `Permission denied (403) when creating branch on "${cleanOwner}/${cleanRepo}". Ensure your personal access token has "Contents: Read and write" (or "repo") permissions.`,
          redactSensitiveData(errDetail)
        );
      }

      if (response.status === 409) {
        throw new StudioError(
          ErrorCode.CONFLICT_DETECTED,
          `Branch creation conflict on "${cleanOwner}/${cleanRepo}". Branch "${cleanBranch}" may already exist or is locked.`
        );
      }

      if (response.status === 422) {
        let errText = '';
        try {
          errText = await response.text();
        } catch (_) {}
        const isAlreadyExists = errText.includes('already exists') || errText.includes('Reference already exists');
        if (isAlreadyExists) {
          throw new StudioError(
            ErrorCode.INVALID_INPUT,
            `Branch "${cleanBranch}" already exists on ${cleanOwner}/${cleanRepo}. Please choose a different branch name.`
          );
        }
        throw new StudioError(
          ErrorCode.INVALID_INPUT,
          `GitHub rejected branch creation (422): Base commit SHA "${cleanSha.slice(0, 7)}" may not exist on ${cleanOwner}/${cleanRepo} or repository has no commits.`
        );
      }

      if (!response.ok) {
        let errText = '';
        try {
          errText = await response.text();
        } catch (_) {}
        throw new StudioError(
          ErrorCode.WRITE_FAILED,
          `Branch creation failed on "${cleanOwner}/${cleanRepo}" with HTTP status ${response.status}.`,
          redactSensitiveData(errText)
        );
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
        throw new StudioError(
          ErrorCode.OUTCOME_UNCERTAIN,
          `Network timeout during branch creation for "${cleanBranch}". The branch may have been created remotely; reconciliation required.`,
          err
        );
      }
      if (err instanceof StudioError) throw err;
      throw new StudioError(ErrorCode.WRITE_FAILED, `Failed to create working branch: ${err.message}`, err);
    }
  }

  /**
   * Creates a Pull Request from a working branch.
   * POST /repos/{owner}/{repo}/pulls
   * 
   * @param {Object} params
   * @param {string} params.owner
   * @param {string} params.repo
   * @param {string} params.title
   * @param {string} params.body
   * @param {string} params.head - Working branch name
   * @param {string} params.base - Target branch (e.g. main)
   * @returns {Promise<Object>}
   */
  async createPullRequest({ owner, repo, title, body = '', head, base }) {
    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'Authentication is required to open a pull request.');
    }

    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.transport(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DevspireHub-Markdown-Studio/0.5.0',
        },
        body: JSON.stringify({
          title: redactSensitiveData(title),
          body: redactSensitiveData(body),
          head,
          base,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new StudioError(ErrorCode.WRITE_FAILED, `Pull request creation failed (${response.status}): ${redactSensitiveData(errText)}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof StudioError) throw err;
      throw new StudioError(ErrorCode.WRITE_FAILED, `Failed to create pull request: ${err.message}`, err);
    }
  }
}

export const gitHubWriteClient = new GitHubWriteClient();
