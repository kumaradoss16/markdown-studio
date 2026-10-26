import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clipboardImportService,
  isMarkdownLooking
} from '../../src/services/clipboard-import-service.js';

describe('ClipboardImportService (Slice 2)', () => {
  describe('isMarkdownLooking', () => {
    it('detects ATX headings', () => {
      expect(isMarkdownLooking('# Heading 1')).toBe(true);
      expect(isMarkdownLooking('### Sub heading')).toBe(true);
    });

    it('detects fenced code blocks', () => {
      expect(isMarkdownLooking('```js\nconst a = 1;\n```')).toBe(true);
    });

    it('detects markdown tables', () => {
      expect(isMarkdownLooking('| A | B |\n|---|---|\n| 1 | 2 |')).toBe(true);
    });

    it('detects wikilinks and standard markdown links', () => {
      expect(isMarkdownLooking('Check [[Architecture]]')).toBe(true);
      expect(isMarkdownLooking('Visit [Google](https://google.com)')).toBe(true);
    });

    it('returns false for ordinary plain text without markdown syntax', () => {
      expect(isMarkdownLooking('Just a simple sentence without formatting.')).toBe(false);
      expect(isMarkdownLooking('12345 67890')).toBe(false);
    });
  });

  describe('determineContentType precedence', () => {
    it('selects markdown when text looks like markdown and html is absent', () => {
      const type = clipboardImportService.determineContentType({
        text: '# Project Title\n\nSome notes',
        html: null,
        images: [],
      });
      expect(type).toBe('markdown');
    });

    it('selects html when rich HTML markup is present', () => {
      const type = clipboardImportService.determineContentType({
        text: 'Title\nSome notes',
        html: '<h1>Title</h1><p>Some notes</p>',
        images: [],
      });
      expect(type).toBe('html');
    });

    it('selects text when text has no markdown syntax and no html', () => {
      const type = clipboardImportService.determineContentType({
        text: 'Ordinary plain text paragraph.',
        html: null,
        images: [],
      });
      expect(type).toBe('text');
    });

    it('selects image when images are provided with no text or html', () => {
      const type = clipboardImportService.determineContentType({
        text: null,
        html: null,
        images: [{ blob: new Blob(['']), mime: 'image/png' }],
      });
      expect(type).toBe('image');
    });

    it('returns empty when no content is present', () => {
      const type = clipboardImportService.determineContentType({
        text: '',
        html: '',
        images: [],
      });
      expect(type).toBe('empty');
    });
  });

  describe('inspectFromDataTransfer', () => {
    it('parses text and html from DataTransfer', () => {
      const dt = {
        types: ['text/plain', 'text/html'],
        getData: (t) => t === 'text/plain' ? 'Hello' : '<b>Hello</b>',
        items: [],
      };
      const res = clipboardImportService.inspectFromDataTransfer(dt);
      expect(res.formats).toContain('text/plain');
      expect(res.formats).toContain('text/html');
      expect(res.text).toBe('Hello');
      expect(res.html).toBe('<b>Hello</b>');
    });

    it('extracts image files from DataTransfer items', () => {
      const mockFile = new File(['fake-bytes'], 'screen.png', { type: 'image/png' });
      const dt = {
        types: ['Files'],
        getData: () => '',
        items: [
          { kind: 'file', type: 'image/png', getAsFile: () => mockFile }
        ],
      };
      const res = clipboardImportService.inspectFromDataTransfer(dt);
      expect(res.images.length).toBe(1);
      expect(res.images[0].mime).toBe('image/png');
    });
  });
});
