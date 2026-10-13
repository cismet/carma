import { Vector3 } from "three";
import { clamp } from "@carma-commons/math";
import type { Vector3Arr } from "@carma-commons/math";
import { radToDegNumeric } from "@carma-units";
import type {
  BasicObliqueImageRecord,
  ObliquePose,
  UpVectorMapping,
} from "../types";
import { calculateUTMConvergence } from "./utmConvergence";

/** Angles describe a continuous physical direction; cardinal labels never constrain it. */
export const poseAnglesFromEnu = (
  direction: Vector3Arr,
  up: Vector3Arr
): { bearingDeg: number; pitchDeg: number; rollDeg: number } => {
  const dir = new Vector3(...direction).normalize();
  const imageUp = new Vector3(...up).normalize();
  const worldUp = new Vector3(0, 0, 1);
  const levelUp = worldUp.clone().addScaledVector(dir, -worldUp.dot(dir));
  // At nadir bearing has no geometric meaning; use the image's up for a stable roll frame.
  if (levelUp.lengthSq() < 1e-12) levelUp.set(0, 1, 0);
  levelUp.normalize();
  const right = new Vector3().crossVectors(dir, levelUp).normalize();
  return {
    bearingDeg: radToDegNumeric(Math.atan2(dir.x, dir.y)),
    pitchDeg: radToDegNumeric(Math.acos(clamp(-dir.z, -1, 1))),
    rollDeg: radToDegNumeric(
      Math.atan2(imageUp.dot(right), imageUp.dot(levelUp))
    ),
  };
};

/** Raw INPHO rows map grid/world coordinates into camera image-mm axes. */
export const computePose = (
  record: BasicObliqueImageRecord,
  [longitude, latitude]: [number, number],
  upMapping: UpVectorMapping = { rowIndex: 1, negate: false },
  imageUpInCamera?: Vector3Arr
): ObliquePose => {
  const convergence = calculateUTMConvergence(longitude, latitude);
  const direction = new Vector3(...record.m[2]).negate();
  const up = imageUpInCamera
    ? new Vector3(...record.m[0])
        .multiplyScalar(imageUpInCamera[0])
        .addScaledVector(new Vector3(...record.m[1]), imageUpInCamera[1])
        .addScaledVector(new Vector3(...record.m[2]), imageUpInCamera[2])
    : new Vector3(...record.m[upMapping.rowIndex]).multiplyScalar(
        upMapping.negate ? 1 : -1
      );
  const gridUp = new Vector3(0, 0, 1);
  direction.applyAxisAngle(gridUp, -convergence).normalize();
  up.applyAxisAngle(gridUp, -convergence).normalize();
  const directionArray = direction.toArray() as Vector3Arr;
  const upArray = up.toArray() as Vector3Arr;
  return {
    longitude,
    latitude,
    z: record.z,
    ...poseAnglesFromEnu(directionArray, upArray),
    direction: directionArray,
    up: upArray,
    utmConvergenceRad: convergence,
  };
};
