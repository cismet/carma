import type { ProjectedCandidate, ScreenPoint } from "./types";

/**
 * Screen-space vector maths for the picking core.
 *
 * Everything here works on plain pixel coordinates and knows nothing about
 * maps, projections or geography. Directions are screen directions: `y` grows
 * downwards, so "up" is `(0, -1)` and a bearing never enters the calculation.
 */

/** Below this the two points are treated as one; guards the angle's division. */
const EPSILON = 1e-9;

export const subtract = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const dot = (a: ScreenPoint, b: ScreenPoint): number =>
  a.x * b.x + a.y * b.y;

/** z of the 2D cross product; its sign is the turn direction */
export const cross = (a: ScreenPoint, b: ScreenPoint): number =>
  a.x * b.y - a.y * b.x;

export const length = (v: ScreenPoint): number => Math.hypot(v.x, v.y);

export const normalize = (v: ScreenPoint): ScreenPoint => {
  const len = length(v);
  return len < EPSILON ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

/**
 * `v` rotated by `deg`, in the screen's coordinate system. Positive turns from
 * +x towards +y, which is clockwise on screen; the fan of `first-crossed` uses
 * it symmetrically, so the handedness does not matter there.
 */
export const rotate = (v: ScreenPoint, deg: number): ScreenPoint => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

/** Unsigned angle between two vectors in degrees, range [0, 180]. */
export const angleBetweenDeg = (a: ScreenPoint, b: ScreenPoint): number => {
  const lengths = length(a) * length(b);
  if (lengths < EPSILON) return 0;
  return (
    (Math.acos(Math.min(1, Math.max(-1, dot(a, b) / lengths))) * 180) / Math.PI
  );
};

/** Signed angle from `from` to `to` in degrees, range (-180, 180]. */
export const signedAngleDeg = (from: ScreenPoint, to: ScreenPoint): number =>
  (Math.atan2(cross(from, to), dot(from, to)) * 180) / Math.PI;

/** The point of segment `a`→`b` closest to `p`. */
export const nearestPointOnSegment = (
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint
): ScreenPoint => {
  const ab = subtract(b, a);
  const lengthSquared = dot(ab, ab);
  if (lengthSquared < EPSILON) return a;
  const t = Math.min(1, Math.max(0, dot(subtract(p, a), ab) / lengthSquared));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
};

/**
 * The point of a candidate's outline closest to `origin`.
 *
 * Measured against the whole outline, not a centroid: a large parcel sharing a
 * border with the origin is then at distance ~0 instead of being pushed away by
 * its own extent, and points, lines and polygons become comparable without any
 * special casing. Single-coordinate parts (point features) reduce to that
 * coordinate.
 */
export const nearestPointOfCandidate = (
  origin: ScreenPoint,
  candidate: ProjectedCandidate
): ScreenPoint | undefined => {
  let best: ScreenPoint | undefined;
  let bestDistanceSquared = Infinity;

  const consider = (point: ScreenPoint) => {
    const delta = subtract(point, origin);
    const distanceSquared = dot(delta, delta);
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      best = point;
    }
  };

  for (const part of candidate.parts) {
    if (part.length === 0) continue;
    if (part.length === 1) {
      consider(part[0]);
      continue;
    }
    for (let index = 1; index < part.length; index++) {
      consider(nearestPointOnSegment(origin, part[index - 1], part[index]));
    }
  }

  return best;
};

/**
 * Distance along the ray at which it first crosses a candidate's outline, or
 * `undefined` when it never does.
 *
 * The ray is `origin + t·direction` with `direction` a unit vector, so `t` is
 * already in pixels. A segment parallel to the ray is skipped rather than
 * guessed at — the degenerate case of a ray running exactly along a shared
 * border is what the three-ray fan is there for.
 */
export const firstCrossing = (
  origin: ScreenPoint,
  direction: ScreenPoint,
  candidate: ProjectedCandidate,
  maxDistance: number
): { t: number; point: ScreenPoint } | undefined => {
  let bestT = Infinity;

  for (const part of candidate.parts) {
    for (let index = 1; index < part.length; index++) {
      const a = part[index - 1];
      const b = part[index];
      const segment = subtract(b, a);
      const denominator = cross(direction, segment);
      if (Math.abs(denominator) < EPSILON) continue;
      const toA = subtract(a, origin);
      const t = cross(toA, segment) / denominator;
      const s = cross(toA, direction) / denominator;
      if (t > EPSILON && t <= maxDistance && s >= 0 && s <= 1 && t < bestT) {
        bestT = t;
      }
    }
  }

  if (bestT === Infinity) return undefined;
  return {
    t: bestT,
    point: {
      x: origin.x + direction.x * bestT,
      y: origin.y + direction.y * bestT,
    },
  };
};

/** An axis-aligned rectangle in screen pixels. */
export type ScreenBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export const boxOfPoints = (points: ScreenPoint[]): ScreenBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
};

const cornersOf = (box: ScreenBox): ScreenPoint[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY },
];

/**
 * Cheap rejection of a whole candidate from its bounding box alone, before its
 * rings are projected.
 *
 * Conservative by construction: it only rejects when *no* point of the box can
 * satisfy the gate, so a candidate it drops could not have won. The minimum
 * angle over a convex box seen from an outside point is attained at a corner,
 * unless the axis itself passes through the box, in which case it is zero.
 */
export const boxRejection = (
  box: ScreenBox,
  origin: ScreenPoint,
  axis: ScreenPoint,
  coneAngleDeg: number
): "behind-origin" | "outside-cone" | undefined => {
  const corners = cornersOf(box);

  const originInside =
    origin.x >= box.minX &&
    origin.x <= box.maxX &&
    origin.y >= box.minY &&
    origin.y <= box.maxY;
  if (originInside) return undefined;

  // every corner behind the origin means the whole box is behind it
  if (corners.every((corner) => dot(subtract(corner, origin), axis) <= 0)) {
    return "behind-origin";
  }

  const angles = corners.map((corner) =>
    signedAngleDeg(axis, subtract(corner, origin))
  );
  const min = Math.min(...angles);
  const max = Math.max(...angles);
  // the box straddles the axis, or wraps far enough that the signed angles are
  // no longer an interval: it may reach the axis, so keep it
  if ((min <= 0 && max >= 0) || max - min >= 180) return undefined;

  const smallest = Math.min(Math.abs(min), Math.abs(max));
  return smallest > coneAngleDeg ? "outside-cone" : undefined;
};
