import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetService,
  sniffImageFormat,
  slugifyDocName,
  isPrivateOrBlockedHost,
  MAX_IMAGE_BYTES
} from '../../src/services/asset-service.js';

describe('AssetService & Asset Validation (Slice 2)', () => {
  let mockFs;
  let service;

  beforeEach(() => {
    const store = new Map();
    mockFs = {
      fileExists: async (p) => store.has(p),
      writeBinaryFile: async (p, bytes) => { store.set(p, bytes); return true; },
      delete: async (p) => { store.delete(p); return true; },
      ensureDirectory: async () => true,
      store,
    };
    service = new AssetService(mockFs);
  });

  describe('Document slugification', () => {
    it('normalizes spaces, punctuation, and extensions into safe slugs', () => {
      expect(slugifyDocName('Project Architecture & Design 2026.md')).toBe('project-architecture-design-2026');
      expect(slugifyDocName('Spaces   Multiple---Dashes.md')).toBe('spaces-multiple-dashes');
      expect(slugifyDocName('...Special!@#$%^&*()Chars...md')).toBe('special-chars');
      expect(slugifyDocName('')).toBe('document');
      expect(slugifyDocName(null)).toBe('document');
    });
  });

  describe('Magic byte sniffing', () => {
    it('accurately identifies PNG by signature', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      expect(sniffImageFormat(pngBytes)).toEqual({ mime: 'image/png', ext: 'png' });
    });

    it('accurately identifies JPEG by signature', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(sniffImageFormat(jpegBytes)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    });

    it('accurately identifies GIF89a by signature', () => {
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
      expect(sniffImageFormat(gifBytes)).toEqual({ mime: 'image/gif', ext: 'gif' });
    });

    it('accurately identifies WebP by RIFF..WEBP signature', () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20
      ]);
      expect(sniffImageFormat(webpBytes)).toEqual({ mime: 'image/webp', ext: 'webp' });
    });

    it('accurately identifies SVG text header', () => {
      const svgText = '<?xml version="1.0"?><svg viewBox="0 0 10 10"></svg>';
      const svgBytes = new TextEncoder().encode(svgText);
      expect(sniffImageFormat(svgBytes)).toEqual({ mime: 'image/svg+xml', ext: 'svg' });
    });

    it('rejects unknown binary executables or corrupt headers', () => {
      const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ DOS header
      expect(sniffImageFormat(exeBytes)).toBeNull();
    });
  });

  describe('Asset filename generation & collision avoidance', () => {
    it('generates filename matching doc-date-hex pattern', async () => {
      const name = await service.generateAssetFilename('Meeting Notes.md', 'png', 'assets');
      expect(name).toMatch(/^meeting-notes-\d{8}-[a-f0-9]{8}\.png$/);
    });

    it('resolves collision if filename already exists in directory', async () => {
      // Simulate existing file
      mockFs.store.set('assets/test-20261026-11223344.png', new Uint8Array(10));
      const name = await service.generateAssetFilename('test.md', 'png', 'assets');
      expect(name).toBeDefined();
      expect(mockFs.store.has(`assets/${name}`)).toBe(false);
    });
  });

  describe('Payload and size validation', () => {
    it('rejects oversized images (>10 MB)', () => {
      const big = new Uint8Array(MAX_IMAGE_BYTES + 1024);
      big[0] = 0x89; big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47;
      big[4] = 0x0d; big[5] = 0x0a; big[6] = 0x1a; big[7] = 0x0a;

      const res = service.validateImageBytes(big);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/exceeds maximum allowed limit of 10 MB/);
    });
  });

  describe('Directory resolution', () => {
    it('resolves relative to document directory when doc has a path', () => {
      const res = service.resolveAssetDirectory({ path: 'work/notes/spec.md' });
      expect(res.dirPath).toBe('work/notes/assets');
      expect(res.isWorkspaceDefault).toBe(false);
    });

    it('resolves to root assets/ when document is unsaved or untitled', () => {
      const res = service.resolveAssetDirectory({ path: null });
      expect(res.dirPath).toBe('assets');
      expect(res.isWorkspaceDefault).toBe(true);
    });
  });

  describe('Atomic commit and rollback', () => {
    it('writes all staged assets successfully', async () => {
      const assets = [
        { path: 'assets/img1.png', bytes: new Uint8Array([1, 2, 3]) },
        { path: 'assets/img2.png', bytes: new Uint8Array([4, 5, 6]) },
      ];
      const commit = await service.commitStagedAssets(assets);
      expect(commit.success).toBe(true);
      expect(commit.writtenPaths.length).toBe(2);
      expect(mockFs.store.has('assets/img1.png')).toBe(true);
      expect(mockFs.store.has('assets/img2.png')).toBe(true);
    });

    it('rolls back previously written assets on subsequent write failure', async () => {
      mockFs.writeBinaryFile = async (p, bytes) => {
        if (p.includes('fail')) throw new Error('Disk full');
        mockFs.store.set(p, bytes);
        return true;
      };

      const assets = [
        { path: 'assets/good.png', bytes: new Uint8Array([1, 2]) },
        { path: 'assets/fail.png', bytes: new Uint8Array([3, 4]) },
      ];

      const commit = await service.commitStagedAssets(assets);
      expect(commit.success).toBe(false);
      expect(commit.error).toContain('Disk full');
      // good.png should have been rolled back
      expect(mockFs.store.has('assets/good.png')).toBe(false);
    });
  });
});
