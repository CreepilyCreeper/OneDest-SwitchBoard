"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import EditorToolbar, { EditorMode } from "@/components/editor/EditorToolbar";
import PropertyInspector from "@/components/editor/PropertyInspector";
import { useGraphEditor, EditorGraph } from "@/hooks/useGraphEditor";

// Dynamic import to avoid SSR issues with Leaflet
const EditorMap = dynamic(() => import("@/components/editor/EditorMap"), { 
    ssr: false,
    loading: () => <div style={{width:'100%', height:'100%', background:'#111', color:'#888', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading Map Engine...</div>
});

const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL;

function convertToEditorGraph(data: any): EditorGraph {
    const nodes: Record<string, any> = {};
    const edges: Record<string, any> = {};
    const routers = data.routers || {};
    
    // Soft validation and conversion
    const rawNodes = Array.isArray(data.nodes) ? data.nodes : Object.values(data.nodes || {});
    rawNodes.forEach((n: any) => {
        if (n.id) nodes[n.id] = n;
    });

    const rawEdges = Array.isArray(data.edges) ? data.edges : Object.values(data.edges || {});
    rawEdges.forEach((e: any) => {
        const id = e.id || `${e.from}-${e.to}`;
        edges[id] = { ...e, id };
    });

    return { nodes, edges, routers };
}

export default function CADEditorPage() {
    const { graph, actions, canUndo, canRedo } = useGraphEditor();
    const [mode, setMode] = useState<EditorMode>('select');
    const [selection, setSelection] = useState<{ type: 'node'|'edge'|'multi'|null, ids: string[] }>({ type: null, ids: [] });
    const [snappingEnabled, setSnappingEnabled] = useState(true);
    const [viewMode, setViewMode] = useState<'group'|'copper'|'default'>('group');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input focused
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            // Ctrl+Shift+Z for undo (Windows/Linux), Ctrl+Y still for redo
            if (e.ctrlKey && (e.key === 'Z' || e.key === 'z')) {
                e.preventDefault();
                actions.undo();
            } else if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
                e.preventDefault();
                actions.redo();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selection.ids.length > 0) {
                    selection.ids.forEach(id => {
                        if (selection.type === 'node') actions.deleteNode(id);
                        if (selection.type === 'edge') actions.deleteEdge(id);
                    });
                    setSelection({ type: null, ids: [] });
                }
            } else if (e.key === 's') setMode('select');
            else if (e.key === 'm') setMode('move');
            else if (e.key === 'n') setMode('node');
            else if (e.key === 'e') setMode('edge');

            // Numeric hotkeys 1-5 for tools (1=select,2=move,3=node,4=edge,5=delete)
            else if (e.key === '1') setMode('select');
            else if (e.key === '2') setMode('move');
            else if (e.key === '3') setMode('node');
            else if (e.key === '4') setMode('edge');
            else if (e.key === '5') setMode('delete');

            // Toggle snapping with 0
            else if (e.key === '0') setSnappingEnabled(v => !v);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [actions, selection, canUndo, canRedo]);

    const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(String(ev.target?.result));
                const newGraph = convertToEditorGraph(json);
                if (Object.keys(graph.nodes).length === 0) {
                     actions.setGraph(newGraph);
                } else {
                     if (confirm("Merge into existing graph? Cancel to replace.")) {
                         actions.mergeGraph(newGraph);
                     } else {
                         actions.setGraph(newGraph);
                     }
                }
            } catch (err) {
                alert("Invalid JSON");
            }
        };
        reader.readAsText(f);
    };

    const handleSave = () => {
        const exportData = {
            nodes: graph.nodes,
            edges: Object.values(graph.edges),
            routers: graph.routers
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "onedest-network.json";
        a.click();
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#1e1e1e', color: '#eee', overflow: 'hidden', fontFamily: 'system-ui' }}>
            <EditorToolbar 
                mode={mode} setMode={setMode}
                canUndo={canUndo} canRedo={canRedo}
                onUndo={actions.undo} onRedo={actions.redo}
                onSave={handleSave}
                snappingEnabled={snappingEnabled} setSnappingEnabled={setSnappingEnabled}
                viewMode={viewMode} setViewMode={setViewMode}
            />

            <input 
                ref={fileInputRef} 
                type="file" 
                style={{display:'none'}} 
                onChange={handleFileLoad} 
            />
            
            <div style={{ position: 'absolute', top: 10, left: 70, zIndex: 1000, display: 'flex', gap: 10 }}>
                <button onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 12px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer', borderRadius: 4 }}>
                    Open File
                </button>
                <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Mode: {mode.toUpperCase()} {snappingEnabled ? '(SNAP ON)' : ''}
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <EditorMap 
                    graph={graph}
                    mode={mode}
                    selection={selection}
                    setSelection={setSelection}
                    actions={actions}
                    snappingEnabled={snappingEnabled}
                    snappingRatio="auto"
                    viewMode={viewMode}
                />
            </div>

            <PropertyInspector 
                graph={graph}
                selection={selection}
                updateNode={actions.updateNode}
                updateEdge={actions.updateEdge}
            />
        </div>
    );
}
