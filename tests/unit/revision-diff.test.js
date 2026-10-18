import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentStateManager } from '../../src/core/document-state-manager.js';
import { RemoteDraftService } from '../../src/services/remote-draft-service.js';
import {
  RevisionComparisonService,
  DiffClassification,
  computeLineDiff,
} from '../../src/services/revision-comparison-service.js';

describe('Revision Comparison, Diff & Stale Base Detection (Release 0.4)', () => {
  let stateManager;
  let draftService;
  let repoServiceMock;
  let docServiceMock;
  let comparisonService;

  beforeEach(() => {
    stateManager = new DocumentStateManager();
    draftService = new RemoteDraftService({ stateManager });

    repoServiceMock = {
      getBranchCommitSha: vi.fn(),
    };
    docServiceMock = {
      fetchRemoteDocument: vi.fn(),
    };

    comparisonService = new RevisionComparisonService({
      repoService: repoServiceMock,
      docService: docServiceMock,
      draftService,
      stateManager,
    });
  });

  describe('computeLineDiff', () => {
    it('computes line additions, removals, and unchanged text', () => {
      const oldText = 'Line 1\nLine 2\nLine 3';
      const newText = 'Line 1\nLine 2 modified\nLine 3\nLine 4';

      const diff = computeLineDiff(oldText, newText);
      expect(diff.some((d) => d.type === 'unchanged' && d.text === 'Line 1')).toBe(true);
      expect(diff.some((d) => d.type === 'added' && d.text === 'Line 4')).toBe(true);
    });
  });

  describe('Three-Way Comparison & Stale Base', () => {
    const baseSha = '1111111111111111111111111111111111111111';
    const initialContent = '# Title\nBase content line.';

    let doc;
    beforeEach(() => {
      doc = draftService.openRemoteDraft({
        provider: 'github',
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'main',
        path: 'README.md',
        baseCommitSha: baseSha,
        content: initialContent,
      });
    });

    it('classifies as NO_CHANGES when local and remote match base', async () => {
      repoServiceMock.getBranchCommitSha.mockResolvedValueOnce(baseSha);
      docServiceMock.fetchRemoteDocument.mockResolvedValueOnce({
        content: initialContent,
      });

      const res = await comparisonService.refreshDraft(doc.id);
      expect(res.classification).toBe(DiffClassification.NO_CHANGES);
      expect(res.isStaleBase).toBe(false);
    });

    it('classifies as LOCAL_MODIFIED when local is changed but remote branch is at base', async () => {
      stateManager.updateContent(doc.id, '# Title\nLocal modifications.');
      repoServiceMock.getBranchCommitSha.mockResolvedValueOnce(baseSha);
      docServiceMock.fetchRemoteDocument.mockResolvedValueOnce({
        content: initialContent,
      });

      const res = await comparisonService.refreshDraft(doc.id);
      expect(res.classification).toBe(DiffClassification.LOCAL_MODIFIED);
      expect(res.isStaleBase).toBe(false);
      // Ensure user local edits were NOT overwritten
      expect(doc.content).toBe('# Title\nLocal modifications.');
    });

    it('classifies as REMOTE_UPDATE_AVAILABLE and flags stale base when remote moved', async () => {
      const newRemoteSha = '2222222222222222222222222222222222222222';
      const newRemoteContent = '# Title\nBase content line.\nRemote added line.';

      repoServiceMock.getBranchCommitSha.mockResolvedValueOnce(newRemoteSha);
      docServiceMock.fetchRemoteDocument.mockResolvedValueOnce({
        content: newRemoteContent,
      });

      const res = await comparisonService.refreshDraft(doc.id);
      expect(res.classification).toBe(DiffClassification.REMOTE_UPDATE_AVAILABLE);
      expect(res.isStaleBase).toBe(true);
      expect(res.latestCommitSha).toBe(newRemoteSha);
    });

    it('classifies as DIVERGED when both local and remote have diverged from base', async () => {
      stateManager.updateContent(doc.id, '# Title\nLocal divergent edit.');

      const newRemoteSha = '3333333333333333333333333333333333333333';
      const newRemoteContent = '# Title\nRemote divergent edit.';

      repoServiceMock.getBranchCommitSha.mockResolvedValueOnce(newRemoteSha);
      docServiceMock.fetchRemoteDocument.mockResolvedValueOnce({
        content: newRemoteContent,
      });

      const res = await comparisonService.refreshDraft(doc.id);
      expect(res.classification).toBe(DiffClassification.DIVERGED);
      expect(res.isStaleBase).toBe(true);
      // Invariant 2: Local edits preserved!
      expect(doc.content).toBe('# Title\nLocal divergent edit.');
    });

    it('overwrites local with remote only on explicit user action', () => {
      stateManager.updateContent(doc.id, '# Local change to be overwritten');
      const newRemoteSha = '4444444444444444444444444444444444444444';
      const newRemoteContent = '# Completely New Remote Content';

      comparisonService.overwriteLocalWithRemote(doc.id, newRemoteContent, newRemoteSha);

      expect(doc.content).toBe(newRemoteContent);
      expect(doc.remoteMetadata.baseCommitSha).toBe(newRemoteSha);
      expect(doc.remoteMetadata.baseContent).toBe(newRemoteContent);
      expect(doc.remoteMetadata.isStaleBase).toBe(false);
      expect(doc.state).toBe('CLEAN');
    });
  });
});
