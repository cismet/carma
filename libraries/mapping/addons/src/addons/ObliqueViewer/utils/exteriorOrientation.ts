import type { Vector3Arr } from "@carma-commons/math";

import type {
  BasicObliqueImageRecord,
  ObliquePose,
  UpVectorMapping,
} from "../types";
import { radToDeg } from "./orientation";
import { calculateUTMConvergence } from "./utmConvergence";

/**
 * From the served rotation matrix to a MapLibre pose.
 *
 * The matrix rows are in the dataset's grid frame (east, north, up of the UTM
 * grid). Row 2 points backwards along the optical axis, so the view direction
 * is its negation; which row is the image's up depends on how the camera was
 * mounted, hence the per-camera mapping. Both vectors are then turned by the
 * meridian convergence so they read against true north, which is what a
 * bearing is.
 */

const negate = (v: Vector3Arr): Vector3Arr => [-v[0], -v[1], -v[2]];

const normalize = (v: Vector3Arr): Vector3Arr => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : v;
};

const dot = (a: Vector3Arr, b: Vector3Arr): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: Vector3Arr, b: Vector3Arr): Vector3Arr => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** turn a grid-frame ENU vector against the convergence so it is true-north ENU */
const correctForUTMConvergence = (
  [x, y, z]: Vector3Arr,
  convergenceRad: number
): Vector3Arr => {
  const angle = -convergenceRad;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  return [x * cosAngle - y * sinAngle, x * sinAngle + y * cosAngle, z];
};

const WORLD_UP: Vector3Arr = [0, 0, 1];

/**
 * Bearing, pitch and roll of a camera looking along `direction` with the
 * image's top along `up`, both unit vectors in true-north ENU.
 *
 * Bearing is the compass direction of the horizontal part of `direction`,
 * pitch the angle from straight down (MapLibre's convention), and roll the
 * angle between the image's up and the up a level camera would have, signed
 * around the view direction. MapLibre's map stays unrolled; the roll is what
 * the preview image turns by instead.
 */
export const poseAnglesFromEnu = (
  direction: Vector3Arr,
  up: Vector3Arr
): { bearingDeg: number; pitchDeg: number; rollDeg: number } => {
  const dir = normalize(direction);
  const [east, north, upComponent] = dir;

  const bearingDeg = radToDeg(Math.atan2(east, north));
  const pitchDeg = radToDeg(Math.acos(Math.max(-1, Math.min(1, -upComponent))));

  // the up of a level camera looking the same way: world up with the part
  // along the view direction taken out
  const along = dot(WORLD_UP, dir);
  const levelUp = normalize([
    WORLD_UP[0] - along * dir[0],
    WORLD_UP[1] - along * dir[1],
    WORLD_UP[2] - along * dir[2],
  ]);
  const right = normalize(cross(dir, levelUp));
  const imageUp = normalize(up);
  const rollDeg = radToDeg(
    Math.atan2(dot(imageUp, right), dot(imageUp, levelUp))
  );

  return { bearingDeg, pitchDeg, rollDeg };
};

/**
 * The full pose of an image: where the camera stood and the angles the map
 * needs. Longitude and latitude come from the caller's CRS conversion so the
 * function stays free of proj4.
 */
export const computePose = (
  record: BasicObliqueImageRecord,
  [longitude, latitude]: [number, number],
  upMapping: UpVectorMapping = { rowIndex: 1, negate: false }
): ObliquePose => {
  const { z, m } = record;

  const upRow = m[upMapping.rowIndex];
  const gridUp = upMapping.negate ? negate(upRow) : upRow;
  // row 2 looks back along the optical axis
  const gridDirection = negate(m[2]);
  // the up row is negated the same way the direction is, so both stay in
  // the same handedness after the flip
  const gridUpNegated = negate(gridUp);

  const utmConvergenceRad = calculateUTMConvergence(longitude, latitude);
  const direction = normalize(
    correctForUTMConvergence(gridDirection, utmConvergenceRad)
  );
  const up = normalize(
    correctForUTMConvergence(gridUpNegated, utmConvergenceRad)
  );

  const { bearingDeg, pitchDeg, rollDeg } = poseAnglesFromEnu(direction, up);

  return {
    longitude,
    latitude,
    z,
    bearingDeg,
    pitchDeg,
    rollDeg,
    direction,
    up,
    utmConvergenceRad,
  };
};
