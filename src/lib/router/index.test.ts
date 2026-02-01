import { describe, it, expect } from 'vitest';
import { dijkstra, validateRouterLayout, reconcileSurvey, Graph, SurveyReport } from './index';

describe('dijkstra', () => {
  it('finds shortest path on a simple directed graph', () => {
    const graph: Graph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { id: 'e1', from: 'A', to: 'B', distance: 5 },
        { id: 'e2', from: 'B', to: 'C', distance: 3 },
        { id: 'e3', from: 'A', to: 'C', distance: 10 },
      ],
    };
    const res = dijkstra(graph, 'A', 'C');
    expect(res.distance).toBe(8);
    expect(res.path).toBeDefined();
    expect(res.path!.nodes).toEqual(['A', 'B', 'C']);
  });

  it('returns null path for unreachable target', () => {
    const graph: Graph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [{ id: 'e1', from: 'A', to: 'B', distance: 5 }],
    };
    const res = dijkstra(graph, 'A', 'C');
    expect(res.path).toBeNull();
    expect(res.distance).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('validateRouterLayout', () => {
  it('detects prefix conflict across different exits', () => {
    const exits = [
      { direction: 'north', onedest_args: ['icenia'] },
      { direction: 'east', onedest_args: ['icenia-city'] },
    ];
    const r = validateRouterLayout(exits as any);
    expect(r.status).toBe('CONFLICT_DETECTED');
    if (r.status === 'CONFLICT_DETECTED') {
      expect(r.conflict.argA).toBe('icenia');
      expect(r.conflict.argB).toBe('icenia-city');
    }
  });

  it('is safe when no prefixes overlap', () => {
    const exits = [
      { direction: 'north', onedest_args: ['icenia'] },
      { direction: 'east', onedest_args: ['barn'] },
    ];
    const r = validateRouterLayout(exits as any);
    expect(r.status).toBe('UNORDERED_SAFE');
  });
});

describe('reconcileSurvey', () => {
  it('snaps survey samples to edge and produces segments and coverage', () => {
    // single straight edge from x=0 to x=100
    const graph: Graph = {
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [
        {
          id: 'edge1',
          from: 'n1',
          to: 'n2',
          distance: 100,
          geometry: [
            [0, 64, 0],
            [100, 64, 0],
          ],
        },
      ],
    };

    const survey: SurveyReport = {
      samples: [
        { coords: [10, 64, 0], speed: 12 },
        { coords: [20, 64, 0], speed: 12 },
        { coords: [50, 64, 0], speed: 8 },
        { coords: [60, 64, 0], speed: 8 },
      ],
    };

    const { updatedEdges, diffs } = reconcileSurvey(graph, survey);
    const e = updatedEdges.find((x) => x.id === 'edge1')!;
    expect(e).toBeDefined();
    expect(Array.isArray(e.segments)).toBe(true);
    expect(e.segments!.length).toBeGreaterThan(0);
    // total_copper_coverage should be between 0 and 1
    expect(typeof e.total_copper_coverage).toBe('number');
    expect(e.total_copper_coverage! >= 0 && e.total_copper_coverage! <= 1).toBe(true);
    // diffs should report our edge
    expect(diffs.some((d) => d.edgeId === 'edge1')).toBe(true);
  });
});