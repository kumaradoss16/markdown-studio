import { describe, it, expect, beforeEach } from 'vitest';
import { GraphIndexService } from '../../src/services/graph-index-service.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';

describe('GraphIndexService', () => {
  let service;

  beforeEach(() => {
    service = new GraphIndexService();
    fileSystemService.virtualStorage.clear();
    documentStateManager.documents.clear();
    documentStateManager.activeDocumentId = null;
  });

  describe('Link & Tag Extraction', () => {
    it('extracts WikiLinks with aliases and headings', () => {
      const content = `
# Overview
See [[System Architecture]] and [[Habitat Design|Living Quarters]].
Also check out [[Orbital Mechanics#Calculations|Flight Trajectory]].
      `;
      const { links } = service.extractLinksAndTags(content, 'Overview.md');
      expect(links.length).toBe(3);
      expect(links[0]).toEqual({ target: 'System Architecture', label: 'System Architecture', type: 'wikilink' });
      expect(links[1]).toEqual({ target: 'Habitat Design', label: 'Living Quarters', type: 'wikilink' });
      expect(links[2]).toEqual({ target: 'Orbital Mechanics', label: 'Flight Trajectory', type: 'wikilink' });
    });

    it('ignores WikiLinks and Markdown links inside code blocks', () => {
      const content = `
Normal link: [[Target Note]]

\`\`\`markdown
Code block: [[Ignored Note]] and [Ignored Link](./ignored.md)
\`\`\`

Inline code: \`[[Also Ignored]]\`
      `;
      const { links } = service.extractLinksAndTags(content, 'Test.md');
      expect(links.length).toBe(1);
      expect(links[0].target).toBe('Target Note');
    });

    it('extracts relative Markdown links to local .md files', () => {
      const content = `
See the [Architecture Specs](./specs/arch.md) and [Guide](../guide.md).
Do not link external [Google](https://google.com) or anchor [Section](#intro).
      `;
      const { links } = service.extractLinksAndTags(content, 'docs/index.md');
      expect(links.length).toBe(2);
      expect(links[0].target).toBe('./specs/arch.md');
      expect(links[1].target).toBe('../guide.md');
    });

    it('extracts frontmatter tags and inline hashtags', () => {
      const content = `---
tags: [space, engineering, design]
---

# Notes on #propulsion and #aerospace.
Ignore #123456 hex colors or isolated # symbol.
      `;
      const { tags } = service.extractLinksAndTags(content, 'note.md');
      expect(tags).toContain('space');
      expect(tags).toContain('engineering');
      expect(tags).toContain('design');
      expect(tags).toContain('propulsion');
      expect(tags).toContain('aerospace');
    });
  });

  describe('Graph Construction & Invariants', () => {
    it('builds nodes, edges, degrees, and identifies ghost nodes for unresolved links', async () => {
      fileSystemService.virtualStorage.set('DocA.md', 'Link to [[DocB]] and [[UnresolvedNote]].');
      fileSystemService.virtualStorage.set('DocB.md', 'Backlink to [[DocA]]. Also #research');

      const data = await service.buildGraph({ includeTags: true });

      expect(data.nodes.length).toBe(4); // DocA, DocB, UnresolvedNote (ghost), #research (tag)
      expect(data.nodeMap.has('DocA.md')).toBe(true);
      expect(data.nodeMap.has('DocB.md')).toBe(true);
      expect(data.nodeMap.has('ghost:UnresolvedNote')).toBe(true);
      expect(data.nodeMap.has('tag:#research')).toBe(true);

      const ghostNode = data.nodeMap.get('ghost:UnresolvedNote');
      expect(ghostNode.isGhost).toBe(true);
      expect(ghostNode.inDegree).toBe(1);

      const docA = data.nodeMap.get('DocA.md');
      expect(docA.isGhost).toBe(false);
      expect(docA.outDegree).toBe(2); // DocB + UnresolvedNote
      expect(docA.inDegree).toBe(1); // DocB
      expect(docA.degree).toBe(3);
      expect(docA.radius).toBeGreaterThan(5);

      const tagNode = data.nodeMap.get('tag:#research');
      expect(tagNode.isTag).toBe(true);
      expect(tagNode.inDegree).toBe(1);
    });

    it('extracts local neighborhood with 1-hop and 2-hop radius', async () => {
      fileSystemService.virtualStorage.set('A.md', '[[B]]');
      fileSystemService.virtualStorage.set('B.md', '[[C]]');
      fileSystemService.virtualStorage.set('C.md', '[[D]]');
      fileSystemService.virtualStorage.set('D.md', 'End');

      await service.buildGraph({ includeTags: false });

      // 1-hop around B.md should include A, B, C
      const hop1 = service.getLocalNeighborhood('B.md', 1);
      const hop1Ids = hop1.nodes.map(n => n.id);
      expect(hop1Ids).toContain('A.md');
      expect(hop1Ids).toContain('B.md');
      expect(hop1Ids).toContain('C.md');
      expect(hop1Ids).not.toContain('D.md');

      // 2-hops around B.md should include A, B, C, D
      const hop2 = service.getLocalNeighborhood('B.md', 2);
      const hop2Ids = hop2.nodes.map(n => n.id);
      expect(hop2Ids).toContain('D.md');
    });

    it('returns empty neighborhood for unknown or empty center node', () => {
      const neighborhood = service.getLocalNeighborhood('NonExistent.md', 1);
      expect(neighborhood.nodes).toEqual([]);
      expect(neighborhood.edges).toEqual([]);
    });
  });
});
