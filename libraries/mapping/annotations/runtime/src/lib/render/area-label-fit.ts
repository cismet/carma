/**
 * Whether an area's value fits inside the area on screen, and where. The
 * label is a box of the text's size; it fits where all four corners lie in
 * the projected outline and no edge of the outline crosses it. The search
 * keeps the last spot while it still fits, so the text does not wander from
 * frame to frame, then tries the area centroid, then the point deepest
 * inside the outline. A spot is remembered relative to the outline (mean
 * value coordinates of its corners), so it moves with the area under a
 * moving camera. A label that left the area comes back only with a margin
 * to spare, so it does not flicker at the threshold.
 */

export type ScreenPoint = { x: number; y: number };

export type AreaLabelFit = {
  fits: boolean;
  /** Centre of the label box while it fits. */
  position: ScreenPoint | null;
  /** The spot relative to the outline's corners; null while it is the centroid. */
  weights: readonly number[] | null;
};

export const AREA_LABEL_FIT_DEFAULTS = Object.freeze({
  /** Extra room a label needs before it moves back inside, in CSS pixels. */
  reenterMarginPx: 2,
  /** Candidate spots per side when neither centroid nor deepest point fits. */
  candidateSamples: 10,
  /** Samples per side of the coarse search for the deepest inside point. */
  gridSamples: 12,
});

export const isPointInPolygon = (
  point: ScreenPoint,
  polygon: readonly ScreenPoint[]
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const cross = (o: ScreenPoint, a: ScreenPoint, b: ScreenPoint) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const segmentsCross = (
  a: ScreenPoint,
  b: ScreenPoint,
  c: ScreenPoint,
  d: ScreenPoint
) => {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Whether a box of that size centred there lies inside the outline. */
export const doesBoxFitInPolygon = (
  center: ScreenPoint,
  width: number,
  height: number,
  polygon: readonly ScreenPoint[],
  marginPx = 0
): boolean => {
  const halfWidth = width / 2 + marginPx;
  const halfHeight = height / 2 + marginPx;
  const corners: ScreenPoint[] = [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ];
  if (!corners.every((corner) => isPointInPolygon(corner, polygon))) {
    return false;
  }
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (let k = 0; k < 4; k += 1) {
      if (segmentsCross(a, b, corners[k]!, corners[(k + 1) % 4]!)) {
        return false;
      }
    }
  }
  return true;
};

/** The area centroid of a simple polygon; the vertex mean for a degenerate one. */
export const getPolygonCentroid = (
  polygon: readonly ScreenPoint[]
): ScreenPoint | null => {
  if (polygon.length === 0) return null;
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const step = a.x * b.y - b.x * a.y;
    area += step;
    x += (a.x + b.x) * step;
    y += (a.y + b.y) * step;
  }
  if (Math.abs(area) < 1e-6) {
    return {
      x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
      y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
    };
  }
  return { x: x / (3 * area), y: y / (3 * area) };
};

const distanceToSegment = (
  point: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
          )
        )
      : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

const distanceToOutline = (
  point: ScreenPoint,
  polygon: readonly ScreenPoint[]
) => {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    nearest = Math.min(
      nearest,
      distanceToSegment(point, polygon[i]!, polygon[(i + 1) % polygon.length]!)
    );
  }
  return nearest;
};

/** The sampled inside point farthest from the outline, refined once around itself. */
export const getDeepestInsidePoint = (
  polygon: readonly ScreenPoint[],
  samples = AREA_LABEL_FIT_DEFAULTS.gridSamples
): ScreenPoint | null => {
  if (polygon.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const search = (
    left: number,
    top: number,
    width: number,
    height: number
  ): { point: ScreenPoint; depth: number } | null => {
    let best: { point: ScreenPoint; depth: number } | null = null;
    for (let row = 0; row <= samples; row += 1) {
      for (let column = 0; column <= samples; column += 1) {
        const point = {
          x: left + (width * column) / samples,
          y: top + (height * row) / samples,
        };
        if (!isPointInPolygon(point, polygon)) continue;
        const depth = distanceToOutline(point, polygon);
        if (!best || depth > best.depth) best = { point, depth };
      }
    }
    return best;
  };
  const coarse = search(minX, minY, maxX - minX, maxY - minY);
  if (!coarse) return null;
  const cellWidth = (maxX - minX) / samples;
  const cellHeight = (maxY - minY) / samples;
  const fine = search(
    coarse.point.x - cellWidth,
    coarse.point.y - cellHeight,
    cellWidth * 2,
    cellHeight * 2
  );
  return fine && fine.depth > coarse.depth ? fine.point : coarse.point;
};

/**
 * Mean value coordinates of an inside point: corner weights that rebuild the
 * point from the corners of any simple polygon. Null on a corner or edge.
 */
export const getMeanValueWeights = (
  point: ScreenPoint,
  polygon: readonly ScreenPoint[]
): number[] | null => {
  const count = polygon.length;
  const toCorner = polygon.map((corner) => ({
    x: corner.x - point.x,
    y: corner.y - point.y,
  }));
  const lengths = toCorner.map((vector) => Math.hypot(vector.x, vector.y));
  if (lengths.some((length) => length < 1e-9)) return null;
  const halfTangents = toCorner.map((vector, index) => {
    const next = toCorner[(index + 1) % count]!;
    const angle = Math.atan2(
      vector.x * next.y - vector.y * next.x,
      vector.x * next.x + vector.y * next.y
    );
    return Math.tan(angle / 2);
  });
  const weights = toCorner.map(
    (_, index) =>
      (halfTangents[(index - 1 + count) % count]! + halfTangents[index]!) /
      lengths[index]!
  );
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!Number.isFinite(sum) || Math.abs(sum) < 1e-12) return null;
  return weights.map((weight) => weight / sum);
};

const applyWeights = (
  weights: readonly number[],
  polygon: readonly ScreenPoint[]
): ScreenPoint => ({
  x: polygon.reduce(
    (sum, corner, index) => sum + corner.x * weights[index]!,
    0
  ),
  y: polygon.reduce(
    (sum, corner, index) => sum + corner.y * weights[index]!,
    0
  ),
});

export const resolveAreaLabelFit = ({
  polygon,
  width,
  height,
  previous,
}: {
  polygon: readonly ScreenPoint[] | null;
  width: number;
  height: number;
  previous?: AreaLabelFit | null;
}): AreaLabelFit => {
  const none: AreaLabelFit = { fits: false, position: null, weights: null };
  if (!polygon || polygon.length < 3) return none;
  const wasInside = previous?.fits === true;
  if (wasInside) {
    // the remembered spot, carried along with the outline
    const kept =
      previous?.weights && previous.weights.length === polygon.length
        ? applyWeights(previous.weights, polygon)
        : getPolygonCentroid(polygon);
    if (kept && doesBoxFitInPolygon(kept, width, height, polygon)) {
      return { fits: true, position: kept, weights: previous?.weights ?? null };
    }
  }
  const margin = wasInside ? 0 : AREA_LABEL_FIT_DEFAULTS.reenterMarginPx;
  const centroid = getPolygonCentroid(polygon);
  if (
    centroid &&
    doesBoxFitInPolygon(centroid, width, height, polygon, margin)
  ) {
    return { fits: true, position: centroid, weights: null };
  }
  // A wide box often fits off the centroid, e.g. toward a triangle's
  // base: take the fitting spot nearest the centroid.
  const candidates: ScreenPoint[] = [];
  const deepest = getDeepestInsidePoint(polygon);
  if (deepest) candidates.push(deepest);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const samples = AREA_LABEL_FIT_DEFAULTS.candidateSamples;
  for (let row = 1; row < samples; row += 1) {
    for (let column = 1; column < samples; column += 1) {
      candidates.push({
        x: minX + ((maxX - minX) * column) / samples,
        y: minY + ((maxY - minY) * row) / samples,
      });
    }
  }
  const reference = centroid ?? deepest;
  let best: ScreenPoint | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!doesBoxFitInPolygon(candidate, width, height, polygon, margin)) {
      continue;
    }
    const distance = reference
      ? Math.hypot(candidate.x - reference.x, candidate.y - reference.y)
      : 0;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best
    ? {
        fits: true,
        position: best,
        weights: getMeanValueWeights(best, polygon),
      }
    : none;
};
