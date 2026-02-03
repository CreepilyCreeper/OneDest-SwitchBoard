export type Vec3 = [number, number, number];

export interface SnapResult {
  point: Vec3;
  ratio?: string; // e.g., "1:2"
  screenPoint?: [number, number]; // helper for UI rendering if needed
  distance: number;
}

const SNAPPING_RATIOS = [
  { dy: 0, dx: 1, name: "Horizontal" },
  { dy: 1, dx: 0, name: "Vertical" },
  { dy: 1, dx: 1, name: "1:1" },
  { dy: 1, dx: 2, name: "1:2" },
  { dy: 1, dx: 3, name: "1:3" },
  { dy: 1, dx: 4, name: "1:4" },
  { dy: 1, dx: 5, name: "1:5" },
  { dy: 1, dx: 6, name: "1:6" },
  { dy: 2, dx: 3, name: "2:3" },
  { dy: 2, dx: 5, name: "2:5" },
  { dy: 3, dx: 4, name: "3:4" },
  { dy: 3, dx: 5, name: "3:5" }, // 3:5 triangle
];

/**
 * Snaps a target point (e.g. mouse cursor) to the nearest line radiating from startPoint
 * that matches one of the predefined ratios.
 */
export function snapToRatio(
  start: Vec3,
  target: Vec3,
  threshold: number = 20, // World units (blocks) threshold
  // We might need a screen-space threshold ideally, but world space is easier for logic
): SnapResult | null {
  const dx = target[0] - start[0];
  const dz = target[2] - start[2]; // Leaflet/Minecraft uses X/Z plane usually, assuming Y is up
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  if (dist < 0.01) return null; // Too close to snap

  let bestSnap: SnapResult | null = null;
  let minDiff = Infinity;

  // Check each ratio (and its 4 quadrants)
  for (const ratio of SNAPPING_RATIOS) {
    // We only need to check the primary ratio vector, and project the target onto it
    // But since we want to snap to the line, we can just check angle difference or distance
    
    // Ratios define multiple lines: (+dx, +dy), (+dx, -dy), (-dx, +dy), etc.
    // Actually simpler: treating slope m = dy/dx. 
    // Possible slopes: m, -m, 1/m, -1/m? No, the list covers the base ratios.
    // We just need to check signs.
    
    const slopes = [
      { dx: ratio.dx, dy: ratio.dy },   // Q1
      { dx: ratio.dx, dy: -ratio.dy },  // Q2 (XZ plane usually: +X Right, +Z Down? or standard math?)
      // We process lines, so (dx, dy) covers (-dx, -dy).
      // We also need (-dx, dy) ? No, that's covered by dx, -dy if we treat line as infinite.
    ];

    // Handle vertical separately to avoid div by zero if we used literal slopes
    if (ratio.dx === 0) {
      // Vertical line: x = start.x
      const distToLine = Math.abs(dx);
      if (distToLine < threshold && distToLine < minDiff) {
        minDiff = distToLine;
        bestSnap = {
          point: [start[0], target[1], target[2]], // Project onto vertical line -> keep X same, Z target
          ratio: ratio.name,
          distance: distToLine
        };
      }
      continue;
    }
    
    // For general case: vector U = (ratio.dx, ratio.dy)
    // We want to project vector V = (dx, dz) onto line defined by U.
    // We check both (dx, dy) and (dx, -dy) to cover both diagonals.
    
    for (const slope of slopes) {
      if (slope.dx === 0 && slope.dy === 0) continue; // Should not happen
      
      // Normalized direction vector
      const len = Math.sqrt(slope.dx * slope.dx + slope.dy * slope.dy);
      const ux = slope.dx / len;
      const uz = slope.dy / len;
      
      // Project V onto U: (V . U) * U
      const dot = dx * ux + dz * uz;
      const projX = dot * ux;
      const projZ = dot * uz;
      
      // Distance from target to projected point
      const rx = dx - projX;
      const rz = dz - projZ;
      const distance = Math.sqrt(rx * rx + rz * rz);
      
      if (distance < threshold && distance < minDiff) {
        minDiff = distance;
        bestSnap = {
          point: [start[0] + projX, target[1], start[2] + projZ],
          ratio: ratio.name,
          distance: distance
        };
      }
    }
  }

  return bestSnap;
}
