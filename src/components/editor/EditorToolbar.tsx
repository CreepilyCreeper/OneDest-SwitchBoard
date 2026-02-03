import React from 'react';

export type EditorMode = 'select' | 'move' | 'node' | 'edge' | 'delete';

interface EditorToolbarProps {
    mode: EditorMode;
    setMode: (m: EditorMode) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    snappingEnabled: boolean;
    setSnappingEnabled: (v: boolean) => void;
}

export default function EditorToolbar({
    mode, setMode, canUndo, canRedo, onUndo, onRedo, onSave,
    snappingEnabled, setSnappingEnabled
}: EditorToolbarProps) {

    const tools: { id: EditorMode; label: string; icon?: string }[] = [
        { id: 'select', label: 'Select (S)' },
        { id: 'move', label: 'Move (M)' },
        { id: 'node', label: 'Add Node (N)' },
        { id: 'edge', label: 'Add Edge (E)' },
        { id: 'delete', label: 'Delete (D)' },
    ];

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 8,
            background: '#2c2c2c', color: 'white', borderRight: '1px solid #444',
            width: 60, alignItems: 'center'
        }}>
            <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button 
                    disabled={!canUndo} 
                    onClick={onUndo} 
                    title="Undo (Ctrl+Z)"
                    style={{ padding: 4, cursor: canUndo ? 'pointer' : 'default', opacity: canUndo ? 1 : 0.5 }}
                >
                    ↩️
                </button>
                <button 
                     disabled={!canRedo} 
                     onClick={onRedo} 
                     title="Redo (Ctrl+Y)"
                     style={{ padding: 4, cursor: canRedo ? 'pointer' : 'default', opacity: canRedo ? 1 : 0.5 }}
                >
                    ↪️
                </button>
                <button onClick={onSave} title="Save/Export">💾</button>
            </div>

            <hr style={{ width: '100%', borderColor: '#555' }} />

            {tools.map(t => (
                <button
                    key={t.id}
                    onClick={() => setMode(t.id)}
                    title={t.label}
                    style={{
                        padding: 8,
                        borderRadius: 4,
                        background: mode === t.id ? '#4a90e2' : 'transparent',
                        border: '1px solid #555',
                        color: 'white',
                        cursor: 'pointer',
                        width: '100%'
                    }}
                >
                    {t.id === 'select' && '↖️'}
                    {t.id === 'move' && '✋'}
                    {t.id === 'node' && '📍'}
                    {t.id === 'edge' && '🔗'}
                    {t.id === 'delete' && '🗑️'}
                </button>
            ))}

            <hr style={{ width: '100%', borderColor: '#555' }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 10 }}>
                <label>
                    <input 
                        type="checkbox" 
                        checked={snappingEnabled} 
                        onChange={e => setSnappingEnabled(e.target.checked)} 
                    />
                    Snap
                </label>
            </div>
        </div>
    );
}
