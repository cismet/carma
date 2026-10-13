import type { Position } from "geojson";

/** where the two diagonals of a quadrilateral cross, planar */
export const diagonalIntersection = (
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position
): [number, number] | null => {
  const [x1, y1] = p0;
  const [x2, y2] = p2;
  const [x3, y3] = p1;
  const [x4, y4] = p3;
  const denominator = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denominator === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
  return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
};
