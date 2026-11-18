import { removeVector3ComponentAlongAxis } from "@carma-commons/math";
import { Vector3 } from "three";
import type { CameraAdapter, CameraPose, EcefVector } from "@carma-api";
import {
  DEFAULT_ECEF_CAMERA_FOV_Y,
  createLookAtEcefCameraPose,
  type EcefCameraPose,
} from "@carma-commons/camera/model";
import { PI, type Radians } from "@carma-units";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import {
  CAMERA_FLIGHT_DEFAULT_DURATION_MS,
  animateCameraPose,
  stopCameraPoseAnimation,
} from "../engine/camera-pose";

const isFiniteVector = (value: unknown): value is EcefVector =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((component) => Number.isFinite(component));

const toCameraPose = (pose: EcefCameraPose): CameraPose => ({
  position: pose.positionECEF.toArray() as EcefVector,
  direction: pose.directionECEF.toArray() as EcefVector,
  up: pose.upECEF.toArray() as EcefVector,
  fovY: pose.verticalFovRad,
});

/** A pose from outside, checked and made orthonormal; null when unusable. */
export const resolveCameraPose = (
  pose: CameraPose | null | undefined
): EcefCameraPose | null => {
  if (
    !pose ||
    !isFiniteVector(pose.position) ||
    !isFiniteVector(pose.direction) ||
    !isFiniteVector(pose.up) ||
    !(pose.fovY > 0 && pose.fovY < PI)
  ) {
    return null;
  }
  const direction = new Vector3(...pose.direction);
  if (!(direction.lengthSq() > 0)) return null;
  direction.normalize();
  const up = removeVector3ComponentAlongAxis(
    new Vector3(...pose.up),
    direction
  );
  if (!(up.lengthSq() > 0)) return null;
  return {
    positionECEF: new Vector3(...pose.position),
    directionECEF: direction,
    upECEF: up.normalize(),
    verticalFovRad: pose.fovY as Radians,
  };
};

/** The runtime's engine behind `carma.camera`. */
export const createCarmaCameraApiAdapter = (
  getEngine: () => AnnotationEngine | null
): Required<CameraAdapter> => {
  const engine = () => {
    const current = getEngine();
    return isValidAnnotationEngine(current) ? current : null;
  };
  const fly = (pose: EcefCameraPose | null, durationMs?: number) => {
    const current = engine();
    return current && pose
      ? animateCameraPose(current, pose, { durationMs })
      : Promise.resolve(false);
  };
  return {
    getPose: () => {
      const pose = engine()?.getCameraPose();
      return pose ? toCameraPose(pose) : null;
    },
    setPose: (pose) => {
      const current = engine();
      const resolved = resolveCameraPose(pose);
      if (!current || !resolved) return false;
      stopCameraPoseAnimation(current);
      return current.setCameraPose(resolved);
    },
    flyToPose: (pose, options = {}) =>
      fly(resolveCameraPose(pose), options.durationMs),
    lookAt: (eye, target, options = {}) =>
      isFiniteVector(eye) && isFiniteVector(target)
        ? fly(
            createLookAtEcefCameraPose(
              new Vector3(...eye),
              new Vector3(...target),
              (options.fovY as Radians | undefined) ??
                engine()?.getCameraPose()?.verticalFovRad ??
                DEFAULT_ECEF_CAMERA_FOV_Y
            ),
            options.durationMs ?? CAMERA_FLIGHT_DEFAULT_DURATION_MS
          )
        : Promise.resolve(false),
    stop: () => {
      const current = engine();
      if (current) stopCameraPoseAnimation(current);
    },
  };
};
