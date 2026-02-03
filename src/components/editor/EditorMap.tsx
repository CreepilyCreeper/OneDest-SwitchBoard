"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap, Circle, Popup } from 'react-leaflet';
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
  return [-coords[2], coords[0]];
}

function fromLatLng(lat: number, lng: number): Vec3 {
  return [lng, 0, -lat];
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

    useMapEvents({
        click: (e) => {
            if (mode === 'node') {
                const pos = fromLatLng(e.latlng.lat, e.latlng.lng);
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

                     actions.addEdge({
                         id: `edge_${Date.now()}`,
                         from: draftEdgeStart,
                         to: newNodeId,
                         distance: dist,
                         is_external: false,
                         segments: [],
                         geometry: [(fromNode as any).coords, pos]
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
            
            // Handle Snapping
            if (snappingEnabled && draftEdgeStart && graph.nodes[draftEdgeStart]) {
                 const startNode = graph.nodes[draftEdgeStart];
                 const startPos = (startNode as any).coords;
                 
                 // How do we inject the "Ratio" constraint? The helper function iterates all ratios.
                 // If we want to restriction to "Horizontal/Vertical" or specific ratios, we filter the helper?
                 // For now, use the helper's full list or filter if necessary. 
                 // The prompt asked for "ratios such as...". We can just use the best fit.
                 
                 const snap = snapToRatio(startPos, rawPos, 50); // 50 blocks threshold
                 if (snap) {
                     setMousePos(snap.point);
                     return;
                 }
            }
            setMousePos(rawPos);
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
                         geometry: [(fromNode as any).coords, (toNode as any).coords]
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

    const handleNodeDrag = (id: string, e: L.DragEndEvent | L.LeafletMouseEvent) => {
        // Drag end events may not include `latlng` directly; extract safely.
        let latlng: L.LatLng | undefined;
        if ((e as any).latlng) {
            latlng = (e as any).latlng;
        } else if ((e as any).target && typeof (e as any).target.getLatLng === 'function') {
            latlng = (e as any).target.getLatLng();
        }

        if (!latlng) return;

        const newPos = fromLatLng(latlng.lat, latlng.lng);

        // Calculate delta
        const node = graph.nodes[id];
        if (!node) return;
        const oldPos = (node as any).coords;
        const dx = newPos[0] - oldPos[0];
        const dy = newPos[1] - oldPos[1];
        const dz = newPos[2] - oldPos[2];

        // Apply to ALL selected nodes
        const deltas: Record<string, [number, number, number]> = {};
        
        if (selection.ids.includes(id)) {
            selection.ids.forEach(selId => {
                deltas[selId] = [dx, dy, dz];
            });
        } else {
            deltas[id] = [dx, dy, dz];
        }

        actions.moveNodes(deltas);
    };

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

                 return (
                     <Marker
                        key={n.id}
                        position={toLatLng(pos)}
                        icon={isSelected ? selectedIcon : nodeIcon}
                        draggable={mode === 'move' || (mode === 'select' && isSelected)}
                        eventHandlers={{
                            click: (e) => handleNodeClick(n.id, e),
                            dragend: (e) => handleNodeDrag(n.id, e)
                        }}
                     >
                        {(mode === 'select') && <Popup>{n.name || n.id}</Popup>}
                     </Marker>
                 );
            })}
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

                let outUrl = (this as any)._url as string;

                if (outUrl.includes('z{z}')) outUrl = outUrl.replace('z{z}', `z${zRounded}`);
                else outUrl = outUrl.replace('{z}', String(zRounded));

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
    snappingEnabled, snappingRatio
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
                // Highlight color if selected
                // We wrap SegmentedEdge or custom render
                return (
                     <React.Fragment key={e.id}>
                         {e.geometry && (
                             <Polyline 
                                positions={e.geometry.map((p: any) => toLatLng(p))}
                                pathOptions={{ 
                                    color: isSelected ? 'yellow' : (e.color || '#3388ff'),
                                    weight: isSelected ? 6 : 3
                                }}
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
