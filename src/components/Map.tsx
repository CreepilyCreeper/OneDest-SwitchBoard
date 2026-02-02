"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SegmentedEdge from "./SegmentedEdge";
import type { EdgeDef, NodeDef } from "../lib/router";

// Metro-style marker: a circular div icon (no pin)
// We create the icon inside the component to ensure it's built in the browser runtime.

// Rounded tile layer that forces integer zoom values as suggested in CIVINFO_MAP.md
// We use a custom component to hook into Leaflet initialization
function RoundedTileLayer({ url }: { url: string }) {
  const map = useMap();

  useEffect(() => {
    const RoundedTileLayerClass: any = L.TileLayer.extend({
      getTileUrl: function (coords: L.Coords) {
        const zRounded = Math.round(coords.z);
        const x = coords.x;
        const y = coords.y;

        // Build a URL that matches CivMC tile server expectations:
        // - path segment like `z-1` (the template often includes a literal `z` before {z})
        // - x,y formatted with a comma: `-7,-9.png`
        let url = (this as any)._url as string;

        // Prefer the common civmc template `z{z}` -> `z-1`
        if (url.includes('z{z}')) url = url.replace('z{z}', `z${zRounded}`);
        else url = url.replace('{z}', String(zRounded));

        // Always format tile coordinates as `x,y` (comma-separated).
        // CivMC tile server expects `/z-1/<x>,<y>.png` style paths.
        if (url.includes('{x},{y}')) url = url.replace('{x},{y}', `${x},${y}`);
        else if (url.includes('{x}/{y}')) url = url.replace('{x}/{y}', `${x},${y}`);
        else {
          // fallback: replace separate tokens if present and then join with comma
          if (url.includes('{x}') && url.includes('{y}')) {
            url = url.replace('{x}', String(x)).replace('{y}', String(y));
            // ensure they become comma-separated if they were separated by a slash
            url = url.replace('/' + String(x) + '/' + String(y), `/${x},${y}`);
          }
        }

        // Fill remaining tokens like subdomain `{s}` and retina `{r}` via Leaflet's template util
        const data = {
          s: (this as any)._getSubdomain(coords),
          r: L.Browser.retina ? '@2x' : '',
        };

        return L.Util.template(url, L.extend(data, this.options));
      },
    });

    const layer = new RoundedTileLayerClass(url, {
      minZoom: -5,
      maxZoom: 6,
      tileSize: 256,
      noWrap: true,
    });

    layer.addTo(map);

    // Optional fallback to alternate server if tiles fail
    const primaryTiles = "https://civmc-map.duckdns.org/tiles/terrain/z{z}/{x},{y}.png";
    layer.on("tileerror", function (this: any) {
      if (this._url !== primaryTiles) {
        this.setUrl(primaryTiles);
      }
    });

    return () => {
      map.removeLayer(layer);
    };
  }, [map, url]);

  return null;
}

type Props = { 
  edges: EdgeDef[]; 
  nodes?: NodeDef[];
  onSelectNode?: (node: NodeDef) => void;
};

export default function Map({ edges, nodes = [], onSelectNode }: Props) {
  // Determine a reasonable center from first available geometry point
  // Minecraft -Z is mapped to Lat, X is mapped to Lng to keep North up
  const firstCoord = edges.find((e) => e.geometry && e.geometry.length > 0)?.geometry?.[0]
    || nodes.find(n => n.coords)?.coords;

  const center: [number, number] = firstCoord ? [-firstCoord[2], firstCoord[0]] : [0, 0];

  const tileUrl = "https://civmc-map.duckdns.org/tiles/terrain/z{z}/{x},{y}.png";

  // metro-style DivIcon for stations/nodes (circle, no pin)
  const metroIcon = React.useMemo(() => {
    const size = 18;
    const border = 3;
    const color = "#1f78b4"; // blue metro color
    const html = `
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.25);"></div>
    `;
    return L.divIcon({ html, className: "", iconSize: [size + border * 2, size + border * 2], iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2] });
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={0}
      crs={L.CRS.Simple}
      minZoom={-5}
      maxZoom={6}
      zoomSnap={0.1}
      preferCanvas={true}
      style={{ height: "100%", width: "100%", background: "#000" }}
    >
      <RoundedTileLayer url={tileUrl} />
      {edges.map((e) =>
        e.geometry && e.segments ? (
          <SegmentedEdge key={e.id ?? `${e.from}-${e.to}`} edge={e} />
        ) : null
      )}
      {nodes.map((n) =>
        n.coords ? (
          <Marker
            key={n.id}
            position={[-n.coords[2], n.coords[0]]}
            icon={metroIcon}
            eventHandlers={{ click: () => onSelectNode?.(n) }}
          >
            <Popup>
              <strong>{n.name || n.id}</strong>
              {n.type && <div>Type: {n.type}</div>}
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}