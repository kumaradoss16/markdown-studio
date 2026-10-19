import { describe, it, expect, beforeEach, vi } from 'vitest';
import { markdownPipeline } from '../../src/services/markdown-pipeline.js';
import { GraphIndexService } from '../../src/services/graph-index-service.js';
import { ForceGraphEngine } from '../../src/features/graph/force-graph-engine.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';

describe('Release 1.0 Stress & Performance Benchmarks', () => {
  beforeEach(() => {
    fileSystemService.virtualStorage.clear();
  });

  describe('Large Markdown Document Benchmark', () => {
    it('processes a 10,000-line / 600KB+ plain-text document within performance budget', () => {
      // Generate a 10,000-line realistic technical documentation markdown
      const lines = [
        '# Technical Specification: Deep Space Communications Protocol',
        '',
        '> Confidential Aerospace Telemetry Guidelines',
        '',
      ];

      for (let i = 1; i <= 2500; i++) {
        lines.push(`## Section ${i}: Subsystem Telemetry Node ${i}`);
        lines.push(`Telemetry node parameters for subsystem ${i} include **orbital drift** and *delta-V* tracking.`);
        lines.push(`- Packet buffer: ${i * 128} bytes`);
        lines.push(`- Reference link: [Subsystem Specs](./specs/node-${i}.md) or [[Node ${i % 100}]]`);
        lines.push('');
      }

      const largeContent = lines.join('\n');
      expect(lines.length).toBeGreaterThan(10000);
      expect(largeContent.length).toBeGreaterThan(500000); // 500KB+

      const doc = {
        id: 'DeepSpaceProtocol.md',
        path: 'DeepSpaceProtocol.md',
        name: 'DeepSpaceProtocol.md',
        content: largeContent,
        revision: 1
      };

      const startTime = performance.now();
      const result = markdownPipeline.process(doc, { withHeadingIds: true });
      const duration = performance.now() - startTime;

      expect(result).toBeDefined();
      expect(typeof result.html).toBe('string');
      expect(result.headings.length).toBe(2501);
      expect(result.html.length).toBeGreaterThan(500000);

      // Must complete within budget in jsdom virtual test runner (generous threshold for heavy CI/JSDOM overhead on 2-core runners)
      const maxBudget = process.env.CI ? 35000 : 15000;
      expect(duration).toBeLessThan(maxBudget);

      // Second identical processing uses cached AST, completing in under 20ms
      const cacheStartTime = performance.now();
      const cachedResult = markdownPipeline.process(doc, { withHeadingIds: true });
      const cacheDuration = performance.now() - cacheStartTime;

      expect(cachedResult.html).toBe(result.html);
      expect(cacheDuration).toBeLessThan(25);
    }, 40000);
  });

  describe('Graph Scalability & Idle Cooling Benchmark', () => {
    it('indexes a 250-node workspace with 500 links rapidly within budget', async () => {
      const graphService = new GraphIndexService();

      // Seed 250 documents with cross-references
      for (let i = 1; i <= 250; i++) {
        const nextId = (i % 250) + 1;
        const jumpId = ((i * 7) % 250) + 1;
        const content = `# Note ${i}\nCross-reference to [[Note ${nextId}]] and [[Note ${jumpId}]]. Also #telemetry.`;
        fileSystemService.virtualStorage.set(`Note ${i}.md`, content);
      }

      const startTime = performance.now();
      const graphData = await graphService.buildGraph({ includeTags: true });
      const duration = performance.now() - startTime;

      expect(graphData.nodes.length).toBeGreaterThanOrEqual(250);
      expect(graphData.edges.length).toBeGreaterThanOrEqual(250);
      expect(duration).toBeLessThan(350);
    });

    it('force graph simulation decays to sleep within budget to preserve 0% idle CPU', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;

      const engine = new ForceGraphEngine(canvas);

      const nodes = [];
      const edges = [];
      for (let i = 1; i <= 50; i++) {
        nodes.push({ id: `N${i}`, label: `N${i}`, degree: 2, radius: 6, x: 600 + Math.random() * 50, y: 400 + Math.random() * 50 });
        edges.push({ id: `N${i}->N${(i % 50) + 1}`, source: `N${i}`, target: `N${(i % 50) + 1}` });
      }

      engine.setData({ nodes, edges });
      expect(engine.isSleeping).toBe(false);

      // Simulate physics loop steps
      let stepCount = 0;
      while (!engine.isSleeping && stepCount < 500) {
        engine.step();
        stepCount++;
      }

      // Must settle and sleep cleanly before 500 iterations
      expect(engine.isSleeping).toBe(true);
      expect(engine.alpha).toBeLessThan(engine.alphaMin);
    });
  });
});
