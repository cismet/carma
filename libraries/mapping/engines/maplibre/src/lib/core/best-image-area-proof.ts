import { Box3, Vector3 } from "three";
import type { MapStyleAxisBoundarySite } from "./shared-three-scene-types";

/** Admission cells and ownership certificates share a fixed metric lattice. */
export const BEST_IMAGE_AREA_CELL_METERS = 64;

export const bestImageAreaCell = (point: Vector3): Box3 | null => {
  if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
  const coordinates = [point.x, point.y, point.z].map((value) =>
    Math.floor(value / BEST_IMAGE_AREA_CELL_METERS)
  );
  if (!coordinates.every(Number.isSafeInteger)) return null;
  const min = new Vector3(
    ...(coordinates as [number, number, number])
  ).multiplyScalar(BEST_IMAGE_AREA_CELL_METERS);
  return new Box3(min, min.clone().addScalar(BEST_IMAGE_AREA_CELL_METERS));
};

const covers = (site: MapStyleAxisBoundarySite, box: Box3) => {
  const m = site.sceneToImage.elements;
  // Linear homogeneous half spaces attain their minima at box corners. Strict
  // roundoff margins deliberately leave sensor-edge cells uncertified.
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const component = (row: number) =>
          m[row] * x + m[row + 4] * y + m[row + 8] * z + m[row + 12];
        const magnitude = (row: number) =>
          Math.abs(m[row] * x) +
          Math.abs(m[row + 4] * y) +
          Math.abs(m[row + 8] * z) +
          Math.abs(m[row + 12]);
        const u = component(0),
          v = component(1),
          w = component(3);
        const margin =
          64 *
          Number.EPSILON *
          Math.max(1, magnitude(0) + magnitude(1) + 2 * magnitude(3));
        if (
          ![u, v, w, margin].every(Number.isFinite) ||
          Math.min(w, u, v, w - u, w - v) <= margin
        )
          return false;
      }
  return true;
};

const cosineBounds = (site: MapStyleAxisBoundarySite, box: Box3) => {
  const centre = box.getCenter(new Vector3());
  const ray = centre.clone().sub(site.eye);
  const distance = ray.length(),
    directionLength = site.direction.length();
  const magnitude = Math.max(
    1,
    ...centre.toArray().map(Math.abs),
    ...site.eye.toArray().map(Math.abs),
    ...box.min.toArray().map(Math.abs),
    ...box.max.toArray().map(Math.abs)
  );
  const radius =
    box.getSize(new Vector3()).length() * 0.5 +
    128 * Number.EPSILON * magnitude;
  if (
    !(distance > radius && directionLength > 0) ||
    ![distance, radius, directionLength].every(Number.isFinite)
  )
    return { min: -1, max: 1 };
  const product = ray.dot(site.direction),
    denominator = distance * directionLength;
  if (![product, denominator].every(Number.isFinite) || !(denominator > 0))
    return { min: -1, max: 1 };
  const cosine = Math.max(-1, Math.min(1, product / denominator));
  // A sphere enclosing the entire cell bounds its angular cone. Widen both
  // ends for trig/normalization rounding; ambiguity never certifies an owner.
  const theta = Math.acos(cosine),
    delta = Math.asin(radius / distance) + 1e-7;
  if (![theta, delta].every(Number.isFinite)) return { min: -1, max: 1 };
  return {
    min: Math.max(-1, Math.cos(Math.min(Math.PI, theta + delta)) - 1e-12),
    max: Math.min(1, Math.cos(Math.max(0, theta - delta)) + 1e-12),
  };
};

/** A proof over a whole cell, never its centre sample. The indices must admit
 * every sensor intersecting this box. Undefined means exact point scoring is
 * still required; equal-score cells cannot be assigned to one fixed owner. */
export function* certifyBestImageAreaOwner(
  sites: readonly MapStyleAxisBoundarySite[],
  indices: Uint32Array,
  box: Box3
): Generator<void, number | undefined> {
  let candidate: number | undefined,
    lower = -Infinity;
  const bounds = new Map<number, { min: number; max: number }>();
  for (const index of indices) {
    const site = sites[index];
    if (!site) return undefined;
    const interval = cosineBounds(site, box);
    bounds.set(index, interval);
    if (interval.min > lower && covers(site, box)) {
      lower = interval.min;
      candidate = index;
    }
    yield;
  }
  if (candidate === undefined) return undefined;
  for (const [index, interval] of bounds)
    if (index !== candidate && !(lower > interval.max)) return undefined;
  return candidate;
}
