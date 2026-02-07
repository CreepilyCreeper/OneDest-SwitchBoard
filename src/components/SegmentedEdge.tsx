"use client";

import React from "react";
import { Polyline, PolylineProps, Tooltip } from "react-leaflet";
import type { EdgeDef, Segment } from "../lib/router";

/**
 * SegmentedEdge
 * Renders an edge as multiple colored polylines according to its segments.
 *
 * - Assumes edge.geometry is an array of Vec3 [x,y,z] in world coords.
 * - Converts geometry to [lat, lng] pairs as [-z, x] (mapping for North=UP in CivMC).
 * - Splits the geometry proportionally according to segment offsets and draws each segment with color.
 *
 * Colors:
 * - coppered => green
 * - uncoppered => red
 */

type ViewMode = 'group' | 'copper' | 'default';
type Props = { edge: EdgeDef; viewMode?: ViewMode };

function coordsToLatLngs(poly: [number, number, number][]) {
  return poly.map((p) => [-p[2], p[0]] as [number, number]);
}

// Offset a polyline by a constant perpendicular offset (in map units == blocks)
function offsetPolyline(latlngs: [number, number][], offset: number) {
  if (offset === 0) return latlngs;
  const n = latlngs.length;
  if (n < 2) return latlngs;

  // Compute per-segment normals
  const segNormals: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular (normalize) => (-dy/len, dx/len)
    segNormals.push([-dy / len, dx / len]);
  }

  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0, ny = 0;
    if (i === 0) {
      nx = segNormals[0][0]; ny = segNormals[0][1];
    } else if (i === n - 1) {
      nx = segNormals[segNormals.length - 1][0]; ny = segNormals[segNormals.length - 1][1];
    } else {
      nx = (segNormals[i - 1][0] + segNormals[i][0]) / 2;
      ny = (segNormals[i - 1][1] + segNormals[i][1]) / 2;
      const llen = Math.hypot(nx, ny) || 1;
      nx /= llen; ny /= llen;
    }
    out.push([latlngs[i][0] + nx * offset, latlngs[i][1] + ny * offset]);
  }
  return out;
}

/**
 * Sample a polyline between startOffset and endOffset (in blocks) and return the sub-polyline.
 * This is a simple proportional sampler over cumulative distances.
 */
function slicePolylineByOffsets(geometry: [number, number, number][], start: number, end: number) {
  const latlngs = coordsToLatLngs(geometry);
  // compute cumulative lengths
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const a = latlngs[i - 1];
    const b = latlngs[i];
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const l = Math.hypot(dx, dy);
    segLens.push(l);
    total += l;
  }
  if (total === 0) return [latlngs[0]];
  const clamp = (v: number) => Math.max(0, Math.min(v, total));
  const s = clamp(start);
  const e = clamp(end);
  if (e <= s) return [];

  // Walk segments and collect points between s..e
  const out: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const segStart = acc;
    const segEnd = acc + segLens[i];
    const a = latlngs[i];
    const b = latlngs[i + 1];

    // If segment intersects [s,e], compute intersection points
    if (segEnd < s) {
      acc = segEnd;
      continue;
    }
    if (segStart > e) break;

    // compute t0..t1 within this segment
    const t0 = segStart <= s && s <= segEnd ? (s - segStart) / segLens[i] : 0;
    const t1 = segStart <= e && e <= segEnd ? (e - segStart) / segLens[i] : 1;

    const ix0: [number, number] = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
    const ix1: [number, number] = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];

    if (!out.length) out.push(ix0);
    else {
      const last = out[out.length - 1];
      if (Math.abs(last[0] - ix0[0]) > 1e-9 || Math.abs(last[1] - ix0[1]) > 1e-9) out.push(ix0);
    }
    out.push(ix1);

    acc = segEnd;
  }

  // remove duplicate consecutive points
  const filtered: [number, number][] = [];
  for (const p of out) {
    if (!filtered.length) filtered.push(p);
    else {
      const last = filtered[filtered.length - 1];
      if (Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) filtered.push(p);
    }
  }

  return filtered;
}

function segmentColor(s: Segment) {
  return s.type === "coppered" ? "#28a745" : "#dc3545";
}

export default function SegmentedEdge({ edge, viewMode = 'group' }: Props) {
  if (!edge.geometry) return null;
  const geometry = edge.geometry as [number, number, number][];
  const total = edge.distance ?? geometry.reduce((acc, _, i) => {
    if (i === 0) return 0;
    const a = geometry[i - 1];
    const b = geometry[i];
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return acc + Math.hypot(dx, dz);
  }, 0);

  // If there are no segments (or zero-length), draw full geometry as single polyline
  if (!edge.segments || edge.segments.length === 0) {
    const latlngs = coordsToLatLngs(geometry);
    if (latlngs.length < 2) return null;
    const lanes = (edge as any).lanes ?? 1;
    const spacing = (edge as any).lane_spacing ?? 0.6;
    if (lanes <= 1) {
      const props: PolylineProps = {
        pathOptions: { color: edge.color || '#3388ff', weight: 4, opacity: 0.9 },
        positions: latlngs,
      };
      return (
        <Polyline {...props}>
          <Tooltip>{`${edge.id ?? edge.from + "->" + edge.to}`}</Tooltip>
        </Polyline>
      );
    }
    // Multiple lanes: render default as grouped double-width by default (viewMode)
    if (viewMode === 'group' || viewMode === 'default') {
      // central thick line + divider
      const thickness = Math.max(4, lanes * 3);
      return (
        <>
          <Polyline pathOptions={{ color: edge.color || '#3388ff', weight: thickness, opacity: 0.9 }} positions={latlngs} />
          <Polyline pathOptions={{ color: '#222', weight: 1, opacity: 0.9 }} positions={latlngs} />
        </>
      );
    }

    // Copper view or explicit per-lane rendering: fallback to per-lane lines
    const out: JSX.Element[] = [];
    const centerIndex = (lanes - 1) / 2;
    for (let li = 0; li < lanes; li++) {
      const offset = (li - centerIndex) * spacing;
      const offLatLngs = offsetPolyline(latlngs, offset);
      out.push(
        <Polyline key={`${edge.id}-lane-${li}`} pathOptions={{ color: edge.color || '#3388ff', weight: 3, opacity: 0.9 }} positions={offLatLngs}>
          <Tooltip>{`${edge.id ?? edge.from + "->" + edge.to} (lane ${li + 1}/${lanes})`}</Tooltip>
        </Polyline>
      );
    }
    return <>{out}</>;
  }

  return (
    <>
      {edge.segments.map((seg, idx) => {
        // compute sub polyline for this segment
        const latlngs = slicePolylineByOffsets(geometry, seg.start_offset, seg.end_offset);
        if (!latlngs || latlngs.length < 2) return null;
        const lanes = (edge as any).lanes ?? 1;
        const spacing = (edge as any).lane_spacing ?? 0.6;

        // Single-lane: render as thick single polyline
        if (lanes <= 1) {
          const props: PolylineProps = {
            pathOptions: { color: segmentColor(seg), weight: 6, opacity: 0.9 },
            positions: latlngs,
          };
          return (
            <Polyline key={`${edge.id}-${idx}`} {...props}>
              <Tooltip>{`${edge.id ?? edge.from + "->" + edge.to}: ${seg.type} (${Math.round(seg.start_offset)}-${Math.round(seg.end_offset)})`}</Tooltip>
            </Polyline>
          );
        }

        // Two-lane (bidirectional) Copper view: draw left/right halves colored by per-side coverage
        if ((viewMode === 'copper') && (lanes === 2)) {
          // left = positive offset (maps to se), right = negative offset (maps to nw)
          const half = spacing / 2;
          const leftLat = offsetPolyline(latlngs, half);
          const rightLat = offsetPolyline(latlngs, -half);

          // determine color for this segment on each side: fallback to seg.type when laneCoverage absent
          const leftColor = (edge as any).laneCoverage?.se ?
            (overlapsAsCopper((edge as any).laneCoverage.se, seg.start_offset, seg.end_offset) ? '#28a745' : '#dc3545')
            : segmentColor(seg);
          const rightColor = (edge as any).laneCoverage?.nw ?
            (overlapsAsCopper((edge as any).laneCoverage.nw, seg.start_offset, seg.end_offset) ? '#28a745' : '#dc3545')
            : segmentColor(seg);

          return (
            <React.Fragment key={`${edge.id}-${idx}`}>
              <Polyline pathOptions={{ color: leftColor, weight: 6, opacity: 0.95 }} positions={leftLat} />
              <Polyline pathOptions={{ color: rightColor, weight: 6, opacity: 0.95 }} positions={rightLat} />
              {/* divider */}
              <Polyline pathOptions={{ color: '#222', weight: 1, opacity: 0.9 }} positions={latlngs} />
            </React.Fragment>
          );
        }

        // Fallback: draw per-lane lines
        const outLanes: JSX.Element[] = [];
        const centerIdx = (lanes - 1) / 2;
        for (let li = 0; li < lanes; li++) {
          const off = (li - centerIdx) * spacing;
          const offLatLngs = offsetPolyline(latlngs, off);
          outLanes.push(
            <Polyline key={`${edge.id}-${idx}-lane-${li}`} pathOptions={{ color: segmentColor(seg), weight: 4, opacity: 0.9 }} positions={offLatLngs}>
              <Tooltip>{`${edge.id ?? edge.from + "->" + edge.to}: ${seg.type} (lane ${li + 1}/${lanes})`}</Tooltip>
            </Polyline>
          );
        }
        return <>{outLanes}</>;
      })}
    </>
  );
}

// Returns true if the coverage segment list has any coppered coverage overlapping [start,end]
function overlapsAsCopper(coverage: Segment[] | undefined, start: number, end: number) {
  if (!coverage || coverage.length === 0) return false;
  for (const c of coverage) {
    const a = Math.max(start, c.start_offset);
    const b = Math.min(end, c.end_offset);
    if (b > a && c.type === 'coppered') return true;
  }
  return false;
}