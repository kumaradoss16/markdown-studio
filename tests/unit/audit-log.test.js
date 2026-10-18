import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogService } from '../../src/services/audit-log-service.js';

describe('AuditLogService (Release 0.6)', () => {
  let auditLog;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      _data: {},
      getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    };
    auditLog = new AuditLogService({ storage: mockStorage, maxEvents: 5 });
  });

  it('records audit events with unique auditId, timestamp, and metadata', () => {
    const event = auditLog.recordEvent({
      documentKey: 'docs/architecture.md',
      action: 'SAVE',
      outcome: 'SUCCESS',
      summary: 'Saved changes to disk',
      details: { linesAdded: 10 },
    });

    expect(event.auditId).toMatch(/^aud_/);
    expect(event.documentKey).toBe('docs/architecture.md');
    expect(event.action).toBe('SAVE');
    expect(event.outcome).toBe('SUCCESS');
    expect(event.details.linesAdded).toBe(10);
    expect(event.timestamp).toBeDefined();

    const stored = auditLog.getAllEvents();
    expect(stored.length).toBe(1);
    expect(stored[0].auditId).toBe(event.auditId);
  });

  it('filters events by documentKey, action, and outcome', () => {
    auditLog.recordEvent({ documentKey: 'docA.md', action: 'SAVE', outcome: 'SUCCESS', summary: 'Save A' });
    auditLog.recordEvent({ documentKey: 'docB.md', action: 'SAVE', outcome: 'SUCCESS', summary: 'Save B' });
    auditLog.recordEvent({ documentKey: 'docA.md', action: 'RESTORE', outcome: 'SUCCESS', summary: 'Restore A' });
    auditLog.recordEvent({ documentKey: 'docA.md', action: 'PUBLISH_ATTEMPT', outcome: 'FAILURE', summary: 'Pub fail' });

    const docAEvents = auditLog.getEvents({ documentKey: 'docA.md' });
    expect(docAEvents.length).toBe(3);

    const restoreEvents = auditLog.getEvents({ action: 'RESTORE' });
    expect(restoreEvents.length).toBe(1);
    expect(restoreEvents[0].summary).toBe('Restore A');

    const failures = auditLog.getEvents({ outcome: 'FAILURE' });
    expect(failures.length).toBe(1);
    expect(failures[0].action).toBe('PUBLISH_ATTEMPT');
  });

  it('caps events at maxEvents with FIFO eviction', () => {
    for (let i = 1; i <= 7; i++) {
      auditLog.recordEvent({
        documentKey: 'stream.md',
        action: 'SAVE',
        outcome: 'SUCCESS',
        summary: `Save ${i}`,
      });
    }

    const events = auditLog.getAllEvents();
    expect(events.length).toBe(5);
    expect(events[0].summary).toBe('Save 3');
    expect(events[4].summary).toBe('Save 7');
  });

  it('strictly redacts sensitive tokens across summary and nested payload objects (Invariant 8)', () => {
    const token = 'ghp_0123456789abcdefghijklmnopqrstuv';
    const pat = 'github_pat_11AAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const event = auditLog.recordEvent({
      documentKey: 'secret-doc.md',
      action: 'PUBLISH_ATTEMPT',
      outcome: 'FAILURE',
      summary: `Failed publication with authorization header Bearer ${token}`,
      details: {
        rawError: `Unauthorized token ${pat} for repository`,
        nested: {
          key: `Secret token: ${token}`,
        },
      },
    });

    expect(event.summary).not.toContain(token);
    expect(event.summary).toContain('[REDACTED]');
    expect(event.details.rawError).not.toContain(pat);
    expect(event.details.rawError).toContain('[REDACTED_PAT]');
    expect(event.details.nested.key).not.toContain(token);
    expect(event.details.nested.key).toContain('[REDACTED_TOKEN]');
  });
});
