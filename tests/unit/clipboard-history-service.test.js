import { describe, it, expect, beforeEach } from 'vitest';
import { ClipboardHistoryService } from '../../src/services/clipboard-history-service.js';

describe('ClipboardHistoryService (Module G)', () => {
  let service;

  beforeEach(() => {
    service = new ClipboardHistoryService();
    service.clear();
  });

  it('rejects recording when history is disabled (opt-in requirement)', () => {
    const success = service.addEntry({
      source: 'clipboard',
      format: 'html',
      snippet: 'Test snippet',
      markdown: '# Test Markdown',
    }, { enabled: false });

    expect(success).toBe(false);
    expect(service.getEntries().length).toBe(0);
  });

  it('records entry when explicitly enabled', () => {
    const success = service.addEntry({
      source: 'clipboard',
      format: 'html',
      snippet: 'Valid snippet',
      markdown: '# Valid Title\n\nContent paragraph.',
    }, { enabled: true, limit: 10 });

    expect(success).toBe(true);
    const entries = service.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].markdown).toContain('Valid Title');
  });

  it('strictly filters and rejects persistence of sensitive tokens and keys', () => {
    const sensitiveMarkdown = 'Here is my GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwxyz and secret.';
    const success = service.addEntry({
      source: 'clipboard',
      format: 'text',
      snippet: sensitiveMarkdown,
      markdown: sensitiveMarkdown,
    }, { enabled: true });

    expect(success).toBe(false);
    expect(service.getEntries().length).toBe(0);
  });

  it('enforces retention limit on history records', () => {
    for (let i = 1; i <= 5; i++) {
      service.addEntry({
        source: 'clipboard',
        format: 'text',
        snippet: `Item ${i}`,
        markdown: `Item ${i}`,
      }, { enabled: true, limit: 3 });
    }

    const entries = service.getEntries();
    expect(entries.length).toBe(3);
    expect(entries[0].markdown).toBe('Item 5');
    expect(entries[2].markdown).toBe('Item 3');
  });

  it('searches and deletes individual history records', () => {
    service.addEntry({ source: 'clipboard', format: 'markdown', snippet: 'Alpha doc', markdown: 'Alpha' }, { enabled: true });
    service.addEntry({ source: 'clipboard', format: 'html', snippet: 'Beta doc', markdown: 'Beta' }, { enabled: true });

    expect(service.search('Alpha').length).toBe(1);
    expect(service.search('Beta').length).toBe(1);
    expect(service.search('NonExistent').length).toBe(0);

    const firstId = service.getEntries()[0].id;
    service.deleteEntry(firstId);
    expect(service.getEntries().length).toBe(1);

    service.clear();
    expect(service.getEntries().length).toBe(0);
  });
});
