import { redactSensitiveData } from './error-service.js';
import { computeLineDiff } from './revision-comparison-service.js';

/**
 * ChangeSummaryService
 * Generates deterministic, human-readable summaries of document modifications,
 * ensuring strict credential redaction (Invariant 8: Zero Secret Leakage).
 */
export class ChangeSummaryService {
  /**
   * Generates a concise, human-readable change summary.
   * @param {Object} params
   * @param {'local_save' | 'autosnapshot' | 'restore' | 'publish' | 'remote_refresh'} params.source
   * @param {string} [params.oldText='']
   * @param {string} [params.newText='']
   * @param {Array<Object>} [params.diff]
   * @param {string} [params.customMessage]
   * @param {Object} [params.metadata]
   * @returns {string} Sanitized, human-readable summary
   */
  generateSummary({
    source = 'local_save',
    oldText = '',
    newText = '',
    diff = null,
    customMessage = null,
    metadata = {},
  }) {
    if (customMessage && typeof customMessage === 'string' && customMessage.trim()) {
      return redactSensitiveData(customMessage.trim());
    }

    // Compute diff stats if not provided
    const lineDiff = diff || computeLineDiff(oldText || '', newText || '');
    let added = 0;
    let removed = 0;

    for (const item of lineDiff) {
      if (item.type === 'added') added++;
      else if (item.type === 'removed') removed++;
    }

    const isInitial = (!oldText && Boolean(newText)) || metadata.isInitial;
    let summary = '';

    switch (source) {
      case 'local_save':
        if (isInitial) {
          summary = 'Initial document creation';
        } else if (added === 0 && removed === 0) {
          summary = 'Saved to disk (no content changes)';
        } else {
          summary = `Saved to disk (+${added} / -${removed} lines)`;
        }
        break;

      case 'autosnapshot':
        if (added === 0 && removed === 0) {
          summary = 'Checkpoint snapshot';
        } else {
          summary = `Checkpoint snapshot (+${added} / -${removed} lines)`;
        }
        break;

      case 'restore':
        const fromRev = metadata.restoredFromRevision || metadata.restoredFromHistoryId || '';
        const revClause = fromRev ? ` from ${fromRev}` : '';
        if (added === 0 && removed === 0) {
          summary = `Restored${revClause} (identical content)`;
        } else {
          summary = `Restored${revClause} (+${added} / -${removed} lines)`;
        }
        break;

      case 'publish':
        const repo = metadata.repo ? `${metadata.owner ? metadata.owner + '/' : ''}${metadata.repo}` : '';
        const branch = metadata.branch ? `@${metadata.branch}` : '';
        const dest = repo ? ` to ${repo}${branch}` : '';
        summary = `Published${dest} (+${added} / -${removed} lines)`;
        break;

      case 'remote_refresh':
        const commit = metadata.commitSha ? ` (${metadata.commitSha.slice(0, 7)})` : '';
        summary = `Remote base synchronized from GitHub${commit}`;
        break;

      default:
        summary = `Document revision (+${added} / -${removed} lines)`;
        break;
    }

    return redactSensitiveData(summary);
  }
}

export const changeSummaryService = new ChangeSummaryService();
