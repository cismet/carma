import {
  clipConvexPolygonByConvexPolygon2d,
  getPolygonCentroid2d,
  shortestAngleDelta,
  type Point2,
} from "@carma-commons/math";
import { getWebMercatorFromWgs84Deg } from "@carma-geo/proj";
import { PI_OVER_FOUR, type Degrees } from "@carma-units";
import type { ObliqueViewMode } from "../types";
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
};
export type FootprintPointQuery = {
  point: [number, number];
  headingRad: number;
  viewMode: ObliqueViewMode;
  activeImageId?: string | null;
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
/** Continuous +/-45 degrees; exact polygon overlap after a cheap bounds prefilter. */
export const selectViewportFootprints = (
  index: readonly IndexedFootprint[],
  query: FootprintViewportQuery
): string[] => {
  const viewport = query.corners.map(project);
  const center = project(query.center);
  if (
    viewport.length < 3 ||
    viewport.some((point) => !Number.isFinite(point.x + point.y)) ||
    !Number.isFinite(center.x + center.y + query.headingRad)
  )
    return [];
  const bounds = boundsOf(viewport);
  const candidates: { item: IndexedFootprint; distance: number }[] = [];
  for (const item of index) {
    if (item.bounds[0] > bounds[2]) break;
    if (
      item.bounds[2] < bounds[0] ||
      item.bounds[3] < bounds[1] ||
      item.bounds[1] > bounds[3]
    )
      continue;
    if (
      query.viewMode === "nadir"
        ? !item.nadir
        : item.nadir ||
          Math.abs(shortestAngleDelta(query.headingRad, item.headingRad)) >
            PI_OVER_FOUR
    )
      continue;
    candidates.push({
      item,
      distance:
        (item.center.x - center.x) ** 2 + (item.center.y - center.y) ** 2,
    });
  }
  candidates.sort(
    (a, b) => a.distance - b.distance || a.item.id.localeCompare(b.item.id)
  );
  const selected: string[] = [];
  for (const { item } of candidates) {
    if (
      clipConvexPolygonByConvexPolygon2d({
        subject: item.polygon,
        clip: viewport,
      }).length === 0
    )
      continue;
    selected.push(item.id);
    if (selected.length === MAX_VISIBLE_FOOTPRINTS) break;
  }
  return selected;
};

/** Nearest image-axis crossing among every direction-compatible viewport intersection. */
export const selectFootprintAtPoint = (
  index: readonly IndexedFootprint[],
  query: FootprintPointQuery
): string | null => {
  const point = project(query.point);
  if (!Number.isFinite(point.x + point.y + query.headingRad)) return null;
  const viewport = query.viewportCorners?.map(project);
  if (
    viewport &&
    (viewport.length < 3 ||
      viewport.some((point) => !Number.isFinite(point.x + point.y)))
  )
    return null;
  const bounds = viewport ? boundsOf(viewport) : null;
  let selected: string | null = null;
  let nearest = Infinity;
  for (const item of index) {
    if (bounds && item.bounds[0] > bounds[2]) break;
    if (
      bounds &&
      (item.bounds[2] < bounds[0] ||
        item.bounds[1] > bounds[3] ||
        item.bounds[3] < bounds[1])
    )
      continue;
    if (
      query.viewMode === "nadir"
        ? !item.nadir
        : item.nadir ||
          Math.abs(shortestAngleDelta(query.headingRad, item.headingRad)) >
            PI_OVER_FOUR
    )
      continue;
    if (
      viewport &&
      clipConvexPolygonByConvexPolygon2d({
        subject: item.polygon,
        clip: viewport,
      }).length === 0
    )
      continue;
    const distance =
      (item.axisIntersection.x - point.x) ** 2 +
      (item.axisIntersection.y - point.y) ** 2;
    if (
      distance < nearest ||
      (distance === nearest && item.id === query.activeImageId) ||
      (distance === nearest &&
        selected !== query.activeImageId &&
        (selected === null || item.id.localeCompare(selected) < 0))
    ) {
      selected = item.id;
      nearest = distance;
    }
  }
  return selected;
};
