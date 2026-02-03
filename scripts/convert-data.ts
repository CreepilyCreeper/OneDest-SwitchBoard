/**
 * OneDest Data Converter
 * Converts legacy OneDest format (stations, junctions, lines) to RailScout network.json format
 */

import * as fs from 'fs';
import * as path from 'path';

// Types for source data
interface Station {
  name: string;
  x: number;
  z: number;
  y: number;
  dest: string;
  id: string;
  color: string;
}

interface StationFile {
  features: Station[];
}

interface Junction {
  id: string;
  data: {
    x: number;
    z: number;
    radius?: number;
    name: string;
    line?: string;
    default?: string;
    dests?: string | Record<string, { default: string; dests: string[] }>;
  };
}

interface JunctionFile {
  features: Junction[];
}

interface Line {
  id: string;
  line: number[][][];
  color?: string;
  name?: string;
}

interface LineFile {
  features: Line[];
}

// Types for target format
interface Node {
  name: string;
  coords: [number, number, number];
  type: 'station' | 'junction' | 'waypoint';
}

interface Segment {
  start_offset: number;
  end_offset: number;
  type: 'coppered' | 'uncoppered';
  avg_speed?: number;
}

interface Edge {
  id: string;
  from: string;
  to: string;
  distance: number;
  is_external: boolean;
  segments: Segment[];
  geometry: [number, number, number][]; // Array of [x, y, z] coordinates tracing the rail line
}

interface Exit {
  direction: string;
  target_node: string;
  args: string[];
}

interface Router {
  exits: Exit[];
}

interface NetworkJSON {
  nodes: Record<string, Node>;
  edges: Edge[];
  routers: Record<string, Router>;
  metadata?: {
    converted_from: string;
    conversion_date: string;
  };
}

/**
 * Generate a unique node ID from coordinates
 */
function generateNodeIdFromCoords(x: number, z: number): string {
  return `wp_${Math.round(x)}_${Math.round(z)}`;
}

/**
 * Generate a unique node ID from a name
 */
function generateNodeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Calculate distance between two 3D coordinates
 */
function calculateDistance(from: [number, number, number], to: [number, number, number]): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Find the closest station to a point within threshold
 */
function findClosestStation(
  point: [number, number],
  stations: Station[],
  threshold: number = 300
): { station: Station; dist: number } | null {
  let closest: { station: Station; dist: number } | null = null;

  for (const station of stations) {
    const dist = Math.sqrt(
      Math.pow(point[0] - station.x, 2) + Math.pow(point[1] - station.z, 2)
    );
    if (dist < threshold && (!closest || dist < closest.dist)) {
      closest = { station, dist };
    }
  }

  if (!closest) return null;

  return {
    id: closest.station.id,
    name: closest.station.name,
    coords: [closest.station.x, closest.station.y, closest.station.z],
    dist: closest.dist
  };
}

/**
 * Convert stations to nodes
 */
function convertStations(stations: Station[]): Record<string, Node> {
  const nodes: Record<string, Node> = {};

  for (const station of stations) {
    const id = generateNodeId(station.name);
    nodes[id] = {
      name: station.name,
      coords: [station.x, station.y, station.z],
      type: 'station'
    };
  }

  return nodes;
}

/**
 * Convert junctions to nodes and routers
 */
function convertJunctions(junctions: Junction[]): {
  nodes: Record<string, Node>;
  routers: Record<string, Router>;
} {
  const nodes: Record<string, Node> = {};
  const routers: Record<string, Router> = {};

  for (const junction of junctions) {
    const id = generateNodeId(junction.data.name);
    
    // Add as node
    nodes[id] = {
      name: junction.data.name,
      coords: [junction.data.x, 70, junction.data.z], // Use default y=70 for junctions
      type: 'junction'
    };

    // Parse router configuration if available
    if (junction.data.dests && typeof junction.data.dests === 'object') {
      const exits: Exit[] = [];
      
      for (const [key, config] of Object.entries(junction.data.dests)) {
        if (typeof config === 'object' && config.default && config.dests) {
          // Determine direction from key name
          let direction = key.includes('FromWest') ? 'West' : 
                         key.includes('FromEast') ? 'East' :
                         key.includes('FromNorth') ? 'North' :
                         key.includes('FromSouth') ? 'South' : 'Unknown';
          
          // Extract args from dests
          const args = config.dests.map(d => d.toLowerCase());
          
          exits.push({
            direction,
            target_node: generateNodeId(config.default),
            args
          });
        }
      }

      if (exits.length > 0) {
        routers[id] = { exits };
      }
    }
  }

  return { nodes, routers };
}

/**
 * Get or create a node for a point
 * Returns node id and coords
 */
function getOrCreateNode(
  point: [number, number],
  nodes: Record<string, Node>,
  stations: Station[],
  threshold: number = 300 // Increased threshold for better matching
): { id: string; coords: [number, number, number] } {
  // First try to find a matching station (more generous threshold)
  const stationMatch = findClosestStation(point, stations, threshold);
  if (stationMatch && stationMatch.dist < 150) {
    return { id: stationMatch.id, coords: stationMatch.coords };
  }
  
  // Check if we already have a waypoint at these coordinates
  const wpId = generateNodeIdFromCoords(point[0], point[1]);
  if (nodes[wpId]) {
    return { id: wpId, coords: nodes[wpId].coords };
  }
  
  // Create a new waypoint node
  // Estimate Y coordinate - use nearby station Y if available
  let y = 70;
  if (stationMatch) {
    // Use Y from nearest station if reasonably close
    y = stationMatch.coords[1];
  }
  
  nodes[wpId] = {
    name: `Junction ${Math.round(point[0])}, ${Math.round(point[1])}`,
    coords: [point[0], y, point[1]],
    type: 'waypoint'
  };
  
  return { id: wpId, coords: [point[0], y, point[1]] };
}

/**
 * Convert lines to edges
 */
function convertLines(
  lines: Line[],
  stations: Station[],
  nodes: Record<string, Node>
): Edge[] {
  const edges: Edge[] = [];
  let edgeCounter = 0;

  for (const line of lines) {
    if (!line.line || line.line.length === 0) continue;

    // Flatten the line segments
    const points: [number, number][] = [];
    for (const segment of line.line) {
      for (const point of segment) {
        if (point.length >= 2) {
          points.push([point[0], point[1]]);
        }
      }
    }

    if (points.length < 2) continue;

    // Get or create nodes for start and end
    const start = getOrCreateNode(points[0], nodes, stations, 300);
    const end = getOrCreateNode(points[points.length - 1], nodes, stations, 300);

    // Calculate total distance
    const distance = calculateDistance(start.coords, end.coords);

    // Create geometry from all points (interpolate y coordinate for each point)
    const geometry: [number, number, number][] = points.map((point, idx) => {
      const t = idx / (points.length - 1);
      // Interpolate y from start to end
      const y = start.coords[1] + (end.coords[1] - start.coords[1]) * t;
      return [point[0], y, point[1]];
    });

    // Create edge with single segment
    const edgeId = `edge_${String(edgeCounter++).padStart(3, '0')}`;
    
    edges.push({
      id: edgeId,
      from: start.id,
      to: end.id,
      distance: Math.round(distance * 10) / 10,
      is_external: false,
      segments: [
        {
          start_offset: 0,
          end_offset: distance,
          type: 'coppered'
        }
      ],
      geometry
    });

    // Only create reverse edge if this isn't a very short loop
    if (distance > 10) {
      const reverseEdgeId = `edge_${String(edgeCounter++).padStart(3, '0')}`;
      edges.push({
        id: reverseEdgeId,
        from: end.id,
        to: start.id,
        distance: Math.round(distance * 10) / 10,
        is_external: false,
        segments: [
          {
            start_offset: 0,
            end_offset: distance,
            type: 'coppered'
          }
        ],
        geometry: [...geometry].reverse()
      });
    }
  }

  return edges;
}

/**
 * Main conversion function
 */
function convertData(): void {
  const dataDir = path.join(__dirname, '..', 'data');
  const outputDir = path.join(__dirname, '..', 'public', 'data');

  // Read source files
  const stationsData: StationFile = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'OneDestStations.json'), 'utf-8')
  );
  const junctionsData: JunctionFile = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'OneDestJunctions.json'), 'utf-8')
  );
  const linesData: LineFile = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'OneDestLines.json'), 'utf-8')
  );

  // Convert stations first
  const stationNodes = convertStations(stationsData.features);
  
  // Convert junctions
  const { nodes: junctionNodes, routers } = convertJunctions(junctionsData.features);

  // Merge all nodes into a single object
  const allNodes: Record<string, Node> = { ...stationNodes, ...junctionNodes };

  // Convert lines to edges (this will also create waypoint nodes as needed)
  const edges = convertLines(linesData.features, stationsData.features, allNodes);

  // Build final network
  const network: NetworkJSON = {
    nodes: allNodes,
    edges,
    routers,
    metadata: {
      converted_from: 'OneDest legacy format (stations, junctions, lines)',
      conversion_date: new Date().toISOString()
    }
  };

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  const outputPath = path.join(outputDir, 'network.json');
  fs.writeFileSync(outputPath, JSON.stringify(network, null, 2), 'utf-8');

  // Count node types
  const stationCount = Object.values(allNodes).filter(n => n.type === 'station').length;
  const junctionCount = Object.values(allNodes).filter(n => n.type === 'junction').length;
  const waypointCount = Object.values(allNodes).filter(n => n.type === 'waypoint').length;

  console.log(`Conversion complete!`);
  console.log(`- Stations: ${stationCount}`);
  console.log(`- Junctions: ${junctionCount}`);
  console.log(`- Waypoints: ${waypointCount}`);
  console.log(`- Total nodes: ${Object.keys(allNodes).length}`);
  console.log(`- Edges: ${edges.length}`);
  console.log(`- Routers: ${Object.keys(routers).length}`);
  console.log(`Output: ${outputPath}`);
}

// Run conversion
convertData();
