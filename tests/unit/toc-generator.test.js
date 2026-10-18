import { describe, it, expect } from 'vitest';
import { TocGenerator, TOC_START_MARKER, TOC_END_MARKER } from '../../src/services/toc-generator.js';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';

describe('TocGenerator', () => {
  const generator = new TocGenerator(markdownPipeline);

  describe('findTocRegion', () => {
    it('detects well-formed TOC markers', () => {
      const doc = `# Header\n\n${TOC_START_MARKER}\n- [Intro](#intro)\n${TOC_END_MARKER}\n\n## Content`;
      const region = generator.findTocRegion(doc);

      expect(region.hasStart).toBe(true);
      expect(region.hasEnd).toBe(true);
      expect(region.isWellFormed).toBe(true);
      expect(region.innerContent).toBe('- [Intro](#intro)');
    });

    it('identifies missing closing marker', () => {
      const doc = `# Header\n\n${TOC_START_MARKER}\n- [Intro](#intro)\n## Content`;
      const region = generator.findTocRegion(doc);

      expect(region.hasStart).toBe(true);
      expect(region.hasEnd).toBe(false);
      expect(region.isWellFormed).toBe(false);
      expect(region.error).toContain('Missing closing');
    });

    it('identifies missing opening marker', () => {
      const doc = `# Header\n- [Intro](#intro)\n${TOC_END_MARKER}\n## Content`;
      const region = generator.findTocRegion(doc);

      expect(region.hasStart).toBe(false);
      expect(region.hasEnd).toBe(true);
      expect(region.isWellFormed).toBe(false);
      expect(region.error).toContain('Missing opening');
    });

    it('identifies inverted markers', () => {
      const doc = `${TOC_END_MARKER}\ncontent\n${TOC_START_MARKER}`;
      const region = generator.findTocRegion(doc);

      expect(region.isWellFormed).toBe(false);
      expect(region.error).toContain('appears before opening marker');
    });
  });

  describe('buildTocMarkdown', () => {
    it('generates deterministic bullet list with proper anchors and indentation', () => {
      const headings = [
        { level: 1, text: 'Title', anchor: 'title' },
        { level: 2, text: 'Overview', anchor: 'overview' },
        { level: 3, text: 'Sub System', anchor: 'sub-system' },
        { level: 2, text: 'Deployment', anchor: 'deployment' },
        { level: 5, text: 'Deep Details', anchor: 'deep-details' }, // should be excluded by default maxLevel=4
      ];

      const toc = generator.buildTocMarkdown(headings, { minLevel: 2, maxLevel: 4 });

      expect(toc).toContain(TOC_START_MARKER);
      expect(toc).toContain(TOC_END_MARKER);
      expect(toc).toContain('- [Overview](#overview)');
      expect(toc).toContain('  - [Sub System](#sub-system)'); // 2-space indented
      expect(toc).toContain('- [Deployment](#deployment)');
      expect(toc).not.toContain('Deep Details');
      expect(toc).not.toContain('Title'); // level 1 excluded by minLevel=2
    });

    it('supports ordered lists and custom title', () => {
      const headings = [
        { level: 2, text: 'First Step', anchor: 'first-step' },
        { level: 2, text: 'Second Step', anchor: 'second-step' },
      ];

      const toc = generator.buildTocMarkdown(headings, {
        minLevel: 2,
        maxLevel: 3,
        includeTitle: true,
        ordered: true
      });

      expect(toc).toContain('## Table of Contents');
      expect(toc).toContain('1. [First Step](#first-step)');
      expect(toc).toContain('2. [Second Step](#second-step)');
    });
  });

  describe('createProposal & Invariant Preservation', () => {
    it('creates insertion proposal after H1 in fresh document', () => {
      const initialDoc = '# Service Manual\n\nIntroductory paragraph.\n\n## Getting Started\n\n## Troubleshooting';
      const proposal = generator.createProposal({ content: initialDoc, revision: 1 });

      expect(proposal.isUpdate).toBe(false);
      expect(proposal.documentRevision).toBe(1);
      expect(proposal.proposedContent).toContain(TOC_START_MARKER);
      expect(proposal.proposedContent).toContain('## Getting Started');
      expect(proposal.proposedContent).toContain('## Troubleshooting');
      // Starts with H1
      expect(proposal.proposedContent.startsWith('# Service Manual\n\n')).toBe(true);
    });

    it('creates in-place update proposal preserving outside text byte-for-byte', () => {
      const prefix = '# System Specs\n\nIntro before TOC.\n\n';
      const suffix = '\n\n## Section 1\nBody text.\n\n## Section 2\nMore body.';
      const existingToc = `${TOC_START_MARKER}\n- [Old Entry](#old)\n${TOC_END_MARKER}`;
      const docContent = `${prefix}${existingToc}${suffix}`;

      const proposal = generator.createProposal({ content: docContent, revision: 3 });

      expect(proposal.isUpdate).toBe(true);
      expect(proposal.proposedContent.startsWith(prefix)).toBe(true);
      expect(proposal.proposedContent.endsWith(suffix)).toBe(true);
      expect(proposal.proposedContent).toContain('- [Section 1](#section-1)');
      expect(proposal.proposedContent).toContain('- [Section 2](#section-2)');
      expect(proposal.proposedContent).not.toContain('Old Entry');
    });

    it('rejects proposal application when document revision is stale (Invariant 5)', () => {
      const docContent = '# Header\n\n## A\n';
      const proposal = generator.createProposal({ content: docContent, revision: 2 });

      // Document was edited meanwhile: revision bumped to 3
      const mutatedDoc = { content: docContent + '\n## B', revision: 3 };

      expect(() => {
        generator.applyProposal(mutatedDoc, proposal);
      }).toThrow(/Stale revision conflict/);
    });

    it('applies proposal cleanly when revision matches', () => {
      const doc = { content: '# Guide\n\n## Intro\n', revision: 4 };
      const proposal = generator.createProposal(doc);

      const result = generator.applyProposal(doc, proposal);
      expect(result.newRevision).toBe(5);
      expect(result.updatedContent).toContain(TOC_START_MARKER);
      expect(result.updatedContent).toContain('- [Intro](#intro)');
    });
  });
});
