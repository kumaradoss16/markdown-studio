import { documentStateManager, DocumentState } from '../core/document-state-manager.js';
import { AppEvents, eventBus } from '../app/events.js';
import { ErrorCode, StudioError } from './error-service.js';

export const RemoteRelationshipState = {
  LOCAL_ONLY: 'LOCAL_ONLY',
  REMOTE_CLEAN: 'REMOTE_CLEAN',
  REMOTE_DIRTY: 'REMOTE_DIRTY',
  REMOTE_UPDATE_AVAILABLE: 'REMOTE_UPDATE_AVAILABLE',
  REMOTE_DIVERGED: 'REMOTE_DIVERGED',
  REMOTE_UNAVAILABLE: 'REMOTE_UNAVAILABLE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  REMOTE_SOURCE_MISSING: 'REMOTE_SOURCE_MISSING',
};

/**
 * RemoteDraftService
 * Manages remote-backed drafts, provenance identity, state transitions,
 * and immutable base revision retention.
 */
export class RemoteDraftService {
  constructor(deps = {}) {
    this.stateManager = deps.stateManager || documentStateManager;
    this.setupListeners();
  }

  setupListeners() {
    // When a document changes, update relationship state if it is a remote-backed draft
    eventBus.on(AppEvents.DOCUMENT_CHANGED, (doc) => {
      if (this.isRemoteDraft(doc)) {
        this.updateDraftRelationship(doc);
      }
    });
  }

  /**
   * Checks if a document model is a remote-backed draft.
   * @param {any} doc
   * @returns {boolean}
   */
  isRemoteDraft(doc) {
    return Boolean(doc && doc.remoteMetadata && doc.remoteMetadata.provider === 'github');
  }

  /**
   * Generates a stable source identity key for a remote draft.
   * @param {Object} meta
   * @returns {string}
   */
  getDraftIdentity(meta) {
    return `${meta.provider}:${meta.owner}/${meta.repo}:${meta.branch}:${meta.path}:${meta.baseCommitSha}`;
  }

  /**
   * Opens or creates a remote-backed draft document.
   * @param {Object} remoteDoc
   * @returns {any} The opened document model
   */
  openRemoteDraft(remoteDoc) {
    if (!remoteDoc.owner || !remoteDoc.repo || !remoteDoc.path || !remoteDoc.baseCommitSha) {
      throw new StudioError(
        ErrorCode.INVALID_INPUT,
        'Cannot create remote draft without complete provenance metadata (owner, repo, path, baseCommitSha).'
      );
    }

    const expectedIdentity = this.getDraftIdentity(remoteDoc);

    // 1. Check if already open
    for (const openDoc of this.stateManager.documents.values()) {
      if (this.isRemoteDraft(openDoc)) {
        const existingIdentity = this.getDraftIdentity(openDoc.remoteMetadata);
        if (existingIdentity === expectedIdentity) {
          this.stateManager.setActiveDocument(openDoc.id);
          return openDoc;
        }
      }
    }

    // 2. Create new local draft model with full remote metadata
    const fileName = remoteDoc.path.split('/').pop() || 'RemoteDocument.md';
    const syntheticPath = `github://${remoteDoc.owner}/${remoteDoc.repo}/${remoteDoc.branch}/${remoteDoc.path}`;

    const doc = this.stateManager.createDocument(fileName, remoteDoc.content, syntheticPath);

    // Attach immutable remote provenance metadata
    doc.remoteMetadata = {
      provider: 'github',
      owner: remoteDoc.owner,
      repo: remoteDoc.repo,
      repoId: remoteDoc.repoId || null,
      branch: remoteDoc.branch || 'main',
      path: remoteDoc.path,
      baseCommitSha: remoteDoc.baseCommitSha,
      baseBlobSha: remoteDoc.baseBlobSha || '',
      baseContent: remoteDoc.content, // Immutable reference for 3-way diff
      relationshipState: RemoteRelationshipState.REMOTE_CLEAN,
      lastFetchedCommitSha: remoteDoc.baseCommitSha,
      lastRefreshTimestamp: remoteDoc.fetchTimestamp || Date.now(),
      latestRemoteContent: remoteDoc.content,
      isStaleBase: false,
    };

    eventBus.emit(AppEvents.GITHUB_DRAFT_REFRESHED, { doc, state: doc.remoteMetadata.relationshipState });
    return doc;
  }

  /**
   * Updates the relationship state of a remote draft based on local edits and known remote status.
   * @param {any} doc
   */
  updateDraftRelationship(doc) {
    if (!this.isRemoteDraft(doc)) return;

    const meta = doc.remoteMetadata;
    const isLocallyModified = doc.content !== meta.baseContent;
    const isRemoteModified = meta.latestRemoteContent !== meta.baseContent || meta.isStaleBase;

    let newState = RemoteRelationshipState.REMOTE_CLEAN;

    if (isLocallyModified && isRemoteModified) {
      newState = RemoteRelationshipState.REMOTE_DIVERGED;
    } else if (isLocallyModified) {
      newState = RemoteRelationshipState.REMOTE_DIRTY;
    } else if (isRemoteModified) {
      newState = RemoteRelationshipState.REMOTE_UPDATE_AVAILABLE;
    } else {
      newState = RemoteRelationshipState.REMOTE_CLEAN;
    }

    if (meta.relationshipState !== newState) {
      meta.relationshipState = newState;
      eventBus.emit(AppEvents.GITHUB_DRAFT_REFRESHED, { doc, state: newState });
    }
  }

  /**
   * Safely switches or establishes a new base for an existing draft upon explicit user confirmation.
   * @param {string} docId
   * @param {string} newBaseCommitSha
   * @param {string} newContent
   */
  updateBaseRevision(docId, newBaseCommitSha, newContent) {
    const doc = this.stateManager.documents.get(docId);
    if (!doc || !this.isRemoteDraft(doc)) {
      throw new StudioError(ErrorCode.NOT_FOUND, 'Target remote draft was not found.');
    }

    doc.remoteMetadata.baseCommitSha = newBaseCommitSha;
    doc.remoteMetadata.baseContent = newContent;
    doc.remoteMetadata.latestRemoteContent = newContent;
    doc.remoteMetadata.lastFetchedCommitSha = newBaseCommitSha;
    doc.remoteMetadata.lastRefreshTimestamp = Date.now();
    doc.remoteMetadata.isStaleBase = false;

    this.updateDraftRelationship(doc);
  }
}

export const remoteDraftService = new RemoteDraftService();
