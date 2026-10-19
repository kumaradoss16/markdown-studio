import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForceGraphEngine } from '../../src/features/graph/force-graph-engine.js';

describe('ForceGraphEngine', () => {
  let canvas;
  let engine;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    // Mock 2D context methods if needed in jsdom
    const ctx = canvas.getContext('2d') || {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      setLineDash: vi.fn(),
      fillText: vi.fn(),
    };
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);

    engine = new ForceGraphEngine(canvas);
  });

  it('initializes physics parameters and sets data', () => {
    const data = {
      nodes: [
        { id: 'Doc1.md', label: 'Doc 1', degree: 1, radius: 6, isGhost: false, isTag: false },
        { id: 'Doc2.md', label: 'Doc 2', degree: 1, radius: 6, isGhost: false, isTag: false },
      ],
      edges: [
        { id: 'Doc1.md->Doc2.md', source: 'Doc1.md', target: 'Doc2.md', isGhost: false }
      ]
    };

    engine.setData(data);

    expect(engine.nodes.length).toBe(2);
    expect(engine.edges.length).toBe(1);
    expect(engine.nodeMap.has('Doc1.md')).toBe(true);
    expect(engine.nodeMap.has('Doc2.md')).toBe(true);
    expect(engine.adjacency.get('Doc1.md').has('Doc2.md')).toBe(true);
  });

  it('runs physics simulation step and decays alpha until sleeping', () => {
    const data = {
      nodes: [
        { id: 'A', label: 'A', x: 300, y: 300, degree: 1, radius: 6, isGhost: false, isTag: false },
        { id: 'B', label: 'B', x: 500, y: 300, degree: 1, radius: 6, isGhost: false, isTag: false },
      ],
      edges: [
        { id: 'A->B', source: 'A', target: 'B', isGhost: false }
      ]
    };

    engine.setData(data);
    expect(engine.isSleeping).toBe(false);

    const initialAlpha = engine.alpha;
    engine.step();
    expect(engine.alpha).toBeLessThan(initialAlpha);

    // Force alpha below alphaMin to verify auto-sleep
    engine.alpha = 0.001;
    for (let i = 0; i < 50; i++) {
      engine.step();
    }
    expect(engine.isSleeping).toBe(true);

    // Reheat wakes simulation
    engine.reheat(0.8);
    expect(engine.isSleeping).toBe(false);
    expect(engine.alpha).toBe(0.8);
  });

  it('filters nodes based on search query, ghost notes, and orphan notes', () => {
    const data = {
      nodes: [
        { id: 'A.md', label: 'Mars Colony', degree: 1, isGhost: false, isTag: false, tags: ['space'] },
        { id: 'ghost:Moon', label: 'Moon', degree: 1, isGhost: true, isTag: false, tags: [] },
        { id: 'Orphan.md', label: 'Orphan Note', degree: 0, isGhost: false, isTag: false, tags: [] },
        { id: 'tag:#space', label: '#space', degree: 1, isGhost: false, isTag: true, tags: [] },
      ],
      edges: [
        { id: 'A.md->ghost:Moon', source: 'A.md', target: 'ghost:Moon' },
        { id: 'A.md->tag:#space', source: 'A.md', target: 'tag:#space' },
      ]
    };

    engine.setData(data);

    // Default visible: all 4
    expect(engine.getVisibleNodes().length).toBe(4);

    // Toggle ghost notes off
    engine.showGhostNotes = false;
    expect(engine.getVisibleNodes().map(n => n.id)).not.toContain('ghost:Moon');

    // Toggle orphan notes off
    engine.showOrphanNotes = false;
    expect(engine.getVisibleNodes().map(n => n.id)).not.toContain('Orphan.md');

    // Toggle tags off
    engine.showTags = false;
    expect(engine.getVisibleNodes().map(n => n.id)).not.toContain('tag:#space');

    // Reset toggles & test search query
    engine.showGhostNotes = true;
    engine.showOrphanNotes = true;
    engine.showTags = true;
    engine.searchQuery = 'mars';

    const searchResults = engine.getVisibleNodes();
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].id).toBe('A.md');
  });

  it('performs screenToWorld and worldToScreen coordinate transformations', () => {
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
    });

    engine.transform = { x: 50, y: 30, k: 2 };

    // Canvas click at screen (250, 150) -> relative to canvas (150, 100) -> world: (150 - 50) / 2 = 50, (100 - 30) / 2 = 35
    const world = engine.screenToWorld(250, 150);
    expect(world.x).toBe(50);
    expect(world.y).toBe(35);

    const screen = engine.worldToScreen(50, 35);
    expect(screen.x).toBe(150);
    expect(screen.y).toBe(100);
  });

  it('fits view to encapsulate all visible nodes', () => {
    const data = {
      nodes: [
        { id: 'N1', label: 'N1', x: 100, y: 100, radius: 6 },
        { id: 'N2', label: 'N2', x: 500, y: 500, radius: 6 },
      ],
      edges: []
    };

    engine.setData(data);
    engine.fitView(50);

    expect(engine.transform.k).toBeGreaterThan(0);
    expect(typeof engine.transform.x).toBe('number');
    expect(typeof engine.transform.y).toBe('number');
  });
});
