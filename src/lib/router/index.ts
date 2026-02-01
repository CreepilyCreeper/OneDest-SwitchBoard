/* TypeScript - src/lib/router/index.ts
   Core routing + router-logic-verification + survey reconciliation
   Exports:
   - types: Graph, NodeDef, EdgeDef, Segment, Exit, SurveyReport, SurveySample
   - dijkstra(graph, source, target)
   - validateRouterLayout(exits)
   - reconcileSurvey(graph, surveyReport, thresholdBlocks = 5)
*/

/**
 * Basic types
 */
export type Vec3 = [number, number, number];

export type Segment = {
  start_offset: number; // inclusive, blocks from edge start
  end_offset: number;   // exclusive
  type: 'coppered' | 'uncoppered';
  avg_speed?: number;
};

export type EdgeDef = {
  id?: string;
  from: string;
  to: string;
  distance: number; // total length in blocks
  routing_weight?: number; // for pathfinding; default = distance
  segments?: Segment[]; // ordered, non-overlapping, covering [0,distance]
  total_copper_coverage?: number; // 0..1
  geometry?: Vec3[]; // polyline world coords from start to end (required for survey snapping)
  external?: boolean;
};

export type NodeDef = {
  id: string;
  type?: 'station' | 'junction' | 'other';
  exits?: Exit[];
  external?: boolean;
  // extra metadata allowed
  [k: string]: any;
};

export type Graph = {
  nodes: NodeDef[];
  edges: EdgeDef[];
};

export type Exit = {
  direction: string;
  onedest_args: string[]; // e.g., ["occident", "icenia"]
};

export type RouterValidationResult =
  | { status: 'UNORDERED_SAFE' }
  | {
      status: 'CONFLICT_DETECTED';
      reason: string;
      conflict: { argA: string; argB: string; exitA: Exit; exitB: Exit };
    };

export type SurveySample = {
  coords: Vec3; // [x,y,z]
  speed: number; // m/s
  tick?: number;
};

export type SurveyReport = {
  samples: SurveySample[]; // chronological
  metadata?: Record<string, any>;
};

/**
 * Utility functions (geometry)
 */
function dist2D(a: Vec3, b: Vec3) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function pointToSegmentDistance2D(p: Vec3, a: Vec3, b: Vec3) {
  // returns {dist, t, proj} where t is 0..1 along segment a->b, proj is projected point
  const ax = a[0],
    az = a[2],
    bx = b[0],
    bz = b[2];
  const px = p[0],
    pz = p[2];
  const vx = bx - ax,
    vz = bz - az;
  const wx = px - ax,
    wz = pz - az;
  const vlen2 = vx * vx + vz * vz;
  if (vlen2 === 0) {
    return { dist: Math.hypot(px - ax, pz - az), t: 0, proj: [ax, a[1], az] as Vec3 };
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / vlen2));
  const projx = ax + t * vx;
  const projz = az + t * vz;
  const dist = Math.hypot(px - projx, pz - projz);
  return { dist, t, proj: [projx, a[1], projz] as Vec3 };
}

function polylineLength2D(poly: Vec3[]) {
  let s = 0;
  for (let i = 1; i < poly.length; i++) s += dist2D(poly[i - 1], poly[i]);
  return s;
}

function projectPointOntoPolyline(poly: Vec3[], p: Vec3) {
  // returns nearest {dist, segIndex, t, projPoint, offset} where offset is distance along polyline from start
  if (!poly || poly.length === 0) return null;
  let best = { dist: Number.POSITIVE_INFINITY, segIndex: 0, t: 0, proj: poly[0] as Vec3, offset: 0 };
  let offsetAcc = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1],
      b = poly[i];
    const segLen = dist2D(a, b);
    const { dist, t, proj } = pointToSegmentDistance2D(p, a, b);
    const offset = offsetAcc + t * segLen;
    if (dist < best.dist) {
      best = { dist, segIndex: i - 1, t, proj, offset };
    }
    offsetAcc += segLen;
  }
  return best;
}

/**
 * Dijkstra on directed graph
 * Graph edges are directed from edge.from -> edge.to
 */
export function dijkstra(graph: Graph, source: string, target: string) {
  const nodes = new Set(graph.nodes.map((n) => n.id));
  if (!nodes.has(source)) throw new Error(`Source node '${source}' not found`);
  if (!nodes.has(target)) throw new Error(`Target node '${target}' not found`);

  // build adjacency
  const adj = new Map<string, { to: string; weight: number; edgeId?: string }[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    const w = e.routing_weight ?? e.distance ?? 0;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push({ to: e.to, weight: w, edgeId: e.id });
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; edgeId?: string } | null>();
  const pq = new Set<string>();
  for (const n of nodes) {
    dist.set(n, n === source ? 0 : Number.POSITIVE_INFINITY);
    prev.set(n, null);
    pq.add(n);
  }

  while (pq.size) {
    // extract min
    let u: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const v of pq) {
      const dv = dist.get(v)!;
      if (dv < best) {
        best = dv;
        u = v;
      }
    }
    if (!u) break;
    pq.delete(u);
    if (u === target) break;

    const neighbors = adj.get(u) || [];
    for (const nbr of neighbors) {
      if (!pq.has(nbr.to)) continue;
      const alt = dist.get(u)! + nbr.weight;
      if (alt < dist.get(nbr.to)!) {
        dist.set(nbr.to, alt);
        prev.set(nbr.to, { from: u, edgeId: nbr.edgeId });
      }
    }
  }

  if (dist.get(target) === Number.POSITIVE_INFINITY) {
    return { path: null, distance: Infinity };
  }

  // reconstruct path
  const pathNodes: string[] = [];
  const pathEdges: (string | undefined)[] = [];
  let cur: string | null = target;
  while (cur) {
    pathNodes.push(cur);
    const p = prev.get(cur);
    if (!p) break;
    pathEdges.push(p.edgeId);
    cur = p.from;
  }
  pathNodes.reverse();
  pathEdges.reverse();
  return { path: { nodes: pathNodes, edges: pathEdges }, distance: dist.get(target)! };
}

/**
 * validateRouterLayout: checks prefix collisions between exits
 *
 * If any argA from exitA is a prefix of argB from a different exitB => conflict
 */
export function validateRouterLayout(exits: Exit[]): RouterValidationResult {
  for (let i = 0; i < exits.length; i++) {
    const exitA = exits[i];
    for (let j = 0; j < exits.length; j++) {
      if (i === j) continue;
      const exitB = exits[j];
      for (const argA of exitA.onedest_args) {
        for (const argB of exitB.onedest_args) {
          if (argB.startsWith(argA) && argA !== argB) {
            return {
              status: 'CONFLICT_DETECTED',
              reason: `Argument '${argA}' is a prefix of '${argB}' on a different exit. Ordered Physical Layout required.`,
              conflict: { argA, argB, exitA, exitB },
            };
          }
        }
      }
    }
  }
  return { status: 'UNORDERED_SAFE' };
}

/**
 * reconcileSurvey:
 * - For each sample in the report, find nearest edge (by geometry) within thresholdBlocks.
 * - Project sample to edge polyline, compute offset.
 * - Build new intervals (RLE) on that edge from projected offsets and sample states (speed > 11 => coppered).
 * - Merge new intervals into edge.segments, recalc total_copper_coverage.
 *
 * Returns { updatedEdges: EdgeDef[], diffs: { edgeId, oldSegments, newSegments }[] }
 */
export function reconcileSurvey(graph: Graph, survey: SurveyReport, thresholdBlocks = 5) {
  // index edges by id or synthesized id
  const edges = graph.edges.map((e, idx) => ({ ...e, id: e.id ?? `${e.from}_${e.to}_${idx}` }));
  const diffs: { edgeId: string; oldSegments: Segment[] | undefined; newSegments: Segment[] }[] = [];

  // For each sample, find candidate edge and projection
  type SampleProj = { edgeId: string; offset: number; state: 'coppered' | 'uncoppered'; speed: number };
  const projs: SampleProj[] = [];

  for (const s of survey.samples) {
    let best: { edge: typeof edges[0]; projRes: any } | null = null;
    for (const e of edges) {
      if (!e.geometry || e.geometry.length < 2) continue;
      const pr = projectPointOntoPolyline(e.geometry, s.coords);
      if (!pr) continue;
      if (pr.dist <= thresholdBlocks) {
        if (!best || pr.dist < best.projRes.dist) best = { edge: e, projRes: pr };
      }
    }
    if (best) {
      const state = s.speed > 11 ? 'coppered' : 'uncoppered';
      projs.push({ edgeId: best.edge.id!, offset: Math.max(0, Math.min(best.projRes.offset, (best.edge.distance || polylineLength2D(best.edge.geometry!)) )), state, speed: s.speed });
    }
  }

  // Group projections by edge
  const byEdge = new Map<string, SampleProj[]>();
  for (const p of projs) {
    if (!byEdge.has(p.edgeId)) byEdge.set(p.edgeId, []);
    byEdge.get(p.edgeId)!.push(p);
  }

  for (const [edgeId, samples] of byEdge.entries()) {
    const edge = edges.find((e) => e.id === edgeId)!;
    const oldSegments = edge.segments ? JSON.parse(JSON.stringify(edge.segments)) : undefined;

    // Build new intervals from samples (sort by offset)
    samples.sort((a, b) => a.offset - b.offset);
    // If only samples present but no coverage for whole edge, we will create segments only covering sample min..max; rest left as unknown/kept from oldSegments
    const newIntervals: Segment[] = [];
    if (samples.length > 0) {
      // Convert sample list to intervals: contiguous runs of same state
      let curState = samples[0].state;
      let curStart = samples[0].offset;
      let speedsAcc = [samples[0].speed];
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        if (s.state === curState) {
          speedsAcc.push(s.speed);
          continue;
        } else {
          // end current at previous offset (use midpoint to next sample)
          const prevOffset = samples[i - 1].offset;
          const end = (prevOffset + s.offset) / 2;
          newIntervals.push({ start_offset: curStart, end_offset: end, type: curState, avg_speed: average(speedsAcc) });
          // start new
          curState = s.state;
          curStart = end;
          speedsAcc = [s.speed];
        }
      }
      // finish last
      const lastOffset = samples[samples.length - 1].offset;
      newIntervals.push({ start_offset: curStart, end_offset: lastOffset, type: curState, avg_speed: average(speedsAcc) });
      // Ensure intervals are within [0, edge.distance]
      const distMax = edge.distance ?? polylineLength2D(edge.geometry!);
      for (const seg of newIntervals) {
        seg.start_offset = clamp(seg.start_offset, 0, distMax);
        seg.end_offset = clamp(seg.end_offset, 0, distMax);
        if (seg.end_offset <= seg.start_offset) seg.end_offset = Math.min(seg.start_offset + 1, distMax);
      }
    }

    // Merge newIntervals into existing segments
    const merged = mergeEdgeSegments(edge.distance ?? polylineLength2D(edge.geometry!), edge.segments ?? [], newIntervals);
    edge.segments = merged;
    edge.total_copper_coverage = computeTotalCopperCoverage(edge.distance ?? polylineLength2D(edge.geometry!), merged);

    diffs.push({ edgeId, oldSegments, newSegments: merged.map((s) => ({ ...s })) });
  }

  // Create updated graph edges array
  const updatedEdges = edges.map((e) => {
    const original = graph.edges.find((oe) => oe.id === e.id || (oe.from === e.from && oe.to === e.to));
    return { ...(original ?? {}), ...e };
  });

  return { updatedEdges, diffs };
}

/** Helpers */

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function average(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * mergeEdgeSegments(totalDistance, existing[], incoming[])
 *
 * Behavior:
 * - existing[] is assumed ordered, non-overlapping, might not fully cover [0,totalDistance].
 * - incoming[] contains new coverage intervals (may be partial). Incoming intervals override existing coverage in their ranges.
 * - After merge: produce ordered, non-overlapping segments that cover [0,totalDistance].
 *   - Regions with no information remain as existing segments if present, otherwise become 'uncoppered'.
 * - Coalesce adjacent segments of the same type.
 */
function mergeEdgeSegments(totalDistance: number, existing: Segment[], incoming: Segment[]): Segment[] {
  // Build a list of breakpoints from 0..totalDistance including all boundaries.
  const bounds = new Set<number>();
  bounds.add(0);
  bounds.add(totalDistance);
  for (const s of existing) {
    bounds.add(clamp(s.start_offset, 0, totalDistance));
    bounds.add(clamp(s.end_offset, 0, totalDistance));
  }
  for (const s of incoming) {
    bounds.add(clamp(s.start_offset, 0, totalDistance));
    bounds.add(clamp(s.end_offset, 0, totalDistance));
  }
  const sorted = Array.from(bounds).sort((a, b) => a - b);

  // For each interval between consecutive sorted points determine type:
  const result: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i],
      b = sorted[i + 1];
    if (b <= a) continue;
    // Check incoming first (override)
    const incomingSeg = incoming.find((s) => s.start_offset <= a + 1e-6 && s.end_offset >= b - 1e-6);
    if (incomingSeg) {
      pushSegment(result, { start_offset: a, end_offset: b, type: incomingSeg.type, avg_speed: incomingSeg.avg_speed });
      continue;
    }
    // else check existing segments that cover this range (take avg speed if present)
    const existingSeg = existing.find((s) => s.start_offset <= a + 1e-6 && s.end_offset >= b - 1e-6);
    if (existingSeg) {
      pushSegment(result, { start_offset: a, end_offset: b, type: existingSeg.type, avg_speed: existingSeg.avg_speed });
      continue;
    }
    // default unknown -> uncoppered
    pushSegment(result, { start_offset: a, end_offset: b, type: 'uncoppered', avg_speed: undefined });
  }

  // coalesce adjacent same-type
  const coalesced: Segment[] = [];
  for (const s of result) {
    if (!coalesced.length) coalesced.push({ ...s });
    else {
      const last = coalesced[coalesced.length - 1];
      if (last.type === s.type && approxEqual(last.end_offset, s.start_offset)) {
        // merge and average speeds when available
        const lenA = last.end_offset - last.start_offset;
        const lenB = s.end_offset - s.start_offset;
        const avgA = last.avg_speed ?? 0;
        const avgB = s.avg_speed ?? 0;
        const denom = lenA + lenB;
        const num = avgA * lenA + avgB * lenB;
        const newAvg = denom > 0 ? num / denom : undefined;
        last.end_offset = s.end_offset;
        last.avg_speed = (newAvg !== undefined && isFinite(newAvg)) ? newAvg : undefined;
      } else coalesced.push({ ...s });
    }
  }

  // Ensure coverage boundaries rounding
  if (coalesced.length && coalesced[0].start_offset > 0) coalesced[0].start_offset = 0;
  if (coalesced.length) coalesced[coalesced.length - 1].end_offset = totalDistance;

  return coalesced;
}

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function pushSegment(arr: Segment[], seg: Segment) {
  // avoid degenerate
  if (seg.end_offset <= seg.start_offset) return;
  arr.push({ ...seg });
}

function computeTotalCopperCoverage(totalDistance: number, segments: Segment[]) {
  if (!segments || segments.length === 0) return 0;
  let copper = 0;
  for (const s of segments) {
    if (s.type === 'coppered') copper += Math.max(0, Math.min(totalDistance, s.end_offset) - Math.max(0, s.start_offset));
  }
  return clamp(copper / Math.max(1, totalDistance), 0, 1);
}