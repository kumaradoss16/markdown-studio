import { describe, it, expect } from 'vitest';
import { MarkdownPipeline, generateAnchor, markdownPipeline } from '../../src/services/markdown-pipeline.js';

describe('MarkdownPipeline', () => {
  describe('generateAnchor', () => {
    it('converts basic text into lower-cased hyphenated slugs', () => {
      expect(generateAnchor('System Architecture')).toBe('system-architecture');
      expect(generateAnchor('API Reference & Endpoints!')).toBe('api-reference-endpoints');
    });

    it('strips markdown formatting characters from headings', () => {
      expect(generateAnchor('**Bold** and *Italic* Heading')).toBe('bold-and-italic-heading');
      expect(generateAnchor('`Code` in Header')).toBe('code-in-header');
      expect(generateAnchor('[[Wiki Link]] Header')).toBe('wiki-link-header');
    });

    it('generates deterministic suffixes for duplicate occurrences', () => {
      expect(generateAnchor('Configuration', 0)).toBe('configuration');
      expect(generateAnchor('Configuration', 1)).toBe('configuration-1');
      expect(generateAnchor('Configuration', 2)).toBe('configuration-2');
    });

    it('handles empty or whitespace-only headings safely', () => {
      expect(generateAnchor('')).toBe('section');
      expect(generateAnchor('   ')).toBe('section');
      expect(generateAnchor('', 2)).toBe('section-2');
    });
  });

  describe('AST & Metadata Extraction', () => {
    it('extracts structured headings with line numbers and anchors', () => {
      const markdown = '# Overview\n\nSome text\n\n## Architecture\n\n### Overview';
      const result = markdownPipeline.process({ content: markdown, revision: 1 });

      expect(result.headings).toHaveLength(3);
      expect(result.headings[0]).toEqual({
        level: 1,
        text: 'Overview',
        anchor: 'overview',
        occurrence: 0,
        line: 1,
        raw: '# Overview'
      });
      expect(result.headings[1].anchor).toBe('architecture');
      expect(result.headings[2]).toEqual({
        level: 3,
        text: 'Overview',
        anchor: 'overview-1', // second 'overview' slug
        occurrence: 1,
        line: 7,
        raw: '### Overview'
      });
    });

    it('identifies internal anchor links vs remote vs local file links', () => {
      const markdown = `
[Jump to Architecture](#architecture)
[External Docs](https://example.com/docs)
[Local Spec](./specs/spec.md)
[[Knowledge Graph]]
`;
      const result = markdownPipeline.process({ content: markdown, revision: 1 });

      expect(result.links).toHaveLength(4);
      const anchorLink = result.links.find(l => l.text === 'Jump to Architecture');
      expect(anchorLink.isAnchor).toBe(true);
      expect(anchorLink.targetAnchor).toBe('architecture');

      const extLink = result.links.find(l => l.text === 'External Docs');
      expect(extLink.isRemote).toBe(true);

      const localLink = result.links.find(l => l.text === 'Local Spec');
      expect(localLink.isLocal).toBe(true);

      const wikiLink = result.links.find(l => l.text === 'Knowledge Graph');
      expect(wikiLink.isWiki).toBe(true);
      expect(wikiLink.isLocal).toBe(true);
    });

    it('identifies local vs remote images and alt texts', () => {
      const markdown = `
![Hero Diagram](images/hero.png)
![Remote Banner](https://cdn.example.com/banner.png)
![Empty Alt]()
![[embedded-photo.png]]
`;
      const result = markdownPipeline.process({ content: markdown, revision: 1 });

      expect(result.images).toHaveLength(4);
      expect(result.images[0].alt).toBe('Hero Diagram');
      expect(result.images[0].isLocal).toBe(true);
      expect(result.images[1].isLocal).toBe(false);
      expect(result.images[2].alt).toBe('Empty Alt');
      expect(result.images[3].isWiki).toBe(true);
    });

    it('detects closed and unclosed fenced code blocks', () => {
      const closed = '```js\nconst x = 10;\n```\nNormal text';
      const closedRes = markdownPipeline.process({ content: closed, revision: 1 });
      expect(closedRes.codeBlocks).toHaveLength(1);
      expect(closedRes.codeBlocks[0].isClosed).toBe(true);
      expect(closedRes.codeBlocks[0].lang).toBe('js');

      const unclosed = '```typescript\nfunction broken() {\n';
      const unclosedRes = markdownPipeline.process({ content: unclosed, revision: 2 });
      expect(unclosedRes.codeBlocks).toHaveLength(1);
      expect(unclosedRes.codeBlocks[0].isClosed).toBe(false);
      expect(unclosedRes.codeBlocks[0].line).toBe(1);
    });

    it('renders HTML with matching anchor IDs on heading tags', () => {
      const md = '# Main Header\n\n## Sub Section';
      const res = markdownPipeline.process({ content: md, revision: 1 });

      expect(res.html).toContain('<h1 id="main-header">Main Header</h1>');
      expect(res.html).toContain('<h2 id="sub-section">Sub Section</h2>');
    });

    it('sanitizes malicious markup and XSS vectors', () => {
      const attack = '# Vulnerability Test\n<script>alert(1)</script><img src="x" onerror="steal()" />';
      const res = markdownPipeline.process({ content: attack, revision: 1 });

      expect(res.html).not.toContain('<script>');
      expect(res.html).not.toContain('onerror');
      expect(res.html).toContain('<h1 id="vulnerability-test">Vulnerability Test</h1>');
    });
  });

  describe('Revision & Caching', () => {
    it('returns cached pipeline results for matching docId and revision', () => {
      const pipeline = new MarkdownPipeline();
      const doc = { id: 'test-doc', revision: 5, content: '# Test' };

      const res1 = pipeline.process(doc);
      const res2 = pipeline.process(doc);

      expect(res1).toBe(res2); // Exactly same object reference from cache
    });

    it('re-evaluates when revision changes', () => {
      const pipeline = new MarkdownPipeline();
      const docV1 = { id: 'test-doc', revision: 1, content: '# Initial Title' };
      const docV2 = { id: 'test-doc', revision: 2, content: '# Updated Title' };

      const res1 = pipeline.process(docV1);
      const res2 = pipeline.process(docV2);

      expect(res1).not.toBe(res2);
      expect(res1.headings[0].text).toBe('Initial Title');
      expect(res2.headings[0].text).toBe('Updated Title');
    });
  });
});
