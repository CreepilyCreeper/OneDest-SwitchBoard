"use client";

import React from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SegmentedEdge from "./SegmentedEdge";
import type { EdgeDef } from "../lib/router";

type Props = { edges: EdgeDef[] };

export default function Map({ edges }: Props) {
  // Determine a reasonable center from first available geometry point
  const firstCoord = edges.find((e) => e.geometry && e.geometry.length > 0)?.geometry?.[0];
  const center: [number, number] = firstCoord ? [firstCoord[2], firstCoord[0]] : [0, 0];

  return (
    <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {edges.map((e) =>
        e.geometry && e.segments ? (
          <SegmentedEdge key={e.id ?? `${e.from}-${e.to}`} edge={e} />
        ) : null
      )}
    </MapContainer>
  );
}