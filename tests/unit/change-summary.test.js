import { describe, it, expect } from 'vitest';
import { ChangeSummaryService } from '../../src/services/change-summary-service.js';

describe('ChangeSummaryService (Release 0.6)', () => {
  const service = new ChangeSummaryService();

  it('generates summary for initial local_save', () => {
    const summary = service.generateSummary({
      source: 'local_save',
      oldText: '',
      newText: '# Hello World\nInitial file',
    });
    expect(summary).toBe('Initial document creation');
  });

  it('generates summary for edits in local_save with line delta', () => {
    const summary = service.generateSummary({
      source: 'local_save',
      oldText: 'Line 1\nLine 2',
      newText: 'Line 1\nLine 2 modified\nLine 3 added',
    });
    expect(summary).toContain('Saved to disk');
    expect(summary).toContain('lines');
  });

  it('generates summary for restore with revision reference', () => {
    const summary = service.generateSummary({
      source: 'restore',
      oldText: 'Current content',
      newText: 'Old restored content',
      metadata: { restoredFromRevision: 'rev_12345' },
    });
    expect(summary).toContain('Restored from rev_12345');
  });

  it('generates summary for publish with repo and branch destination', () => {
    const summary = service.generateSummary({
      source: 'publish',
      oldText: 'Draft',
      newText: 'Published doc',
      metadata: { owner: 'user', repo: 'docs-repo', branch: 'main' },
    });
    expect(summary).toContain('Published to user/docs-repo@main');
  });

  it('generates summary for remote_refresh with commit SHA slice', () => {
    const summary = service.generateSummary({
      source: 'remote_refresh',
      metadata: { commitSha: '7b8f9e0123456789' },
    });
    expect(summary).toBe('Remote base synchronized from GitHub (7b8f9e0)');
  });

  it('strictly redacts sensitive tokens in custom messages and metadata (Invariant 8)', () => {
    const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const summary = service.generateSummary({
      source: 'local_save',
      customMessage: `Updated docs with token ${secret}`,
    });
    expect(summary).not.toContain(secret);
    expect(summary).toContain('[REDACTED_TOKEN]');
  });
});
