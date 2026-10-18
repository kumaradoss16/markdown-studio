import { gitHubAuthService, AuthState } from '../../services/github-auth-service.js';
import { repositoryService } from '../../services/repository-service.js';
import { remoteDocumentService } from '../../services/remote-document-service.js';
import { remoteDraftService } from '../../services/remote-draft-service.js';
import { AppEvents, eventBus } from '../../app/events.js';

/**
 * GitHubPanelComponent
 * Sidebar module for GitHub account management, repository and branch browsing,
 * and remote Markdown loading into local drafts.
 */
export class GitHubPanelComponent {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.repositories = [];
    this.selectedRepo = null; // { owner, name, defaultBranch }
    this.branches = [];
    this.selectedBranch = null; // { name, commitSha }
    this.files = [];
    this.isLoading = false;
    this.error = null;

    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.GITHUB_AUTH_CHANGED, () => {
      this.render();
      if (gitHubAuthService.isAuthenticated()) {
        this.loadRepositories();
      }
    });
  }

  async render() {
    const isAuthed = gitHubAuthService.isAuthenticated();
    const user = gitHubAuthService.getUser();

    if (!isAuthed) {
      this.container.innerHTML = `
        <div class="github-panel-signed-out">
          <div class="github-auth-prompt">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
            </svg>
            <span>GitHub Integration</span>
          </div>
          <button class="github-connect-btn" id="githubConnectBtn">
            <span>Connect GitHub Identity</span>
          </button>
          <div class="github-auth-hint">
            Requires a PAT with <strong>Contents: Read and write</strong> (fine-grained) or <strong>repo</strong> (classic) for publishing changes.
          </div>
        </div>
      `;

      this.container.querySelector('#githubConnectBtn')?.addEventListener('click', () => {
        this.promptTokenAuth();
      });
      return;
    }

    // Authenticated View
    this.container.innerHTML = `
      <div class="github-panel-authenticated">
        <div class="github-account-strip">
          <div class="github-user-info">
            <span class="github-dot connected"></span>
            <span class="github-username">@${user.login}</span>
          </div>
          <div class="github-account-actions">
            <button class="github-action-btn" id="githubUpdateTokenBtn" title="Update or renew token permissions">Update Token</button>
            <button class="github-disconnect-btn" id="githubDisconnectBtn" title="Disconnect GitHub identity">Disconnect</button>
          </div>
        </div>

        <div class="github-selectors">
          <select class="github-select" id="githubRepoSelect">
            <option value="">Select Repository...</option>
            ${this.repositories.map((r) => `
              <option value="${r.fullName}" ${this.selectedRepo?.fullName === r.fullName ? 'selected' : ''}>
                ${r.fullName} ${r.isPrivate ? '(Private)' : ''}
              </option>
            `).join('')}
          </select>

          ${this.selectedRepo ? `
            <select class="github-select" id="githubBranchSelect">
              ${this.branches.map((b) => `
                <option value="${b.name}" ${this.selectedBranch?.name === b.name ? 'selected' : ''}>
                  ${b.name} (${b.commitSha.slice(0, 7)})
                </option>
              `).join('')}
            </select>
          ` : ''}
        </div>

        <div class="github-tree-content">
          ${this.isLoading ? `
            <div class="github-loading">Loading repository contents...</div>
          ` : this.error ? `
            <div class="github-error">${this.error}</div>
          ` : this.files.length > 0 ? `
            <div class="github-file-list">
              ${this.files.map((file) => `
                <div class="github-file-item" data-path="${file.path}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span class="file-name" title="${file.path}">${file.path}</span>
                </div>
              `).join('')}
            </div>
          ` : this.selectedRepo ? `
            <div class="github-empty">No Markdown files found in this branch.</div>
          ` : `
            <div class="github-empty">Select a repository to explore files.</div>
          `}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    this.container.querySelector('#githubUpdateTokenBtn')?.addEventListener('click', async () => {
      await this.promptTokenAuth('Update your GitHub Personal Access Token:\n\n• Fine-grained PAT: Ensure Repository Access includes target repos, and Permissions include "Contents: Read and write" (and "Pull requests: Read and write" if opening PRs).\n• Classic PAT: Select the "repo" scope.\n\nEnter updated token:');
    });

    this.container.querySelector('#githubDisconnectBtn')?.addEventListener('click', async () => {
      if (confirm('Disconnect GitHub identity? Local drafts will remain preserved.')) {
        await gitHubAuthService.disconnect();
      }
    });

    const repoSelect = this.container.querySelector('#githubRepoSelect');
    if (repoSelect) {
      repoSelect.addEventListener('change', async (e) => {
        const fullName = e.target.value;
        const repo = this.repositories.find((r) => r.fullName === fullName);
        if (repo) {
          await this.selectRepository(repo);
        } else {
          this.selectedRepo = null;
          this.branches = [];
          this.files = [];
          this.render();
        }
      });
    }

    const branchSelect = this.container.querySelector('#githubBranchSelect');
    if (branchSelect) {
      branchSelect.addEventListener('change', async (e) => {
        const branchName = e.target.value;
        const branch = this.branches.find((b) => b.name === branchName);
        if (branch) {
          this.selectedBranch = branch;
          await this.loadTree();
        }
      });
    }

    this.container.querySelectorAll('.github-file-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const path = el.getAttribute('data-path');
        if (path) {
          await this.openFile(path);
        }
      });
    });
  }

  async promptTokenAuth(customMessage = null) {
    const defaultPrompt =
      'Enter your GitHub Personal Access Token:\n\n' +
      '• Fine-grained PAT: Ensure Repository Access includes target repos, and Permissions include "Contents: Read and write" (and "Pull requests: Read and write" if opening PRs).\n' +
      '• Classic PAT: Select the "repo" scope.\n\n' +
      'Paste your token below:';
    const message = customMessage || defaultPrompt;
    const token = prompt(message);
    if (token && token.trim()) {
      try {
        await gitHubAuthService.authenticateWithToken(token.trim());
      } catch (err) {
        alert(`Authentication failed: ${err.message}`);
      }
    }
  }

  async loadRepositories() {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      this.repositories = await repositoryService.listRepositories();
      this.isLoading = false;
      this.render();
    } catch (err) {
      this.isLoading = false;
      this.error = err.message;
      this.render();
    }
  }

  async selectRepository(repo) {
    this.selectedRepo = repo;
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      this.branches = await repositoryService.listBranches(repo.owner, repo.name);
      const defaultBranch = this.branches.find((b) => b.name === repo.defaultBranch) || this.branches[0];
      this.selectedBranch = defaultBranch;
      await this.loadTree();
    } catch (err) {
      this.isLoading = false;
      this.error = err.message;
      this.render();
    }
  }

  async loadTree() {
    if (!this.selectedRepo || !this.selectedBranch) return;
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const tree = await repositoryService.getTree(
        this.selectedRepo.owner,
        this.selectedRepo.name,
        this.selectedBranch.commitSha
      );
      this.files = tree.filter((item) => item.type === 'file');
      this.isLoading = false;
      this.render();
    } catch (err) {
      this.isLoading = false;
      this.error = err.message;
      this.render();
    }
  }

  async openFile(path) {
    if (!this.selectedRepo || !this.selectedBranch) return;

    try {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'info',
        message: `Fetching "${path}" at revision ${this.selectedBranch.commitSha.slice(0, 7)}...`,
      });

      const remoteDoc = await remoteDocumentService.fetchRemoteDocument({
        owner: this.selectedRepo.owner,
        repo: this.selectedRepo.name,
        path,
        branch: this.selectedBranch.name,
        commitSha: this.selectedBranch.commitSha,
        repoId: this.selectedRepo.id,
      });

      remoteDraftService.openRemoteDraft(remoteDoc);
    } catch (err) {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'error',
        message: `Failed to open remote document: ${err.message}`,
      });
    }
  }
}
