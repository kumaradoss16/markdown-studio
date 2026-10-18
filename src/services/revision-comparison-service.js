import { documentStateManager } from '../core/document-state-manager.js';
import { repositoryService } from './repository-service.js';
import { remoteDocumentService } from './remote-document-service.js';
import { remoteDraftService, RemoteRelationshipState } from './remote-draft-service.js';
import { ErrorCode, StudioError } from './error-service.js';
import { AppEvents, eventBus } from '../app/events.js';

export const DiffClassification = {
  NO_CHANGES: 'NO_CHANGES',
  LOCAL_MODIFIED: 'LOCAL_MODIFIED',
  REMOTE_UPDATE_AVAILABLE: 'REMOTE_UPDATE_AVAILABLE',
  DIVERGED: 'DIVERGED',
};

/**
 * Computes a clean line-by-line diff between two text strings.
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{ type: 'added' | 'removed' | 'unchanged', text: string, lineNo: number }>}
 */
export function computeLineDiff(oldText = '', newText = '') {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);

  const diff = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push({ type: 'unchanged', text: oldLines[i], oldLineNo: i + 1, newLineNo: j + 1 });
        i++;
        j++;
      } else {
        // Simple lookahead heuristic for single line addition/deletion
        if (i + 1 < oldLines.length && oldLines[i + 1] === newLines[j]) {
          diff.push({ type: 'removed', text: oldLines[i], oldLineNo: i + 1, newLineNo: null });
          i++;
        } else if (j + 1 < newLines.length && oldLines[i] === newLines[j + 1]) {
          diff.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: j + 1 });
          j++;
        } else {
          diff.push({ type: 'removed', text: oldLines[i], oldLineNo: i + 1, newLineNo: null });
          diff.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: j + 1 });
          i++;
          j++;
        }
      }
    } else if (i < oldLines.length) {
      diff.push({ type: 'removed', text: oldLines[i], oldLineNo: i + 1, newLineNo: null });
      i++;
    } else {
      diff.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: j + 1 });
      j++;
    }
  }

  return diff;
}

/**
 * RevisionComparisonService
 * Manages three-way comparison (Base, Local, Remote), stale-base detection,
 * and divergence analysis.
 */
export class RevisionComparisonService {
  constructor(deps = {}) {
    this.repoService = deps.repoService || repositoryService;
    this.docService = deps.docService || remoteDocumentService;
    this.draftService = deps.draftService || remoteDraftService;
    this.stateManager = deps.stateManager || documentStateManager;
  }

  /**
   * Refreshes remote status for a draft without modifying local user content.
   * @param {string} docId
   * @returns {Promise<any>}
   */
  async refreshDraft(docId) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc || !this.draftService.isRemoteDraft(doc)) {
      throw new StudioError(ErrorCode.NOT_FOUND, 'Target document is not a remote-backed draft.');
    }

    const meta = doc.remoteMetadata;

    try {
      // 1. Resolve current branch commit SHA
      const currentBranchSha = await this.repoService.getBranchCommitSha(meta.owner, meta.repo, meta.branch);

      // 2. Fetch remote document at current branch commit SHA
      const remoteDoc = await this.docService.fetchRemoteDocument({
        owner: meta.owner,
        repo: meta.repo,
        path: meta.path,
        branch: meta.branch,
        commitSha: currentBranchSha,
      });

      // 3. Classify comparison against Base
      const isLocalChanged = doc.content !== meta.baseContent;
      const isRemoteChanged = remoteDoc.content !== meta.baseContent || currentBranchSha !== meta.baseCommitSha;
      const isStaleBase = currentBranchSha !== meta.baseCommitSha;

      let classification = DiffClassification.NO_CHANGES;
      if (isLocalChanged && isRemoteChanged) {
        classification = DiffClassification.DIVERGED;
      } else if (isLocalChanged) {
        classification = DiffClassification.LOCAL_MODIFIED;
      } else if (isRemoteChanged) {
        classification = DiffClassification.REMOTE_UPDATE_AVAILABLE;
      }

      // Update metadata on draft without touching user edits
      meta.latestRemoteContent = remoteDoc.content;
      meta.lastFetchedCommitSha = currentBranchSha;
      meta.lastRefreshTimestamp = Date.now();
      meta.isStaleBase = isStaleBase;

      this.draftService.updateDraftRelationship(doc);

      const comparison = {
        docId: doc.id,
        classification,
        isStaleBase,
        baseCommitSha: meta.baseCommitSha,
        latestCommitSha: currentBranchSha,
        baseContent: meta.baseContent,
        localContent: doc.content,
        remoteContent: remoteDoc.content,
        diffLocalVsRemote: computeLineDiff(doc.content, remoteDoc.content),
        diffBaseVsRemote: computeLineDiff(meta.baseContent, remoteDoc.content),
      };

      eventBus.emit(AppEvents.GITHUB_DRAFT_REFRESHED, { doc, comparison });
      return comparison;
    } catch (err) {
      meta.relationshipState = RemoteRelationshipState.REMOTE_UNAVAILABLE;
      eventBus.emit(AppEvents.GITHUB_DRAFT_REFRESHED, { doc, error: err });
      throw err;
    }
  }

  /**
   * Explicitly replaces local draft with newly fetched remote revision.
   * @param {string} docId
   * @param {string} latestContent
   * @param {string} latestCommitSha
   */
  overwriteLocalWithRemote(docId, latestContent, latestCommitSha) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc || !this.draftService.isRemoteDraft(doc)) {
      throw new StudioError(ErrorCode.NOT_FOUND, 'Target remote draft was not found.');
    }

    // Replace content
    this.stateManager.updateContent(docId, latestContent);
    // Mark base as new commit
    this.draftService.updateBaseRevision(docId, latestCommitSha, latestContent);

    // Mark as clean since local now matches base and remote
    doc.savedRevision = doc.revision;
    doc.state = 'CLEAN';

    eventBus.emit(AppEvents.NOTIFICATION, {
      type: 'info',
      message: `Updated local draft to remote revision ${latestCommitSha.slice(0, 7)}.`,
    });
  }
}

export const revisionComparisonService = new RevisionComparisonService();
