import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ClipboardCaptureService,
  isMarkdownLooking,
  MAX_HTML_BYTE_LIMIT,
  MAX_TOTAL_IMAGE_BYTES
} from '../../src/services/clipboard-capture-service.js';

describe('ClipboardCaptureService (Module A)', () => {
  let service;

  beforeEach(() => {
    service = new ClipboardCaptureService();
  });

  describe('isMarkdownLooking sniffer', () => {
    it('detects headings, code fences, lists, tables, and blockquotes', () => {
      expect(isMarkdownLooking('# Heading 1')).toBe(true);
      expect(isMarkdownLooking('```js\nconst a = 1;\n```')).toBe(true);
      expect(isMarkdownLooking('- Item 1\n- Item 2')).toBe(true);
      expect(isMarkdownLooking('1. Step 1\n2. Step 2')).toBe(true);
      expect(isMarkdownLooking('| A | B |\n|---|---|')).toBe(true);
      expect(isMarkdownLooking('> Quoted thought')).toBe(true);
      expect(isMarkdownLooking('[[Note Title]]')).toBe(true);
      expect(isMarkdownLooking('[Link](https://example.com)')).toBe(true);
    });

    it('returns false for ordinary unstructured prose', () => {
      expect(isMarkdownLooking('Just a simple paragraph of plain text.')).toBe(false);
      expect(isMarkdownLooking('')).toBe(false);
      expect(isMarkdownLooking(null)).toBe(false);
    });
  });

  describe('Precedence resolution', () => {
    it('prefers explicit text/markdown when available and valid', () => {
      const type = service.determineContentType({
        markdown: '# Architecture Plan\n\n- Item 1\n- Item 2',
        text: 'Architecture Plan\n\nItem 1\nItem 2',
        html: '<p>Architecture Plan</p>',
        images: [],
      });
      expect(type).toBe('markdown');
    });

    it('prefers text/html when HTML contains rich structural/visual elements', () => {
      const type = service.determineContentType({
        markdown: null,
        text: 'Some fallback text',
        html: '<div style="display: flex;"><h3>Card 1</h3><h3>Card 2</h3></div>',
        images: [],
      });
      expect(type).toBe('html');
    });

    it('prefers plain-text markdown when text has markdown syntax and HTML is a flat wrapper', () => {
      const text = '# Real Title\n\n- Bullet A\n- Bullet B';
      const type = service.determineContentType({
        markdown: null,
        text,
        html: `<p>${text}</p>`,
        images: [],
      });
      expect(type).toBe('markdown');
    });

    it('resolves text/plain fallback when no rich HTML or markdown is found', () => {
      const type = service.determineContentType({
        markdown: null,
        text: 'Just plain unformatted text content without any markers.',
        html: null,
        images: [],
      });
      expect(type).toBe('text');
    });

    it('resolves image when only image blobs are present', () => {
      const type = service.determineContentType({
        markdown: null,
        text: null,
        html: null,
        images: [{ blob: new Blob([], { type: 'image/png' }), mime: 'image/png' }],
      });
      expect(type).toBe('image');
    });

    it('resolves empty when payload contains nothing', () => {
      expect(service.determineContentType(null)).toBe('empty');
      expect(service.determineContentType({ text: '', html: '', images: [] })).toBe('empty');
    });
  });

  describe('DataTransfer Extraction & Unicode Preservation', () => {
    it('captures text, HTML, and preserves multi-byte Unicode characters accurately', () => {
      const unicodeString = 'Multi-byte Test: → (arrow), — (em-dash), ∑ (sum), 🚀 (rocket), 日本語 (Japanese).';
      const mockDataTransfer = {
        types: ['text/plain', 'text/html'],
        getData: (type) => {
          if (type === 'text/plain') return unicodeString;
          if (type === 'text/html') return `<p>${unicodeString}</p>`;
          return '';
        },
        items: [],
      };

      const result = service.captureFromDataTransfer(mockDataTransfer);
      expect(result.formats).toEqual(['text/plain', 'text/html']);
      expect(result.text).toBe(unicodeString);
      expect(result.html).toContain(unicodeString);
      expect(result.text).toContain('→');
      expect(result.text).toContain('—');
      expect(result.text).toContain('∑');
      expect(result.text).toContain('🚀');
      expect(result.text).toContain('日本語');
    });

    it('extracts image files from DataTransfer items', () => {
      const fakeBlob = new Blob(['PNG_DATA'], { type: 'image/png' });
      const mockDataTransfer = {
        types: ['Files'],
        getData: () => '',
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => fakeBlob,
          },
        ],
      };

      const result = service.captureFromDataTransfer(mockDataTransfer);
      expect(result.images.length).toBe(1);
      expect(result.images[0].mime).toBe('image/png');
    });
  });

  describe('Payload size guards & Loop Prevention', () => {
    it('warns when HTML payload exceeds 5 MB limit', () => {
      const largeHtml = '<p>' + 'X'.repeat(MAX_HTML_BYTE_LIMIT + 100) + '</p>';
      const mockDataTransfer = {
        types: ['text/html'],
        getData: () => largeHtml,
        items: [],
      };

      const result = service.captureFromDataTransfer(mockDataTransfer);
      expect(result.warnings.some(w => w.includes('exceeds 5 MB'))).toBe(true);
    });

    it('prevents concurrent clipboard capture loop', async () => {
      service.isCapturing = true;
      const res = await service.capture();
      expect(res.unavailableReason).toBe('Concurrent capture prevented.');
      expect(res.warnings[0]).toContain('already in progress');
    });
  });
});
