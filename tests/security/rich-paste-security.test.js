import { describe, it, expect } from 'vitest';
import { htmlToMarkdownService } from '../../src/services/html-to-markdown-service.js';
import { svgSanitizer } from '../../src/services/svg-sanitizer.js';
import {
  isPrivateOrBlockedHost,
  MAX_TOTAL_BYTES,
  AssetService
} from '../../src/services/asset-service.js';

describe('Rich Paste Security Invariants (Slice 2)', () => {
  describe('SSRF Host Filtering', () => {
    it('blocks localhost in all variants', () => {
      expect(isPrivateOrBlockedHost('localhost')).toBe(true);
      expect(isPrivateOrBlockedHost('sub.localhost')).toBe(true);
      expect(isPrivateOrBlockedHost('localhost:8080')).toBe(true);
      expect(isPrivateOrBlockedHost('dev.local')).toBe(true);
      expect(isPrivateOrBlockedHost('corp.internal')).toBe(true);
    });

    it('blocks IPv4 loopback (127.0.0.0/8)', () => {
      expect(isPrivateOrBlockedHost('127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedHost('127.0.1.1')).toBe(true);
      expect(isPrivateOrBlockedHost('127.255.255.254')).toBe(true);
    });

    it('blocks RFC 1918 private IPv4 addresses', () => {
      expect(isPrivateOrBlockedHost('10.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedHost('10.254.1.10')).toBe(true);
      expect(isPrivateOrBlockedHost('172.16.0.1')).toBe(true);
      expect(isPrivateOrBlockedHost('172.31.255.255')).toBe(true);
      expect(isPrivateOrBlockedHost('192.168.1.1')).toBe(true);
      expect(isPrivateOrBlockedHost('192.168.0.254')).toBe(true);
    });

    it('blocks link-local (169.254.0.0/16)', () => {
      expect(isPrivateOrBlockedHost('169.254.169.254')).toBe(true);
    });

    it('blocks IPv6 loopback and private ranges', () => {
      expect(isPrivateOrBlockedHost('::1')).toBe(true);
      expect(isPrivateOrBlockedHost('[::1]')).toBe(true);
      expect(isPrivateOrBlockedHost('fc00::1')).toBe(true);
      expect(isPrivateOrBlockedHost('fe80::1')).toBe(true);
    });

    it('allows public domain names and public IP addresses', () => {
      expect(isPrivateOrBlockedHost('images.unsplash.com')).toBe(false);
      expect(isPrivateOrBlockedHost('github.com')).toBe(false);
      expect(isPrivateOrBlockedHost('8.8.8.8')).toBe(false);
      expect(isPrivateOrBlockedHost('1.1.1.1')).toBe(false);
    });
  });

  describe('URI Scheme Quarantine', () => {
    it('blocks javascript: links in HTML input', () => {
      const maliciousHtml = '<a href="javascript:alert(document.cookie)">Click me</a>';
      const res = htmlToMarkdownService.convert(maliciousHtml);
      expect(res.markdown).not.toContain('javascript:');
      expect(res.warnings.some(w => /javascript:|URI/i.test(w))).toBe(true);
    });

    it('blocks data:text/html executable links in HTML input', () => {
      const maliciousHtml = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Payload</a>';
      const res = htmlToMarkdownService.convert(maliciousHtml);
      expect(res.markdown).not.toContain('data:text/html');
    });

    it('blocks javascript: in SVG vectors', () => {
      const maliciousSvg = `<svg width="10" height="10"><a href="javascript:evil()"><circle r="5"/></a></svg>`;
      const res = svgSanitizer.sanitize(maliciousSvg);
      if (res.success) {
        expect(res.sanitized).not.toContain('javascript:');
      } else {
        expect(res.error).toBeDefined();
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    it('rejects path traversal attempts when generating asset paths', () => {
      const service = new AssetService({ fileExists: async () => false });
      const dirRes = service.resolveAssetDirectory({ path: '../../etc/passwd.md' });
      // DirPath should not allow escaping outside root
      expect(dirRes.dirPath).not.toBe('/etc');
    });
  });

  describe('Payload Limit Protections', () => {
    it('enforces 25 MB total asset size threshold constant', () => {
      expect(MAX_TOTAL_BYTES).toBe(25 * 1024 * 1024);
    });
  });
});
