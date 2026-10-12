import {
  applyPolygonWeights2d,
  doSegmentsIntersect2d,
  findLargestInscribedPoint2d,
  getMeanValueWeights2d,
  isPointInsidePolygon2d,
} from "@carma-commons/math";
import { computePolygonCentroid2D } from "@carma-mapping/annotations/core";
import type { CssPixelPosition, CssPixels } from "@carma-units";

/**
 * Where an area's value fits inside its projected outline. The last spot is
 * kept while it fits (carried with the outline as mean value weights), then
 * the centroid, the deepest point and a grid nearest the centroid are tried.
 * A label that left the area needs a margin to come back.
 */
export type AreaLabelFit = {
  fits: boolean;
  position: CssPixelPosition | null;
  /** the spot relative to the outline's corners; null while it is the centroid */
  weights: readonly number[] | null;
};

export const AREA_LABEL_FIT_DEFAULTS = Object.freeze({
  reenterMarginPx: 2 as CssPixels,
  candidateSamples: 10,
});

const SEGMENT_EPSILON = 1e-9;

const asPosition = (x: number, y: number) => ({ x, y } as CssPixelPosition);

/** Whether a box of that size centred there lies inside the outline. */
export const doesBoxFitInPolygon = (
  center: CssPixelPosition,
  width: number,
  height: number,
  polygon: readonly CssPixelPosition[],
  marginPx = 0
): boolean => {
  const halfWidth = width / 2 + marginPx;
  const halfHeight = height / 2 + marginPx;
  const corners = [
    asPosition(center.x - halfWidth, center.y - halfHeight),
    asPosition(center.x + halfWidth, center.y - halfHeight),
    asPosition(center.x + halfWidth, center.y + halfHeight),
    asPosition(center.x - halfWidth, center.y + halfHeight),
  ];
  return (
    corners.every((corner) => isPointInsidePolygon2d(polygon, corner)) &&
    polygon.every((a, i) =>
      corners.every(
        (c, k) =>
          !doSegmentsIntersect2d(
            a,
            polygon[(i + 1) % polygon.length]!,
            c,
            corners[(k + 1) % 4]!,
            SEGMENT_EPSILON
          )
      )
    )
  );
};

const boundingGrid = (polygon: readonly CssPixelPosition[]) => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const samples = AREA_LABEL_FIT_DEFAULTS.candidateSamples;
  return Array.from({ length: (samples - 1) ** 2 }, (_, index) =>
    asPosition(
      minX + ((maxX - minX) * ((index % (samples - 1)) + 1)) / samples,
      minY + ((maxY - minY) * (Math.floor(index / (samples - 1)) + 1)) / samples
    )
  );
};

export const resolveAreaLabelFit = ({
  polygon,
  width,
  height,
  previous,
}: {
  polygon: readonly CssPixelPosition[] | null;
  width: number;
  height: number;
  previous?: AreaLabelFit | null;
}): AreaLabelFit => {
  const none: AreaLabelFit = { fits: false, position: null, weights: null };
  if (!polygon || polygon.length < 3) return none;
  const centroid = computePolygonCentroid2D(polygon);
  const fitsAt = (spot: CssPixelPosition | null, margin = 0) =>
    Boolean(spot) && doesBoxFitInPolygon(spot!, width, height, polygon, margin);
  if (previous?.fits) {
    const kept =
      previous.weights?.length === polygon.length
        ? (applyPolygonWeights2d(previous.weights, polygon) as CssPixelPosition)
        : centroid;
    if (fitsAt(kept)) {
      return { fits: true, position: kept, weights: previous.weights };
    }
  }
  const margin = previous?.fits ? 0 : AREA_LABEL_FIT_DEFAULTS.reenterMarginPx;
  if (centroid && fitsAt(centroid, margin)) {
    return { fits: true, position: centroid, weights: null };
  }
  // a wide box often fits off the centroid: take the fitting spot nearest it
  const reference = centroid ?? polygon[0]!;
  const deepest = findLargestInscribedPoint2d(polygon)?.center as
    | CssPixelPosition
    | undefined;
  const best = [...(deepest ? [deepest] : []), ...boundingGrid(polygon)]
    .filter((candidate) => fitsAt(candidate, margin))
    .sort(
      (a, b) =>
        Math.hypot(a.x - reference.x, a.y - reference.y) -
        Math.hypot(b.x - reference.x, b.y - reference.y)
    )[0];
  return best
    ? {
        fits: true,
        position: best,
        weights: getMeanValueWeights2d(best, polygon),
      }
    : none;
};
