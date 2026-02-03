# Documentation: OneDest SwitchBoard
**Project:** OneDest SwitchBoard  
**Role:** Central Intelligence, Routing Engine, and Maintenance Dashboard  
**Status:** Core Specification  

---

## 1. Executive Summary
**SwitchBoard** is the central web platform and analytical engine for the OneDest rail network. While RailScout (the mod) acts as the "eyes" on the ground, SwitchBoard is the "brain." It maintains the master network graph, calculates optimal paths based on physical distance, and—most importantly—mathematically determines the physical configuration of redstone routers to prevent player misrouting.

It interfaces directly with a **GitHub Repository** to store the network state, ensuring that every change is versioned, peer-reviewed, and publicly accessible.

---

## 2. Core Functional Modules

### A. The Routing Engine (Dijkstra-Distance)
The engine treats the rail network as a directed graph. 
- **The Metric:** Routing is calculated strictly by **block distance**. 
- **Stability:** By ignoring copper status for routing, the system ensures that a "damaged" rail doesn't suddenly cause the system to suggest a 5,000-block detour. 
- **External Support:** The engine can route through "External" rails (non-OneDest standards), but it identifies them as read-only.

### B. The Logic Compiler (Prefix Collision Analysis)
This is the most critical feature for builders. It analyzes every destination passing through a junction and determines if the physical switches can be **Unordered** (Simple Roundabout) or must be **Ordered** (Sequential Switches).
- **The Prefix Rule:** If Argument A (e.g., `icenia`) is a prefix of Argument B (e.g., `icenia-city`) and they go to **different** exits, the router **must** be ordered.
- **Output:** The tool generates a "Sign Manifest" for builders, listing the exact strings and the physical sequence required.

### C. The Maintenance Heatmap
SwitchBoard visualizes the telemetry from RailScout.
- **Segmented Visualization:** Edges are rendered as multi-colored polylines. A single rail line may be green for 200 blocks, red for 50 (missing copper), and green again for 100.
- **Audit Log:** It tracks "Last Surveyed" dates. If a rail hasn't been ridden in 30 days, it is flagged as "Stale Data" for maintainers to re-verify.

### D. GitHub Sync Workflow
- **Data Persistence:** The master graph is stored as `network.json` in a GitHub repo.
- **Change Management:** When a maintainer updates a router or adds a rail, SwitchBoard generates a JSON diff and opens a **GitHub Pull Request**. This allows the project lead to audit changes before they go "live" on the public routing site.

---

## 3. The Logic Algorithm: Prefix Conflict Detection

To determine if a router is "Safe (Unordered)", SwitchBoard runs the following logic for every Junction:

1.  **Map Exits:** Identify all physical exits (e.g., North, East, South).
2.  **Assign Destinations:** Group all OneDest `/dest` arguments by their required exit.
3.  **Cross-Check:** For every argument in Exit A, check if it is a prefix of any argument in Exit B, C, or D.
    - *Example:* Exit North has `icenia`. Exit East has `icenia-city`.
    - *Result:* Conflict. A player heading East will trigger the North switch first.
4.  **Resolution:** The tool flags the junction as **"Ordered Required"** and sorts the manifest so that the most specific arguments (`icenia-city`) are placed physically before the general arguments (`icenia`).

---

## 4. The JSON Data Standard (`network.json`)

This schema is the single source of truth.

```json
{
  "nodes": {
    "node_id": {
      "name": "Station/Junction Name",
      "coords": [x, y, z],
      "type": "station | junction | waypoint"
    }
  },
  "edges": [
    {
      "id": "edge_001",
      "from": "node_a",
      "to": "node_b",
      "distance": 450.5,
      "is_external": false,
      "segments": [
        {
          "start_offset": 0,
          "end_offset": 400,
          "type": "coppered",
          "avg_speed": 29.8
        },
        {
          "start_offset": 400,
          "end_offset": 450.5,
          "type": "uncoppered",
          "avg_speed": 8.5
        }
      ]
    }
  ],
  "routers": {
    "node_a": {
      "exits": [
        {
          "direction": "North",
          "target_node": "node_b",
          "args": ["occident", "icenia"]
        }
      ]
    }
  }
}
```

---

## 5. Instructions for Future Work (Developer Guide)

### Frontend Requirements
- **Map Library:** Use `Leaflet.js` or `React-Leaflet`.
- **Coordinate Transformation:** CivMC coordinates (X, Z) must be mapped to the Leaflet CRS (Coordinate Reference System) so that the map matches the in-game world.
- **Visuals:** Use `PolylineDecorator` to show direction arrows on rails.

### Backend/Logic Requirements
- **Graph Library:** Use `graphlib` or a custom Dijkstra implementation in TypeScript.
- **GitHub Integration:** Use `@octokit/rest` for PR creation.

### Execution Prompt for AI Agents (The Brain)
> **Role:** Senior TypeScript Engineer  
> **Task:** Create the OneDest Logic Compiler.
> **Logic:** 
> 1. Create a function `getRouterManifest(nodeId: string, graph: NetworkJSON)` that finds all destinations reachable from that node.
> 2. Implement a "Prefix Conflict" detector. Compare every string in the `args` array for each exit.
> 3. If `StringA.startsWith(StringB)` where A and B are on different exits, throw a `ConflictWarning`.
> 4. Generate an array of "Physical Switch Instructions" where conflicts are resolved by placing the longer (more specific) string first in the sequence.
> 5. Export a `suggestedLayout` object that tells the user if they can use a "Roundabout" or a "Straight Line" switch sequence.

### Execution Prompt for AI Agents (The Heatmap)
> **Role:** Frontend Data Visualization Expert  
> **Task:** Create a React component for the Maintenance Heatmap.
> **Requirements:** 
> 1. Input: An `Edge` object with a `segments` array.
> 2. Output: A Leaflet `FeatureGroup` containing multiple `Polyline` components.
> 3. Each segment should have a color: `#2ecc71` (Green) for coppered, `#e74c3c` (Red) for uncoppered.
> 4. Add a tooltip to each segment showing the exact block-distance of the gap and the average recorded speed.