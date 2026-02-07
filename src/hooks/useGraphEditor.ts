import { useReducer, useCallback } from "react";
import type { NodeDef, EdgeDef } from "@/lib/router";

// Standardized Editor Graph Format
// We use Records for O(1) access during editing
export interface EditorGraph {
  nodes: Record<string, NodeDef>;
  edges: Record<string, EdgeDef>;
  routers: Record<string, any>; // Keeping router logic vague for now
  meta?: any;
}

type HistoryState = {
  past: EditorGraph[];
  present: EditorGraph;
  future: EditorGraph[];
};

type Action =
  | { type: "SET_GRAPH"; graph: EditorGraph }
  | { type: "MERGE_GRAPH"; graph: EditorGraph }
  | { type: "ADD_NODE"; node: NodeDef }
  | { type: "UPDATE_NODE"; id: string; patch: Partial<NodeDef> }
  | { type: "MOVE_NODES"; deltas: Record<string, [number, number, number]> } // id -> [dx, dy, dz]
  | { type: "DELETE_NODE"; id: string }
  | { type: "ADD_EDGE"; edge: EdgeDef }
  | { type: "UPDATE_EDGE"; id: string; patch: Partial<EdgeDef> }
  | { type: "DELETE_EDGE"; id: string }
  | { type: "UNDO" }
  | { type: "REDO" };

const MAX_HISTORY = 50;

function createEmptyGraph(): EditorGraph {
  return { nodes: {}, edges: {}, routers: {} };
}

function updateConnectedEdges(
  nodes: Record<string, NodeDef>,
  edges: Record<string, EdgeDef>,
  movedNodeIds: Set<string>
): Record<string, EdgeDef> {
  const newEdges = { ...edges };
  let changed = false;

  Object.values(newEdges).forEach((edge) => {
    if (!edge.id) return;
    const fromMoved = movedNodeIds.has(edge.from);
    const toMoved = movedNodeIds.has(edge.to);

    if (fromMoved || toMoved) {
      changed = true;
      const fromNode = nodes[edge.from];
      const toNode = nodes[edge.to];
      if (!fromNode || !toNode) return;

      // Update geometry if it exists or create it
      // Simple logic: If it's a straight line (2 points), just update ends
      // If it is complex, we might need to apply the delta? 
      // For now, let's assume straight lines for dynamic editing or just update end points
      
      const p1 = (fromNode as any).coords; // NodeDef usually has coords
      // Check NodeDef in lib: type NodeDef = { id, type, ... } . Where is coords? 
      // In the json data it has coords: [x,y,z]. In `page.tsx` EnhancedNodeDef has coords.
      // We assume coords exists.
      
      const p2 = (toNode as any).coords;

      // helper: compute a boundary point on nodeA facing nodeB
      const nodeBoundaryPointTowards = (nodeA: any, nodeB: any) => {
        const a = nodeA.coords ?? [0, 0, 0];
        const b = nodeB.coords ?? [0, 0, 0];
        const cx = a[0];
        const cz = a[2];
        const y = a[1] ?? 0;
        const halfW = (nodeA.width ?? 1) / 2;
        const halfD = (nodeA.depth ?? 1) / 2;
        const dx = b[0] - cx;
        const dz = b[2] - cz;
        if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return [cx, y, cz];
        const len = Math.hypot(dx, dz);
        const ux = dx / len;
        const uz = dz / len;
        const sx = Math.abs(ux) < 1e-9 ? Number.POSITIVE_INFINITY : halfW / Math.abs(ux);
        const sz = Math.abs(uz) < 1e-9 ? Number.POSITIVE_INFINITY : halfD / Math.abs(uz);
        const s = Math.min(sx, sz);
        return [cx + ux * s, y, cz + uz * s];
      };

      const endpointA = nodeBoundaryPointTowards(fromNode, toNode);
      const endpointB = nodeBoundaryPointTowards(toNode, fromNode);

      let newGeo = edge.geometry ? [...edge.geometry] : [endpointA, endpointB];

      if (fromMoved && newGeo.length > 0) {
        newGeo[0] = endpointA;
      }
      if (toMoved && newGeo.length > 0) {
        newGeo[newGeo.length - 1] = endpointB;
      }
      
      newEdges[edge.id] = {
        ...edge,
        geometry: newGeo,
        // Recalculate distance?
        distance: Math.sqrt(
          Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[2] - p1[2], 2)
        )
      };
    }
  });

  return changed ? newEdges : edges;
}

function reducer(state: HistoryState, action: Action): HistoryState {
  const { past, present, future } = state;

  // Helper to push history
  const pushHistory = (newPresent: EditorGraph) => {
    const newPast = [...past, present];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    return {
      past: newPast,
      present: newPresent,
      future: [],
    };
  };

  switch (action.type) {
    case "UNDO":
      if (past.length === 0) return state;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };

    case "REDO":
      if (future.length === 0) return state;
      const next = future[0];
      const newFuture = future.slice(1);
      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };

    case "SET_GRAPH":
      return {
        past: [], // Reset history on new file load? Or maybe keep it? usually load clears history
        present: action.graph,
        future: [],
      };

    case "MERGE_GRAPH":
      // Merge logic
      return pushHistory({
        nodes: { ...present.nodes, ...action.graph.nodes },
        edges: { ...present.edges, ...action.graph.edges },
        routers: { ...present.routers, ...action.graph.routers },
        meta: present.meta,
      });

    case "ADD_NODE": // assumes id is present and unique
      return pushHistory({
        ...present,
        nodes: { ...present.nodes, [action.node.id]: action.node },
      });

    case "UPDATE_NODE":
      if (!present.nodes[action.id]) return state;
      return pushHistory({
        ...present,
        nodes: {
          ...present.nodes,
          [action.id]: { ...present.nodes[action.id], ...action.patch },
        },
      });

    case "MOVE_NODES":
      // action.deltas = { nodeId: [dx, dy, dz] }
      // This is a complex update affecting nodes AND connected edges
      const newNodes = { ...present.nodes };
      const movedIds = new Set<string>();
      
      Object.entries(action.deltas).forEach(([id, delta]) => {
        const node = newNodes[id];
        if (node) {
          const coords = (node as any).coords as [number, number, number];
          newNodes[id] = {
            ...node,
            coords: [coords[0] + delta[0], coords[1] + delta[1], coords[2] + delta[2]],
          };
          movedIds.add(id);
        }
      });
      
      const newEdges = updateConnectedEdges(newNodes, present.edges, movedIds);

      return pushHistory({
        ...present,
        nodes: newNodes,
        edges: newEdges,
      });

    case "DELETE_NODE": // Also delete connected edges
      const { [action.id]: deletedNode, ...remainingNodes } = present.nodes;
      // Filter edges
      const remainingEdges: Record<string, EdgeDef> = {};
      Object.entries(present.edges).forEach(([eid, edge]) => {
        if (edge.from !== action.id && edge.to !== action.id) {
            remainingEdges[eid] = edge;
        }
      });
      return pushHistory({
        ...present,
        nodes: remainingNodes,
        edges: remainingEdges,
      });

    case "ADD_EDGE":
       // Ensure ID
       const edgeId = action.edge.id || `edge_${Date.now()}`;
       return pushHistory({
         ...present,
         edges: { ...present.edges, [edgeId]: { ...action.edge, id: edgeId } },
       });

    case "UPDATE_EDGE":
        if (!present.edges[action.id]) return state;
        return pushHistory({
            ...present,
            edges: {
                ...present.edges,
                [action.id]: { ...present.edges[action.id], ...action.patch }
            }
        });

    case "DELETE_EDGE":
        const { [action.id]: deletedEdge, ...edgesLeft } = present.edges;
        return pushHistory({
            ...present,
            edges: edgesLeft
        });

    default:
      return state;
  }
}

export function useGraphEditor(initialGraph?: EditorGraph) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initialGraph || createEmptyGraph(),
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const actions = {
    setGraph: (graph: EditorGraph) => dispatch({ type: "SET_GRAPH", graph }),
    mergeGraph: (graph: EditorGraph) => dispatch({ type: "MERGE_GRAPH", graph }),
    addNode: (node: NodeDef) => dispatch({ type: "ADD_NODE", node }),
    updateNode: (id: string, patch: Partial<NodeDef>) => dispatch({ type: "UPDATE_NODE", id, patch }),
    deleteNode: (id: string) => dispatch({ type: "DELETE_NODE", id }),
    moveNodes: (deltas: Record<string, [number, number, number]>) => dispatch({ type:"MOVE_NODES", deltas }),
    addEdge: (edge: EdgeDef) => dispatch({ type: "ADD_EDGE", edge }),
    updateEdge: (id: string, patch: Partial<EdgeDef>) => dispatch({ type: "UPDATE_EDGE", id, patch }),
    deleteEdge: (id: string) => dispatch({ type: "DELETE_EDGE", id }),
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
  };

  return {
    graph: state.present,
    actions,
    canUndo,
    canRedo,
    historyStats: { past: state.past.length, future: state.future.length },
  };
}
