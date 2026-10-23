import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileSystemAdapter } from '../../src/services/filesystem-adapter.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { eventBus, AppEvents } from '../../src/app/events.js';

describe('FileSystemAdapter Error Boundaries & Virtual Mode Fallback', () => {
  let adapter;
  let notificationSpy;

  beforeEach(() => {
    // Clear virtual storage
    fileSystemService.virtualStorage.clear();
    // Populate test fixtures
    fileSystemService.virtualStorage.set('ExampleVault/test.md', '# Test');
    fileSystemService.virtualStorage.set('ExampleVault/folder/nested.md', '# Nested');

    // Create fresh adapter for each test
    adapter = new FileSystemAdapter();

    // Spy on event bus notifications
    notificationSpy = vi.spyOn(eventBus, 'emit');

    // Mock document for attribute setting
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-virtual-mode');
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isVirtualMode() detection', () => {
    it('returns false when virtualModeReason is null (native mode)', () => {
      adapter.virtualModeReason = null;
      expect(adapter.isVirtualMode()).toBe(false);
    });

    it('returns true when virtualModeReason is set (degraded mode)', () => {
      adapter.virtualModeReason = 'Tauri readDir failed: Permission denied';
      expect(adapter.isVirtualMode()).toBe(true);
    });
  });

  describe('readTree() error boundary', () => {
    it('falls back to virtual storage on Tauri readDir failure', async () => {
      // Force non-tauri runtime to test virtual fallback
      adapter.runtime = 'tauri';

      // Mock Tauri import to throw
      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }), { virtual: true });

      const tree = await adapter.readTree('ExampleVault');

      expect(tree).toBeDefined();
      expect(tree.name).toBe('ExampleVault');
      expect(tree.type).toBe('directory');
      // Should still have children from virtual storage
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it('sets virtualModeReason when Tauri fails', async () => {
      adapter.runtime = 'tauri';

      // Mock Tauri to fail
      const mockReadDir = vi.fn().mockRejectedValue(new Error('EACCES: Permission denied'));
      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: mockReadDir,
      }), { virtual: true });

      await adapter.readTree('ExampleVault');

      expect(adapter.virtualModeReason).toBeTruthy();
      expect(adapter.virtualModeReason).toContain('Tauri readDir failed');
      expect(adapter.virtualModeReason).toContain('EACCES');
    });

    it('emits notification event when falling back to virtual mode', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Plugin not loaded')),
      }), { virtual: true });

      await adapter.readTree('ExampleVault');

      expect(notificationSpy).toHaveBeenCalledWith(
        AppEvents.NOTIFICATION,
        expect.objectContaining({
          type: 'warning',
          message: expect.stringContaining('File system unavailable'),
        })
      );
    });

    it('sets data-virtual-mode attribute on document.documentElement', async () => {
      if (typeof document === 'undefined') return;

      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Not available')),
      }), { virtual: true });

      await adapter.readTree('ExampleVault');

      expect(document.documentElement.getAttribute('data-virtual-mode')).toBe('true');
    });
  });

  describe('readFile() error boundary', () => {
    it('falls back to virtual storage when Tauri readTextFile fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readTextFile: vi.fn().mockRejectedValue(new Error('File not found')),
      }), { virtual: true });

      const result = await adapter.readFile('ExampleVault/test.md');

      expect(result).toBeDefined();
      expect(result.path).toBe('ExampleVault/test.md');
      expect(result.content).toBe('# Test');
    });

    it('sets virtualModeReason when readTextFile fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readTextFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }), { virtual: true });

      await adapter.readFile('ExampleVault/test.md');

      expect(adapter.virtualModeReason).toContain('Tauri readTextFile failed');
    });

    it('logs error to console when Tauri fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readTextFile: vi.fn().mockRejectedValue(new Error('Test error')),
      }), { virtual: true });

      await adapter.readFile('ExampleVault/test.md');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FileSystemAdapter]'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('writeFile() error boundary', () => {
    it('falls back to virtual storage when Tauri writeTextFile fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        writeTextFile: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }), { virtual: true });

      await adapter.writeFile('ExampleVault/new.md', '# New content');

      // Verify file was written to virtual storage
      const result = await fileSystemService.readFile('ExampleVault/new.md');
      expect(result.content).toBe('# New content');
    });

    it('sets virtualModeReason when writeTextFile fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        writeTextFile: vi.fn().mockRejectedValue(new Error('EACCES')),
      }), { virtual: true });

      await adapter.writeFile('ExampleVault/write-test.md', 'content');

      expect(adapter.virtualModeReason).toContain('Tauri writeTextFile failed');
      expect(adapter.virtualModeReason).toContain('EACCES');
    });

    it('emits notification when writeFile falls back', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        writeTextFile: vi.fn().mockRejectedValue(new Error('Plugin error')),
      }), { virtual: true });

      await adapter.writeFile('ExampleVault/fallback.md', 'content');

      expect(notificationSpy).toHaveBeenCalledWith(
        AppEvents.NOTIFICATION,
        expect.objectContaining({ type: 'warning' })
      );
    });
  });

  describe('createDirectory() error boundary', () => {
    it('falls back to virtual storage when Tauri mkdir fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        mkdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }), { virtual: true });

      const result = await adapter.createDirectory('ExampleVault', 'new-folder');

      expect(result).toBeDefined();
      expect(result.name).toBe('new-folder');
      expect(result.type).toBe('directory');
      // Verify virtual storage was updated with .keep placeholder
      expect(fileSystemService.virtualStorage.has('ExampleVault/new-folder/.keep')).toBe(true);
    });

    it('sets virtualModeReason when mkdir fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        mkdir: vi.fn().mockRejectedValue(new Error('EACCES')),
      }), { virtual: true });

      await adapter.createDirectory('ExampleVault', 'folder-test');

      expect(adapter.virtualModeReason).toContain('Tauri mkdir failed');
    });
  });

  describe('rename() error boundary', () => {
    it('falls back to virtual storage when Tauri rename fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        rename: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }), { virtual: true });

      const result = await adapter.rename('ExampleVault/test.md', 'renamed.md');

      expect(result.newPath).toBe('ExampleVault/renamed.md');
      // Verify virtual storage was updated
      expect(fileSystemService.virtualStorage.has('ExampleVault/renamed.md')).toBe(true);
      expect(fileSystemService.virtualStorage.has('ExampleVault/test.md')).toBe(false);
    });

    it('sets virtualModeReason when rename fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        rename: vi.fn().mockRejectedValue(new Error('EACCES')),
      }), { virtual: true });

      await adapter.rename('ExampleVault/test.md', 'renamed.md');

      expect(adapter.virtualModeReason).toContain('Tauri rename failed');
    });
  });

  describe('delete() error boundary', () => {
    it('falls back to virtual storage when Tauri remove fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        remove: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }), { virtual: true });

      const result = await adapter.delete('ExampleVault/test.md');

      expect(result).toBe(true);
      // Verify virtual storage was cleared
      expect(fileSystemService.virtualStorage.has('ExampleVault/test.md')).toBe(false);
    });

    it('sets virtualModeReason when remove fails', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        remove: vi.fn().mockRejectedValue(new Error('EACCES')),
      }), { virtual: true });

      await adapter.delete('ExampleVault/test.md');

      expect(adapter.virtualModeReason).toContain('Tauri remove failed');
    });

    it('deletes directory and all children from virtual storage', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        remove: vi.fn().mockRejectedValue(new Error('Error')),
      }), { virtual: true });

      await adapter.delete('ExampleVault/folder');

      expect(fileSystemService.virtualStorage.has('ExampleVault/folder/nested.md')).toBe(false);
      expect(fileSystemService.virtualStorage.has('ExampleVault/test.md')).toBe(true);
    });
  });

  describe('Integration: multiple failures cascade gracefully', () => {
    it('subsequent operations remain in virtual mode after first failure', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Error 1')),
        readTextFile: vi.fn().mockRejectedValue(new Error('Error 2')),
        writeTextFile: vi.fn().mockRejectedValue(new Error('Error 3')),
      }), { virtual: true });

      // First operation sets virtual mode
      await adapter.readTree('ExampleVault');
      expect(adapter.isVirtualMode()).toBe(true);
      const reason1 = adapter.virtualModeReason;

      // Second operation updates reason
      await adapter.readFile('ExampleVault/test.md');
      expect(adapter.isVirtualMode()).toBe(true);

      // Virtual mode remains active
      expect(adapter.virtualModeReason).toBeTruthy();
    });

    it('all file operations complete successfully in virtual mode', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Unavailable')),
        readTextFile: vi.fn().mockRejectedValue(new Error('Unavailable')),
        writeTextFile: vi.fn().mockRejectedValue(new Error('Unavailable')),
        mkdir: vi.fn().mockRejectedValue(new Error('Unavailable')),
        rename: vi.fn().mockRejectedValue(new Error('Unavailable')),
        remove: vi.fn().mockRejectedValue(new Error('Unavailable')),
      }), { virtual: true });

      // Trigger virtual mode
      await adapter.readTree('ExampleVault');

      // All operations should complete without throwing
      const tree = await adapter.readTree('ExampleVault');
      expect(tree).toBeDefined();

      await adapter.writeFile('ExampleVault/new.md', 'content');
      const file = await adapter.readFile('ExampleVault/new.md');
      expect(file.content).toBe('content');

      const dir = await adapter.createDirectory('ExampleVault', 'newdir');
      expect(dir.name).toBe('newdir');

      const renamed = await adapter.rename('ExampleVault/new.md', 'renamed.md');
      expect(renamed.newPath).toContain('renamed.md');

      await adapter.delete('ExampleVault/renamed.md');
      expect(fileSystemService.virtualStorage.has('ExampleVault/renamed.md')).toBe(false);
    });
  });

  describe('No unhandled promise rejections', () => {
    it('all async methods return resolved promises even on Tauri failure', async () => {
      adapter.runtime = 'tauri';

      vi.doMock('@tauri-apps/plugin-fs', () => ({
        readDir: vi.fn().mockRejectedValue(new Error('Error')),
        readTextFile: vi.fn().mockRejectedValue(new Error('Error')),
        writeTextFile: vi.fn().mockRejectedValue(new Error('Error')),
        mkdir: vi.fn().mockRejectedValue(new Error('Error')),
        rename: vi.fn().mockRejectedValue(new Error('Error')),
        remove: vi.fn().mockRejectedValue(new Error('Error')),
      }), { virtual: true });

      // None of these should throw or reject
      const results = await Promise.all([
        adapter.readTree('ExampleVault'),
        adapter.readFile('ExampleVault/test.md'),
        adapter.writeFile('ExampleVault/new.md', 'content'),
        adapter.createDirectory('ExampleVault', 'folder'),
        adapter.rename('ExampleVault/test.md', 'renamed.md'),
        adapter.delete('ExampleVault/test.md'),
      ]);

      expect(results.every(r => r !== undefined && r !== null)).toBe(true);
    });
  });
});
