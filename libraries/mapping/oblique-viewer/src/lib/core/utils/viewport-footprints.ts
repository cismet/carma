import {
  clipConvexPolygonByConvexPolygon2d,
  getPolygonCentroid2d,
  isPointInsideConvexPolygon2d,
  shortestAngleDelta,
  type Point2,
} from "@carma-commons/math";
import { getWebMercatorFromWgs84Deg } from "@carma-geo/proj";
import { PI_OVER_FOUR, type Degrees } from "@carma-units";
import type { ObliqueViewQuery, ObliqueViewMode } from "../types";
import { diagonalIntersection } from "./footprint-diagonal-intersection";

export const MAX_VISIBLE_FOOTPRINTS = 128;
export type ViewportFootprint = {
  id: string;
  ring: readonly [number, number][];
  headingRad: number;
  nadir: boolean;
};
export type FootprintViewportQuery = {
  corners: [number, number][];
  center: [number, number];
  headingRad: number;
  viewMode: ObliqueViewMode;
  /** The pointer when present; otherwise the viewport centre drives display. */
  point?: [number, number];
};
export type FootprintPointQuery = {
  point: [number, number];
  headingRad: number;
  viewMode: ObliqueViewMode;
  activeImageId?: string | null;
  /** DHHN2016 height from the live mesh/terrain pointer intersection. */
  heightMeters?: number;
  selectionStrategy?: ObliqueViewQuery["selectionStrategy"];
  viewportCorners?: [number, number][];
};
type IndexedFootprint = Omit<ViewportFootprint, "ring"> & {
  polygon: Point2[];
  center: Point2;
  axisIntersection: Point2;
  bounds: [number, number, number, number];
};
const project = ([longitude, latitude]: readonly [number, number]): Point2 => {
  const [x, y] = getWebMercatorFromWgs84Deg(
    longitude as Degrees,
    latitude as Degrees
  );
  return { x, y };
};
const boundsOf = (
  points: readonly Point2[]
): [number, number, number, number] => [
  Math.min(...points.map((point) => point.x)),
  Math.min(...points.map((point) => point.y)),
  Math.max(...points.map((point) => point.x)),
  Math.max(...points.map((point) => point.y)),
];
/** One-time worker preparation; no catalog-sized geometry is published to the scene. */
export const indexViewportFootprints = (
  catalog: readonly ViewportFootprint[]
): IndexedFootprint[] => {
  const result: IndexedFootprint[] = [];
  for (const item of catalog) {
    if (item.ring.length < 4 || !Number.isFinite(item.headingRad)) continue;
    const ring = [...item.ring];
    const last = ring[ring.length - 1];
    if (ring[0][0] === last[0] && ring[0][1] === last[1]) ring.pop();
    const polygon = ring.map(project);
    if (polygon.some((point) => !Number.isFinite(point.x + point.y))) continue;
    const center = getPolygonCentroid2d({ points: polygon });
    if (!center || !Number.isFinite(center.x + center.y)) continue;
    const intersection =
      polygon.length === 4
        ? diagonalIntersection(
            ...(polygon.map(({ x, y }) => [x, y]) as [
              [number, number],
              [number, number],
              [number, number],
              [number, number]
            ])
          )
        : null;
    result.push({
      id: item.id,
      headingRad: item.headingRad,
      nadir: item.nadir,
      polygon,
      center,
      axisIntersection: intersection
        ? { x: intersection[0], y: intersection[1] }
        : center,
      bounds: boundsOf(polygon),
    });
  }
  return result.sort(
    (a, b) => a.bounds[0] - b.bounds[0] || a.id.localeCompare(b.id)
  );
};
type FootprintCandidate = {
  item: IndexedFootprint;
  headingDelta: number;
  distance: number;
  coversPoint: boolean;
};

const candidatesAtPoint = (
  index: readonly IndexedFootprint[],
  point: Point2,
  headingRad: number,
  viewMode: ObliqueViewMode,
  viewport?: readonly Point2[]
): FootprintCandidate[] => {
  const bounds = viewport ? boundsOf(viewport) : null;
  const candidates: FootprintCandidate[] = [];
  for (const item of index) {
    if (bounds && item.bounds[0] > bounds[2]) break;
    if (
      bounds &&
      (item.bounds[2] < bounds[0] ||
        item.bounds[3] < bounds[1] ||
        item.bounds[1] > bounds[3])
    )
      continue;
    if (viewMode === "nadir" ? !item.nadir : item.nadir) continue;
    if (
      viewport &&
      clipConvexPolygonByConvexPolygon2d({
        subject: item.polygon,
        clip: viewport,
      }).length === 0
    )
      continue;
    candidates.push({
      item,
      headingDelta:
        viewMode === "nadir"
          ? 0
          : Math.abs(shortestAngleDelta(headingRad, item.headingRad)),
      distance:
        (item.axisIntersection.x - point.x) ** 2 +
        (item.axisIntersection.y - point.y) ** 2,
      coversPoint:
        point.x >= item.bounds[0] &&
        point.x <= item.bounds[2] &&
        point.y >= item.bounds[1] &&
        point.y <= item.bounds[3] &&
        isPointInsideConvexPolygon2d({ point, polygon: item.polygon }),
    });
  }
  return candidates;
};

/** The current sector is preferred while it has real hits; gaps expose all sectors. */
export const selectViewportFootprints = (
  index: readonly IndexedFootprint[],
  query: FootprintViewportQuery
): string[] => {
  const viewport = query.corners.map(project);
  const point = project(query.point ?? query.center);
  if (
    viewport.length < 3 ||
    viewport.some((point) => !Number.isFinite(point.x + point.y)) ||
    !Number.isFinite(point.x + point.y + query.headingRad)
  )
    return [];
  const candidates = candidatesAtPoint(
    index,
    point,
    query.headingRad,
    query.viewMode,
    viewport
  );
  const hasSectorHit = candidates.some(
    (candidate) =>
      candidate.coversPoint && candidate.headingDelta <= PI_OVER_FOUR
  );
  return candidates
    .filter(
      (candidate) => !hasSectorHit || candidate.headingDelta <= PI_OVER_FOUR
    )
    .sort(
      (a, b) =>
        (!hasSectorHit ? a.headingDelta - b.headingDelta : 0) ||
        a.distance - b.distance ||
        a.item.id.localeCompare(b.item.id)
    )
    .slice(0, MAX_VISIBLE_FOOTPRINTS)
    .map(({ item }) => item.id);
};

/** Actual sector hits precede proximity; gaps rank every sector by heading, then distance. */
export const footprintPointCandidates = (
  index: readonly IndexedFootprint[],
  query: FootprintPointQuery
): { ids: string[]; headingFirst: boolean } => {
  const point = project(query.point);
  if (!Number.isFinite(point.x + point.y + query.headingRad))
    return { ids: [], headingFirst: false };
  const viewport = query.viewportCorners?.map(project);
  if (
    viewport &&
    (viewport.length < 3 ||
      viewport.some((point) => !Number.isFinite(point.x + point.y)))
  )
    return { ids: [], headingFirst: false };
  const candidates = candidatesAtPoint(
    index,
    point,
    query.headingRad,
    query.viewMode,
    viewport
  );
  const hits = candidates.filter(
    (candidate) =>
      candidate.coversPoint && candidate.headingDelta <= PI_OVER_FOUR
  );
  const preferred = hits.length ? hits : candidates;
  preferred.sort(
    (a, b) =>
      (!hits.length ? a.headingDelta - b.headingDelta : 0) ||
      a.distance - b.distance ||
      Number(b.item.id === query.activeImageId) -
        Number(a.item.id === query.activeImageId) ||
      a.item.id.localeCompare(b.item.id)
  );
  return {
    ids: preferred.map(({ item }) => item.id),
    headingFirst: hits.length === 0,
  };
};

export const selectFootprintAtPoint = (
  index: readonly IndexedFootprint[],
  query: FootprintPointQuery
): string | null => {
  return footprintPointCandidates(index, query).ids[0] ?? null;
};
