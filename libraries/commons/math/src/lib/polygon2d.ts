import {
  addPoint2d,
  getPolygonCentroid2d,
  scalePoint2d,
  type Point2,
} from "./geometry2d";
import { clamp } from "./numeric";

/** Point-to-polygon queries on simple, possibly concave polygons. */

const POLYGON_2D_DEFAULTS = Object.freeze({
  epsilon: 1e-6,
  polylabelPrecision: 0.5,
  polylabelMaxCells: 20000,
  interiorSampleGrid: 18,
  minInteriorSampleGrid: 6,
});

type InscribedPoint2d = { center: Point2; radius: number };

const segmentParameter = (point: Point2, start: Point2, end: Point2) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  return lengthSquared <= POLYGON_2D_DEFAULTS.epsilon ** 2
    ? 0
    : clamp(
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        0,
        1
      );
};

const getClosestPointOnSegment2d = (
  point: Point2,
  start: Point2,
  end: Point2
): Point2 => {
  const t = segmentParameter(point, start, end);
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
};

const getDistanceToSegment2d = (
  point: Point2,
  start: Point2,
  end: Point2
): number => {
  const closest = getClosestPointOnSegment2d(point, start, end);
  return Math.hypot(point.x - closest.x, point.y - closest.y);
};

const edgesOf = (polygon: readonly Point2[]) =>
  polygon.map(
    (start, index) => [start, polygon[(index + 1) % polygon.length]!] as const
  );

/** Inside or on the outline. */
export const isPointInsidePolygon2d = (
  polygon: readonly Point2[],
  point: Point2,
  tolerance = POLYGON_2D_DEFAULTS.epsilon
): boolean => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (const [previous, current] of edgesOf(polygon)) {
    if (getDistanceToSegment2d(point, previous, current) <= tolerance) {
      return true;
    }
    if (
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y + Number.EPSILON) +
          current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const getDistanceToPolygonEdges2d = (
  polygon: readonly Point2[],
  point: Point2
): number =>
  polygon.length < 2
    ? 0
    : Math.min(
        ...edgesOf(polygon).map(([start, end]) =>
          getDistanceToSegment2d(point, start, end)
        )
      );

const signedDistance = (polygon: readonly Point2[], point: Point2) =>
  (isPointInsidePolygon2d(polygon, point) ? 1 : -1) *
  getDistanceToPolygonEdges2d(polygon, point);

const boundsOf = (polygon: readonly Point2[]) => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
};

/** The inside grid sample farthest from the outline. */
const sampleDeepestPoint2d = (
  polygon: readonly Point2[],
  grid = POLYGON_2D_DEFAULTS.interiorSampleGrid
): InscribedPoint2d | null => {
  const { minX, minY, width, height } = boundsOf(polygon);
  if (width <= 0 || height <= 0) return null;
  const steps = Math.max(
    POLYGON_2D_DEFAULTS.minInteriorSampleGrid,
    Math.floor(grid)
  );
  let best: InscribedPoint2d | null = null;
  for (let row = 0; row <= steps; row += 1) {
    for (let column = 0; column <= steps; column += 1) {
      const center = {
        x: minX + (width * column) / steps,
        y: minY + (height * row) / steps,
      };
      if (!isPointInsidePolygon2d(polygon, center)) continue;
      const radius = getDistanceToPolygonEdges2d(polygon, center);
      if (!best || radius > best.radius) best = { center, radius };
    }
  }
  return best;
};

type Cell = { x: number; y: number; h: number; d: number; max: number };

/** Pole of inaccessibility (polylabel): the inside point farthest from the outline. */
export const findLargestInscribedPoint2d = (
  polygon: readonly Point2[],
  precision = POLYGON_2D_DEFAULTS.polylabelPrecision,
  maxCells = POLYGON_2D_DEFAULTS.polylabelMaxCells
): InscribedPoint2d | null => {
  if (
    polygon.length < 3 ||
    polygon.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    return null;
  }
  const { minX, minY, width, height } = boundsOf(polygon);
  const cellSize = Math.min(width, height);
  if (width <= 0 || height <= 0 || cellSize <= POLYGON_2D_DEFAULTS.epsilon) {
    return null;
  }
  const cell = (x: number, y: number, h: number): Cell => {
    const d = signedDistance(polygon, { x, y });
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  for (let x = minX; x < minX + width; x += cellSize) {
    for (let y = minY; y < minY + height; y += cellSize) {
      queue.push(cell(x + cellSize / 2, y + cellSize / 2, cellSize / 2));
    }
  }
  const centroid = getPolygonCentroid2d({
    points: polygon,
    degenerateAreaEpsilon: POLYGON_2D_DEFAULTS.epsilon,
  });
  const middle = cell(minX + width / 2, minY + height / 2, 0);
  let best = centroid ? cell(centroid.x, centroid.y, 0) : middle;
  if (middle.d > best.d) best = middle;
  const minPrecision = Math.max(0.1, precision);
  for (
    let processed = 0;
    queue.length > 0 && processed < maxCells;
    processed += 1
  ) {
    const index = queue.reduce(
      (top, candidate, i) => (candidate.max > queue[top]!.max ? i : top),
      0
    );
    const [current] = queue.splice(index, 1);
    if (!current) break;
    if (current.d > best.d) best = current;
    if (current.max - best.d <= minPrecision) continue;
    const h = current.h / 2;
    queue.push(
      cell(current.x - h, current.y - h, h),
      cell(current.x + h, current.y - h, h),
      cell(current.x - h, current.y + h, h),
      cell(current.x + h, current.y + h, h)
    );
  }
  return Number.isFinite(best.d) && best.d > 0
    ? { center: { x: best.x, y: best.y }, radius: best.d }
    : sampleDeepestPoint2d(polygon);
};

/**
 * Mean value coordinates of an inside point: corner weights that rebuild the
 * point from the corners of any simple polygon. Null on a corner or edge.
 */
export const getMeanValueWeights2d = (
  point: Point2,
  polygon: readonly Point2[]
): number[] | null => {
  const toCorner = polygon.map((corner) => ({
    x: corner.x - point.x,
    y: corner.y - point.y,
  }));
  const lengths = toCorner.map((vector) => Math.hypot(vector.x, vector.y));
  if (lengths.some((length) => length < 1e-9)) return null;
  const halfTangents = toCorner.map((vector, index) => {
    const next = toCorner[(index + 1) % toCorner.length]!;
    return Math.tan(
      Math.atan2(
        vector.x * next.y - vector.y * next.x,
        vector.x * next.x + vector.y * next.y
      ) / 2
    );
  });
  const weights = lengths.map(
    (length, index) =>
      (halfTangents[(index - 1 + lengths.length) % lengths.length]! +
        halfTangents[index]!) /
      length
  );
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!Number.isFinite(sum) || Math.abs(sum) < 1e-12) return null;
  return weights.map((weight) => weight / sum);
};

/** The point the weights describe in that polygon. */
export const applyPolygonWeights2d = (
  weights: readonly number[],
  polygon: readonly Point2[]
): Point2 =>
  polygon.reduce(
    (sum, corner, index) =>
      addPoint2d(sum, scalePoint2d(corner, weights[index] ?? 0)),
    { x: 0, y: 0 }
  );

/** Andrew's monotone chain; collinear points dropped. */
export const getConvexHull2d = <T extends Point2>(
  points: readonly T[]
): T[] => {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: T, a: T, b: T) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const chain = (ordered: readonly T[]) =>
    ordered.reduce<T[]>((hull, point) => {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0
      ) {
        hull.pop();
      }
      hull.push(point);
      return hull;
    }, []);
  const lower = chain(sorted);
  const upper = chain([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};
