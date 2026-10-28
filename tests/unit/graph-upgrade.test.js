import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ForceGraphEngine,
  FOLDER_PALETTE,
  getGroupColor,
  truncateLabel,
} from '../../src/features/graph/force-graph-engine.js';
import { graphModalComponent } from '../../src/components/graph/graph-modal.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';

describe('Graph View Upgrade (Slice 3)', () => {
  describe('Visual System & Formatting', () => {
    it('provides deterministic folder colors from the palette', () => {
      const colorA = getGroupColor('Architecture');
      const colorA2 = getGroupColor('Architecture');
      const colorB = getGroupColor('Engineering');

      expect(colorA).toBe(colorA2);
      expect(FOLDER_PALETTE).toContain(colorA);
      expect(FOLDER_PALETTE).toContain(colorB);
    });

    it('returns default accent color for root or unassigned groups', () => {
      expect(getGroupColor('')).toBe('#38bdf8');
      expect(getGroupColor('root')).toBe('#38bdf8');
      expect(getGroupColor('Document')).toBe('#38bdf8');
    });

    it('truncates labels exceeding character limit with ellipsis', () => {
      expect(truncateLabel('Short')).toBe('Short');
      expect(truncateLabel('A Very Long Note Title That Exceeds Limit', 18)).toBe('A Very Long Note …');
    });
  });

  describe('ForceGraphEngine Navigation & Filters', () => {
    let canvas;
    let engine;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', { value: 800 });
      Object.defineProperty(canvas, 'clientHeight', { value: 600 });
      engine = new ForceGraphEngine(canvas);
      engine.setData({
        nodes: [
          { id: 'a', label: 'Node A', degree: 2, group: 'Core' },
          { id: 'b', label: 'Node B', degree: 1, group: 'Core' },
          { id: 'c', label: 'Node C', degree: 1, group: 'Sub' },
          { id: 'd', label: 'Node D', degree: 0, group: 'Sub' },
        ],
        edges: [
          { id: 'a->b', source: 'a', target: 'b', type: 'wikilink' },
          { id: 'a->c', source: 'a', target: 'c', type: 'markdown' },
        ],
      });
    });

    afterEach(() => {
      engine.destroy();
    });

    it('supports zoomIn and zoomOut methods', () => {
      const initialK = engine.transform.k;
      engine.zoomIn();
      expect(engine.transform.k).toBeGreaterThan(initialK);
      engine.zoomOut();
      expect(engine.transform.k).toBeCloseTo(initialK, 1);
    });

    it('filters only neighbours of selection when toggle is active', () => {
      const nodeA = engine.nodeMap.get('a');
      engine.selectedNode = nodeA;
      engine.onlyNeighbours = true;

      const visible = engine.getVisibleNodes();
      const visibleIds = visible.map(n => n.id);

      expect(visibleIds).toContain('a');
      expect(visibleIds).toContain('b'); // neighbour of a
      expect(visibleIds).toContain('c'); // neighbour of a
      expect(visibleIds).not.toContain('d'); // orphan, not neighbour of a
    });

    it('handles keyboard navigation for zoom and pan', () => {
      const initialK = engine.transform.k;
      engine.onKeyDown({ key: '+', preventDefault: () => {} });
      expect(engine.transform.k).toBeGreaterThan(initialK);

      const initialX = engine.transform.x;
      engine.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
      expect(engine.transform.x).toBe(initialX + 40);
    });
  });

  describe('Modal Lifecycle & Leak-Free Cleanup', () => {
    it('survives 10 open and close cycles cleanly without throwing or retaining elements', async () => {
      documentStateManager.createDocument('Doc1.md', '# Note 1\nLink [[Note 2]]');

      for (let i = 0; i < 10; i++) {
        await graphModalComponent.show();
        expect(graphModalComponent.isOpen()).toBe(true);
        graphModalComponent.close();
        expect(graphModalComponent.isOpen()).toBe(false);
      }

      // No lingering modal backdrop in document
      expect(document.querySelector('.graph-modal-backdrop')).toBeNull();
    });
  });
});
