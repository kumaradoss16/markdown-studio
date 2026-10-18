import { gitHubApiClient } from './github-api-client.js';
import { gitHubAuthService } from './github-auth-service.js';
import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';

/**
 * RepositoryService
 * Manages authorized repository discovery, branch resolution, and remote filesystem tree navigation.
 */
export class RepositoryService {
  constructor(deps = {}) {
    this.client = deps.client || gitHubApiClient;
    this.auth = deps.auth || gitHubAuthService;
  }

  async getAuthToken() {
    const token = await this.auth.getToken();
    if (!token) {
      throw new StudioError(ErrorCode.AUTH_REQUIRED, 'GitHub authorization is required to access repositories.');
    }
    return token;
  }

  /**
   * Lists repositories accessible to the authenticated identity.
   * @param {number} [page=1]
   * @param {number} [perPage=30]
   * @returns {Promise<Array<any>>}
   */
  async listRepositories(page = 1, perPage = 30) {
    const token = await this.getAuthToken();
    const endpoint = `/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`;
    
    const repos = await this.client.get(endpoint, { token });
    if (!Array.isArray(repos)) {
      throw new StudioError(ErrorCode.INVALID_ENCODING, 'Expected array of repositories from GitHub API.');
    }

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner ? r.owner.login : '',
      ownerAvatar: r.owner ? r.owner.avatar_url : '',
      isPrivate: Boolean(r.private),
      defaultBranch: r.default_branch || 'main',
      description: r.description || '',
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Lists branches for a specific repository.
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<Array<{ name: string, commitSha: string, isDefault: boolean }>>}
   */
  async listBranches(owner, repo) {
    if (!owner || !repo) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Owner and repository name are required to list branches.');
    }

    const token = await this.getAuthToken();
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`;

    const branches = await this.client.get(endpoint, { token });
    if (!Array.isArray(branches)) {
      throw new StudioError(ErrorCode.INVALID_ENCODING, 'Expected branch list array from GitHub API.');
    }

    return branches.map((b) => ({
      name: b.name,
      commitSha: b.commit?.sha || '',
      isProtected: Boolean(b.protected),
    }));
  }

  /**
   * Resolves the latest commit SHA for a specific branch.
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @returns {Promise<string>}
   */
  async getBranchCommitSha(owner, repo, branch) {
    const token = await this.getAuthToken();
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
    const commitData = await this.client.get(endpoint, { token });
    if (!commitData?.sha) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Could not resolve commit SHA for branch "${branch}".`);
    }
    return commitData.sha;
  }

  /**
   * Recursively fetches Git tree for browsing Markdown files.
   * @param {string} owner
   * @param {string} repo
   * @param {string} commitSha
   * @returns {Promise<Array<any>>}
   */
  async getTree(owner, repo, commitSha) {
    const token = await this.getAuthToken();
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;

    const data = await this.client.get(endpoint, { token });
    if (!data || !Array.isArray(data.tree)) {
      throw new StudioError(ErrorCode.INVALID_ENCODING, 'Invalid Git tree representation returned from GitHub API.');
    }

    // Filter to markdown files and directories with security checks on path
    const validItems = [];
    for (const item of data.tree) {
      if (item.path.includes('..') || item.path.startsWith('/')) {
        continue; // Prevent path traversal
      }

      const isMarkdown = item.path.toLowerCase().endsWith('.md') || item.path.toLowerCase().endsWith('.markdown');
      const isDir = item.type === 'tree';

      if (isMarkdown || isDir) {
        validItems.push({
          path: item.path,
          mode: item.mode,
          type: item.type === 'tree' ? 'directory' : 'file',
          sha: item.sha,
          size: item.size || 0,
        });
      }
    }

    return validItems;
  }
}

export const repositoryService = new RepositoryService();
