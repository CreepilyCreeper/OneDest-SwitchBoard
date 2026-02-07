import React from 'react';
import type { EditorGraph } from '@/hooks/useGraphEditor';

interface PropertyInspectorProps {
    graph: EditorGraph;
    selection: { type: 'node' | 'edge' | 'multi' | null; ids: string[] };
    updateNode: (id: string, data: any) => void;
    updateEdge: (id: string, data: any) => void;
}

export default function PropertyInspector({ graph, selection, updateNode, updateEdge }: PropertyInspectorProps) {
    if (!selection.ids.length) {
        return <div style={{ padding: 16, color: '#aaa', width: 250, background: '#222' }}>No selection</div>;
    }

    // Just edit the first one for now, or maybe batch edit later
    const firstId = selection.ids[0];

    if (selection.type === 'node') {
        const node = graph.nodes[firstId];
        if (!node) return null;

        const coords = (node as any).coords ?? [0,0,0];

        return (
            <div style={{ padding: 16, background: '#222', color: '#eee', height: '100%', overflow: 'auto', width: 250, borderLeft: '1px solid #444' }}>
                <h3 style={{ marginTop: 0 }}>Node Properties</h3>
                <div style={{ marginBottom: 12 }}>
                    <label style={{display:'block', fontSize: 12, color: '#aaa'}}>ID</label>
                    <input disabled value={node.id} style={{ width: '100%', background: '#333', border: '1px solid #555', color: '#ddd' }} />
                </div>
                
                <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>Name</label>
                     <input 
                        value={node.name || ''} 
                        onChange={e => updateNode(node.id, { name: e.target.value })}
                        style={{ width: '100%', background: '#444', border: '1px solid #555', color: 'white' }} 
                    />
                </div>

                 <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>Type</label>
                     <select 
                        value={node.type || 'junction'}
                        onChange={e => updateNode(node.id, { type: e.target.value })}
                        style={{ width: '100%', background: '#444', border: '1px solid #555', color: 'white' }}
                    >
                        <option value="junction">Junction (Router)</option>
                        <option value="station">Station</option>
                        <option value="waypoint">Waypoint</option>
                    </select>
                </div>

                {node.type !== 'station' && (
                    <div style={{ marginBottom: 12 }}>
                        <label style={{display:'block', fontSize: 12, color: '#aaa'}}>Group (Org)</label>
                        <input 
                            value={(node as any).group || ''}
                            onChange={e => updateNode(node.id, { group: e.target.value })}
                            style={{ width: '100%', background: '#444', border: '1px solid #555', color: 'white' }}
                        />
                    </div>
                )}

                <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>Coordinates (X, Y, Z)</label>
                     <div style={{ display: 'flex', gap: 4 }}>
                         {[0, 1, 2].map((i) => (
                             <input 
                                key={i} 
                                type="number" 
                                value={coords[i]} 
                                onChange={(e) => {
                                    const newCoords = [...coords];
                                    newCoords[i] = Number(e.target.value);
                                    updateNode(node.id, { coords: newCoords });
                                }}
                                style={{ width: '33%', background: '#444', border: '1px solid #555', color: 'white' }}
                             />
                         ))}
                     </div>
                </div>

                {selection.ids.length > 1 && (
                    <div style={{ padding: 8, background: '#442', color: '#fea', border: '1px solid #aa4', marginTop: 10 }}>
                        <small>Selection includes {selection.ids.length} nodes. Editing only the primary selection.</small>
                    </div>
                )}
            </div>
        );
    } else if (selection.type === 'edge') {
        const edge = graph.edges[firstId];
        if(!edge) return null;
        
        return (
            <div style={{ padding: 16, background: '#222', color: '#eee', height: '100%', overflow: 'auto', width: 250, borderLeft: '1px solid #444' }}>
                <h3 style={{ marginTop: 0 }}>Edge Properties</h3>
                 <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>ID</label>
                     <input disabled value={edge.id} style={{ width: '100%', background: '#333', border: '1px solid #555', color: '#ddd' }} />
                </div>
                 <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>From</label>
                     <input disabled value={edge.from} style={{ width: '100%', background: '#333', border: '1px solid #555', color: '#ddd' }} />
                </div>
                 <div style={{ marginBottom: 12 }}>
                     <label style={{display:'block', fontSize: 12, color: '#aaa'}}>To</label>
                     <input disabled value={edge.to} style={{ width: '100%', background: '#333', border: '1px solid #555', color: '#ddd' }} />
                </div>
                
                 <div style={{ marginBottom: 12 }}>
                        <label style={{display:'block', fontSize: 12, color: '#aaa'}}>Group (Org)</label>
                        <input 
                            value={(edge as any).group || ''}
                            onChange={e => updateEdge(edge.id!, { group: e.target.value })}
                            style={{ width: '100%', background: '#444', border: '1px solid #555', color: 'white' }}
                        />
                </div>
            </div>
        );
    }

    return null;
}
