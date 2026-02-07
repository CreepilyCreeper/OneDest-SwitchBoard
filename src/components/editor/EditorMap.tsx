"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap, Circle, Popup, Polygon } from 'react-leaflet';
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import SegmentedEdge from '../SegmentedEdge';
import { EditorGraph } from '@/hooks/useGraphEditor';
import { EditorMode } from './EditorToolbar';
import { snapToRatio, Vec3 } from '@/lib/snapping';
import type { NodeDef } from '@/lib/router';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const nodeIcon = L.divIcon({
  html: '<div style="width:12px;height:12px;background:white;border:2px solid #333;border-radius:50%;"></div>',
  className: 'node-icon',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const selectedIcon = L.divIcon({
    html: '<div style="width:14px;height:14px;background:#ffcc00;border:2px solid white;border-radius:50%;box-shadow:0 0 4pxblack;"></div>',
    className: 'node-icon-selected',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

// Helper to convert CivMC (x, y, z) to Leaflet (lat, lng)
// lat = -z, lng = x
function toLatLng(coords: Vec3): [number, number] {
    // Center the block: mcToLatLng(x,z) -> [-(z + 0.5), x + 0.5]
    return [-(coords[2] + 0.5), coords[0] + 0.5];
}

function fromLatLng(lat: number, lng: number): Vec3 {
    // Reverse mcToLatLng: x = lng - 0.5, z = -lat - 0.5
    return [lng - 0.5, 0, -lat - 0.5];
}

// Compute rectangle corners (latlngs) for a node given width/depth
function nodeRectLatLngs(node: NodeDef) {
    const coords = node.coords ?? [0, 0, 0];
    const w = node.width ?? 1;
    const d = node.depth ?? 1;
    const halfW = w / 2;
    const halfD = d / 2;
    const cx = coords[0];
    const cz = coords[2];
    const y = coords[1] ?? 0;
    const corners: Vec3[] = [
        [cx - halfW, y, cz - halfD],
        [cx + halfW, y, cz - halfD],
        [cx + halfW, y, cz + halfD],
        [cx - halfW, y, cz + halfD],
    ];
    return corners.map(c => toLatLng(c));
}

// Compute a point on the boundary of nodeA rectangle that faces nodeB center
function nodeBoundaryPointTowards(nodeA: NodeDef, nodeB: NodeDef) {
    const a = nodeA.coords ?? [0, 0, 0];
    const b = nodeB.coords ?? [0, 0, 0];
    const cx = a[0];
    const cz = a[2];
    const y = a[1] ?? 0;
    const halfW = (nodeA.width ?? 1) / 2;
    const halfD = (nodeA.depth ?? 1) / 2;

    const dx = b[0] - cx;
    const dz = b[2] - cz;
    // If same position, return center
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return [cx, y, cz] as Vec3;

    const ux = dx / Math.hypot(dx, dz);
    const uz = dz / Math.hypot(dx, dz);

    // compute scale to hit rectangle boundary
    const sx = Math.abs(ux) < 1e-9 ? Number.POSITIVE_INFINITY : halfW / Math.abs(ux);
    const sz = Math.abs(uz) < 1e-9 ? Number.POSITIVE_INFINITY : halfD / Math.abs(uz);
    const s = Math.min(sx, sz);

    return [cx + ux * s, y, cz + uz * s] as Vec3;
}

// produce simple straight geometry connecting the two node boundary points
function geometryBetweenNodes(a: NodeDef, b: NodeDef) {
    const pA = nodeBoundaryPointTowards(a, b);
    const pB = nodeBoundaryPointTowards(b, a);
    return [pA, pB];
}

function InteractionLayer({ 
    mode, 
    graph, 
    selection, 
    setSelection,
    actions,
    snappingEnabled,
    snappingRatio
}: {
    mode: EditorMode;
    graph: EditorGraph;
    selection: { type: 'node'|'edge'|'multi'|null, ids: string[] };
    setSelection: (s: { type: 'node'|'edge'|'multi'|null, ids: string[] }) => void;
    actions: any;
    snappingEnabled: boolean;
    snappingRatio: string;
}) {
    const map = useMap();
    const [draftEdgeStart, setDraftEdgeStart] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState<Vec3 | null>(null);
    const draggingRef = useRef<Set<string>>(new Set());
    const [tempPositions, setTempPositions] = useState<Record<string, Vec3>>({});

    useMapEvents({
        click: (e) => {
            if (mode === 'node') {
                let pos = fromLatLng(e.latlng.lat, e.latlng.lng);
                if (snappingEnabled) pos = snapToGrid(pos);
                const id = `node_${Date.now()}`;
                actions.addNode({
                    id,
                    type: 'junction',
                    coords: pos,
                    exits: []
                });
            } else if (mode === 'edge') {
                 if (draftEdgeStart && mousePos) {
                     // Click on empty space while drawing edge -> Create Node + Edge
                     const newNodeId = `node_${Date.now()}`;
                     
                     // Use snapped mousePos if available? 
                     // mousePos is updated in mousemove and already considers snapping if I implement it correctly there.
                     // The mousemove handler above calls snapToRatio and sets mousePos. So mousePos IS the snapped position.
                     
                     const pos = mousePos;
                     
                     actions.addNode({
                        id: newNodeId,
                        type: 'junction', // default
                        coords: pos,
                        exits: []
                     });
                     
                     const fromNode = graph.nodes[draftEdgeStart];
                     const dist = Math.sqrt(
                         Math.pow((fromNode as any).coords[0] - pos[0], 2) +
                         Math.pow((fromNode as any).coords[2] - pos[2], 2)
                     );

                         // compute geometry clipped to node bounds
                         const newNode = { id: newNodeId, coords: pos } as NodeDef;
                         const geom = geometryBetweenNodes(fromNode, newNode);

                         actions.addEdge({
                             id: `edge_${Date.now()}`,
                             from: draftEdgeStart,
                             to: newNodeId,
                             distance: dist,
                             is_external: false,
                             segments: [],
                             geometry: geom
                         });
                     
                     // Continue chain
                     setDraftEdgeStart(newNodeId);
                 }
            } else if (mode === 'select') {
                // Background click deselects
                 // We need to check if we clicked a feature, but propagation usually handles that.
                 // This click handler fires on map background.
                 setSelection({ type: null, ids: [] });
            }
        },
        mousemove: (e) => {
            const rawPos = fromLatLng(e.latlng.lat, e.latlng.lng);

            // Default to raw
            let outPos = rawPos;

            // Handle Snapping: ratio snap when drafting an edge, but always snap to integer grid for nodes/corners
            if (snappingEnabled && draftEdgeStart && graph.nodes[draftEdgeStart]) {
                 const startNode = graph.nodes[draftEdgeStart];
                 const startPos = (startNode as any).coords;
                 const snap = snapToRatio(startPos, rawPos, 50);
                 if (snap) {
                     // Also snap to integer grid (Minecraft blocks)
                     outPos = [Math.round(snap.point[0]), snap.point[1], Math.round(snap.point[2])];
                     setMousePos(outPos);
                     return;
                 }
            }

            if (snappingEnabled) {
                outPos = [Math.round(rawPos[0]), rawPos[1], Math.round(rawPos[2])];
            }

            setMousePos(outPos);
        }
    });

    const handleNodeClick = (id: string, e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        
        if (mode === 'delete') {
            actions.deleteNode(id);
            return;
        }

        if (mode === 'edge') {
            if (!draftEdgeStart) {
                setDraftEdgeStart(id);
            } else {
                // Finish edge
                if (draftEdgeStart !== id) {
                     const fromNode = graph.nodes[draftEdgeStart];
                     const toNode = graph.nodes[id];
                     const dist = Math.sqrt(
                         Math.pow((fromNode as any).coords[0] - (toNode as any).coords[0], 2) +
                         Math.pow((fromNode as any).coords[2] - (toNode as any).coords[2], 2)
                     );
                     
                     actions.addEdge({
                         id: `edge_${Date.now()}`,
                         from: draftEdgeStart,
                         to: id,
                         distance: dist,
                         is_external: false,
                        segments: [],
                        geometry: geometryBetweenNodes(fromNode, toNode)
                     });
                }
                setDraftEdgeStart(null);
            }
            return;
        }

        if (mode === 'select' || mode === 'move') {
             const isSelected = selection.ids.includes(id);
             if (e.originalEvent.shiftKey) {
                 // Toggle selection
                 const newIds = isSelected ? selection.ids.filter(i => i !== id) : [...selection.ids, id];
                 setSelection({ type: newIds.length > 0 ? (newIds.length > 1 ? 'multi' : 'node') : null, ids: newIds });
             } else {
                 if (!isSelected) {
                    setSelection({ type: 'node', ids: [id] });
                 }
             }
        }
    };

    // Helpers for grid snapping
    const snapToGrid = (p: Vec3) => [Math.round(p[0]), p[1], Math.round(p[2])] as Vec3;

    const handleMarkerDragStart = (id: string) => {
        draggingRef.current.add(id);
        setTempPositions(prev => ({ ...prev, [id]: (graph.nodes[id] as any).coords }));
    };

    const handleMarkerDrag = (id: string, e: any) => {
        let latlng: L.LatLng | undefined;
        if (e && e.latlng) latlng = e.latlng;
        else if (e && e.target && typeof e.target.getLatLng === 'function') latlng = e.target.getLatLng();
        if (!latlng) return;
        let newPos = fromLatLng(latlng.lat, latlng.lng);
        if (snappingEnabled) newPos = snapToGrid(newPos);
        setTempPositions(prev => ({ ...prev, [id]: newPos }));
    };

    const handleMarkerDragEnd = (id: string, e: any) => {
        // Finalize position
        let latlng: L.LatLng | undefined;
        if (e && e.latlng) latlng = e.latlng;
        else if (e && e.target && typeof e.target.getLatLng === 'function') latlng = e.target.getLatLng();
        if (!latlng) {
            // cleanup
            draggingRef.current.delete(id);
            setTempPositions(prev => { const c = { ...prev }; delete c[id]; return c; });
            return;
        }

        let newPos = fromLatLng(latlng.lat, latlng.lng);
        if (snappingEnabled) newPos = snapToGrid(newPos);

        const node = graph.nodes[id];
        if (!node) return;
        const oldPos = (node as any).coords as Vec3;

        const dx = newPos[0] - oldPos[0];
        const dy = newPos[1] - oldPos[1];
        const dz = newPos[2] - oldPos[2];

        const deltas: Record<string, [number, number, number]> = {};
        if (selection.ids.includes(id)) {
            selection.ids.forEach(selId => {
                deltas[selId] = [dx, dy, dz];
            });
        } else {
            deltas[id] = [dx, dy, dz];
        }

        actions.moveNodes(deltas);

        // cleanup temp state
        draggingRef.current.delete(id);
        setTempPositions(prev => { const c = { ...prev }; delete c[id]; return c; });
    };

    // overlay info
    const overlayInfo = (() => {
        if (!mousePos) return null;
        const coordsText = `${mousePos[0].toFixed(0)}, ${mousePos[2].toFixed(0)}`;
        let angle: number | null = null;
        let ratio: string | undefined;
        if (draftEdgeStart && graph.nodes[draftEdgeStart]) {
            const start = (graph.nodes[draftEdgeStart] as any).coords as Vec3;
            const dx = mousePos[0] - start[0];
            const dz = mousePos[2] - start[2];
            angle = Math.atan2(dz, dx) * (180 / Math.PI);
            const snap = snapToRatio(start, mousePos, 50);
            if (snap) ratio = snap.ratio;
        }
        return { coordsText, angle: angle != null ? angle.toFixed(1) : null, ratio };
    })();

    return (
        <>
            {/* Draft Logic */}
            {draftEdgeStart && mousePos && graph.nodes[draftEdgeStart] && (
                <Polyline 
                    positions={[
                        toLatLng((graph.nodes[draftEdgeStart] as any).coords),
                        toLatLng(mousePos)
                    ]}
                    pathOptions={{ color: 'lime', dashArray: '5, 10' }}
                />
            )}
            
            {/* Render Nodes (Interactive) */}
            {Object.values(graph.nodes).map((n) => {
                 const isSelected = selection.ids.includes(n.id);
                 const pos = (n as any).coords;
                 if (!pos) return null;
                 const currentPos = tempPositions[n.id] ?? pos;

                 return (
                     <React.Fragment key={n.id}>
                        {/* Rectangle showing physical footprint */}
                        <Polygon
                            positions={nodeRectLatLngs(n as NodeDef)}
                            pathOptions={{ color: isSelected ? '#ffcc00' : '#ffffff', weight: 2, fillOpacity: 0.15, fillColor: isSelected ? '#ffcc00' : '#444' }}
                        />

                        <Marker
                            position={toLatLng(currentPos)}
                            icon={isSelected ? selectedIcon : nodeIcon}
                            draggable={mode === 'move' || (mode === 'select' && isSelected)}
                            eventHandlers={{
                                click: (e) => handleNodeClick(n.id, e),
                                dragstart: () => handleMarkerDragStart(n.id),
                                drag: (e) => handleMarkerDrag(n.id, e),
                                dragend: (e) => handleMarkerDragEnd(n.id, e)
                            }}
                        >
                            {(mode === 'select') && <Popup>{n.name || n.id}</Popup>}
                        </Marker>
                     </React.Fragment>
                 );
            })}

            {/* Small overlay showing snap/coords */}
            {overlayInfo && (
                <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 1200, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12 }}>
                    <div><strong>Coords:</strong> {overlayInfo.coordsText}</div>
                    {overlayInfo.ratio && <div><strong>Snap:</strong> {overlayInfo.ratio}</div>}
                    {overlayInfo.angle !== null && <div><strong>Angle:</strong> {overlayInfo.angle}°</div>}
                </div>
            )}
        </>
    );
}

// Rounded Tile Layer Component (Reused logic)
function RoundedTileLayer({ url }: { url: string }) {
    const map = useMap();

    useEffect(() => {
        const RoundedTileLayerClass: any = L.TileLayer.extend({
            getTileUrl: function (coords: L.Coords) {
                const zRounded = Math.round((coords as any).z);
                const x = (coords as any).x;
                const y = (coords as any).y;

                // The CivMC tile server uses z values from 0 down to -5 (0, -1, -2...)
                // Map Leaflet's zoom to server zoom: keep 0 as 0, and invert positive zooms to negative.
                // Use Leaflet's zoom directly as server z (server provides tiles for z values 0 down to -5).
                const serverZ = zRounded;

                let outUrl = (this as any)._url as string;

                if (outUrl.includes('z{z}')) outUrl = outUrl.replace('z{z}', `z${serverZ}`);
                else outUrl = outUrl.replace('{z}', String(serverZ));

                if (outUrl.includes('{x},{y}')) outUrl = outUrl.replace('{x},{y}', `${x},${y}`);
                else if (outUrl.includes('{x}/{y}')) outUrl = outUrl.replace('{x}/{y}', `${x},${y}`);
                else {
                    if (outUrl.includes('{x}') && outUrl.includes('{y}')) {
                        outUrl = outUrl.replace('{x}', String(x)).replace('{y}', String(y));
                        outUrl = outUrl.replace('/' + String(x) + '/' + String(y), `/${x},${y}`);
                    }
                }

                const data = {
                    s: (this as any)._getSubdomain(coords),
                    r: L.Browser.retina ? '@2x' : '',
                };

                return L.Util.template(outUrl, L.extend(data, this.options));
            },
        });

        const layer = new RoundedTileLayerClass(url, {
            minZoom: -5,
            maxZoom: 6,
            tileSize: 256,
            maxNativeZoom: 0,
            noWrap: true,
        });

        layer.addTo(map);

        const primaryTiles = 'https://civmc-map.duckdns.org/tiles/terrain/z{z}/{x},{y}.png';
        layer.on('tileerror', function (this: any) {
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



export default function EditorMap({ 
    graph, mode, selection, setSelection, actions,
    snappingEnabled, snappingRatio, viewMode
}: any) {
    const nodesList = useMemo(() => Object.values(graph.nodes), [graph.nodes]);
    const edgesList = useMemo(() => Object.values(graph.edges), [graph.edges]) as any[];

    // Calculate center
    const center: [number, number] = nodesList.length > 0 
        ? toLatLng((nodesList[0] as any).coords) 
        : [0, 0];

    return (
        <MapContainer
            center={center}
            zoom={0}
            crs={L.CRS.Simple}
            minZoom={-5}
            maxZoom={6}
            zoomSnap={0.1}
            preferCanvas={true}
            style={{ width: '100%', height: '100%', background: '#111' }}
        >
            {/* Rounded tile layer matching civmc server expectations */}
            <RoundedTileLayer url={"https://civmc-map.duckdns.org/tiles/terrain/z{z}/{x},{y}.png"} />
            
            {/* Static Edges (Visual) */}
            {edgesList.map((e) => {
                const isSelected = selection.ids.includes(e.id);
                return (
                    <React.Fragment key={e.id}>
                        {/* Use SegmentedEdge for full-featured rendering (handles segments and corners) */}
                        <g>
                            <SegmentedEdge edge={e} viewMode={viewMode} />
                        </g>
                        {/* highlight overlay if selected (drawn on top) */}
                        {isSelected && e.geometry && (
                            <Polyline
                                positions={e.geometry.map((p: any) => toLatLng(p))}
                                pathOptions={{ color: 'yellow', weight: 6, opacity: 0.9 }}
                                eventHandlers={{
                                    click: (ev) => {
                                        L.DomEvent.stopPropagation(ev);
                                        if (mode === 'delete') {
                                            actions.deleteEdge(e.id);
                                        } else {
                                            setSelection({ type: 'edge', ids: [e.id] });
                                        }
                                    }
                                }}
                            />
                        )}
                    </React.Fragment>
                );
            })}

            <InteractionLayer 
                mode={mode} 
                graph={graph} 
                selection={selection} 
                setSelection={setSelection}
                actions={actions}
                snappingEnabled={snappingEnabled}
                snappingRatio={snappingRatio}
            />
        </MapContainer>
    );
}
