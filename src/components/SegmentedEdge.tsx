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

type Props = { edge: EdgeDef };

function coordsToLatLngs(poly: [number, number, number][]) {
  return poly.map((p) => [-p[2], p[0]] as [number, number]);
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

export default function SegmentedEdge({ edge }: Props) {
  if (!edge.geometry || !edge.segments) return null;
  const geometry = edge.geometry as [number, number, number][];
  const total = edge.distance ?? geometry.reduce((acc, _, i) => {
    if (i === 0) return 0;
    const a = geometry[i - 1];
    const b = geometry[i];
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return acc + Math.hypot(dx, dz);
  }, 0);

  return (
    <>
      {edge.segments.map((seg, idx) => {
        // compute sub polyline for this segment
        const latlngs = slicePolylineByOffsets(geometry, seg.start_offset, seg.end_offset);
        if (!latlngs || latlngs.length < 2) return null;
        const props: PolylineProps = {
          pathOptions: { color: segmentColor(seg), weight: 6, opacity: 0.9 },
          positions: latlngs,
        };
        return (
          <Polyline key={`${edge.id}-${idx}`} {...props}>
            <Tooltip>{`${edge.id ?? edge.from + "->" + edge.to}: ${seg.type} (${Math.round(seg.start_offset)}-${Math.round(seg.end_offset)})`}</Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}