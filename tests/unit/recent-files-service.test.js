import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecentFilesService } from '../../src/services/recent-files-service.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';

describe('RecentFilesService', () => {
  let service;

  beforeEach(() => {
    localStorage.clear();
    service = new RecentFilesService();
    service.clearRecents();
  });

  it('adds and retrieves recent files', () => {
    service.addRecent('docs/intro.md', 'intro.md');
    service.addRecent('docs/setup.md', 'setup.md');

    const recents = service.getRecents();
    expect(recents.length).toBe(2);
    expect(recents[0].path).toBe('docs/setup.md'); // Most recent first
    expect(recents[1].path).toBe('docs/intro.md');
  });

  it('deduplicates existing entries when re-opened', () => {
    service.addRecent('docs/intro.md', 'intro.md');
    service.addRecent('docs/setup.md', 'setup.md');
    service.addRecent('docs/intro.md', 'intro.md');

    const recents = service.getRecents();
    expect(recents.length).toBe(2);
    expect(recents[0].path).toBe('docs/intro.md');
  });

  it('caps list at 20 entries', () => {
    for (let i = 1; i <= 25; i++) {
      service.addRecent(`docs/file${i}.md`, `file${i}.md`);
    }

    const recents = service.getRecents();
    expect(recents.length).toBe(20);
    expect(recents[0].path).toBe('docs/file25.md');
  });

  it('removes a specific entry with removeRecent', () => {
    service.addRecent('docs/file1.md', 'file1.md');
    service.addRecent('docs/file2.md', 'file2.md');

    service.removeRecent('docs/file1.md');
    const recents = service.getRecents();
    expect(recents.length).toBe(1);
    expect(recents[0].path).toBe('docs/file2.md');
  });

  it('clears all recents with clearRecents', () => {
    service.addRecent('docs/file1.md', 'file1.md');
    service.addRecent('docs/file2.md', 'file2.md');

    service.clearRecents();
    expect(service.getRecents().length).toBe(0);
  });

  it('prunes missing files using verifyFileExists', async () => {
    service.addRecent('docs/exists.md', 'exists.md');
    service.addRecent('docs/deleted.md', 'deleted.md');

    vi.spyOn(service, 'verifyFileExists').mockImplementation(async (path) => {
      return path === 'docs/exists.md';
    });

    const pruned = await service.pruneMissing();
    expect(pruned).toBe(1);
    const recents = service.getRecents();
    expect(recents.length).toBe(1);
    expect(recents[0].path).toBe('docs/exists.md');
  });
});
