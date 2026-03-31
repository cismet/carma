import { clamp, shortestAngleDelta } from "@carma/math";
import {
  Cartesian3,
  Ellipsoid,
  Matrix3,
  Matrix4,
  Quaternion,
  type Camera,
  type Scene,
} from "../../cesium";
import { applyRollToHeadingForCameraNearNadir } from "../camera";
import { degToRadNumeric, PI_OVER_TWO } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { readCachedCesiumSceneCenter } from "./per-frame-cache";

export type CesiumCompassNeedleOrientationDeg = {
  headingDeg: number;
  pitchDeg: number;
};

export type CesiumCompassDragSession = {
  orbitCenter: Cartesian3 | null;
  rangeM: number | null;
  orbitUp: Cartesian3;
  startHeadingRad: Radians;
  startPitchRad: Radians;
  startCameraPosition: Cartesian3;
  startCameraDirection: Cartesian3;
  startCameraUp: Cartesian3;
  startCameraRight: Cartesian3;
};

export const MIN_CESIUM_COMPASS_PITCH_RAD = degToRadNumeric(-90)! as Radians;
export const MAX_CESIUM_COMPASS_PITCH_DEG = 85;

const readCameraBasisVector = (
  value: Cartesian3 | undefined,
  fallback: Cartesian3
) => Cartesian3.clone(value ?? fallback, new Cartesian3());

const readReferenceUp = (camera: Camera, orbitCenter: Cartesian3 | null) => {
  if (orbitCenter) {
    return Ellipsoid.WGS84.geodeticSurfaceNormal(orbitCenter, new Cartesian3());
  }

  return Ellipsoid.WGS84.geodeticSurfaceNormal(
    camera.positionWC,
    new Cartesian3()
  );
};

const rotateVectorByQuaternion = (
  vector: Cartesian3,
  quaternion: Quaternion
) => {
  const rotationMatrix = Matrix3.fromQuaternion(quaternion, new Matrix3());
  return Matrix3.multiplyByVector(rotationMatrix, vector, new Cartesian3());
};

const orthonormalizeOrientation = (
  direction: Cartesian3,
  up: Cartesian3
): {
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
} => {
  const normalizedDirection = Cartesian3.normalize(direction, new Cartesian3());
  const provisionalRight = Cartesian3.cross(
    normalizedDirection,
    up,
    new Cartesian3()
  );
  const normalizedRight =
    Cartesian3.magnitudeSquared(provisionalRight) > 0
      ? Cartesian3.normalize(provisionalRight, new Cartesian3())
      : Cartesian3.UNIT_X;
  const normalizedUp = Cartesian3.normalize(
    Cartesian3.cross(normalizedRight, normalizedDirection, new Cartesian3()),
    new Cartesian3()
  );

  return {
    direction: normalizedDirection,
    up: normalizedUp,
    right: normalizedRight,
  };
};

export const fromCompassPitchDegToCesiumPitchRad = (
  pitchDeg: number,
  maxPitchDeg = MAX_CESIUM_COMPASS_PITCH_DEG
): Radians =>
  clamp(
    degToRadNumeric(clamp(pitchDeg, 0, maxPitchDeg)) - PI_OVER_TWO,
    MIN_CESIUM_COMPASS_PITCH_RAD,
    0
  ) as Radians;

export const beginCesiumCompassDrag = (
  scene: Scene
): CesiumCompassDragSession => {
  const orbitCenter = readCachedCesiumSceneCenter(scene);
  const rangeM =
    orbitCenter !== null
      ? Cartesian3.distance(orbitCenter, scene.camera.positionWC)
      : null;

  return {
    orbitCenter,
    rangeM,
    orbitUp: readReferenceUp(scene.camera, orbitCenter),
    startHeadingRad: applyRollToHeadingForCameraNearNadir(scene.camera),
    startPitchRad: scene.camera.pitch as Radians,
    startCameraPosition: readCameraBasisVector(
      scene.camera.positionWC,
      scene.camera.position
    ),
    startCameraDirection: readCameraBasisVector(
      scene.camera.directionWC,
      scene.camera.direction
    ),
    startCameraUp: readCameraBasisVector(scene.camera.upWC, scene.camera.up),
    startCameraRight: readCameraBasisVector(
      scene.camera.rightWC,
      scene.camera.right
    ),
  };
};

export const applyCesiumCompassBearingPitch = (
  scene: Scene,
  session: CesiumCompassDragSession,
  orientation: CesiumCompassNeedleOrientationDeg,
  {
    maxPitchDeg = MAX_CESIUM_COMPASS_PITCH_DEG,
  }: {
    maxPitchDeg?: number;
  } = {}
) => {
  const targetHeadingRad = degToRadNumeric(orientation.headingDeg) as Radians;
  const targetPitchRad = fromCompassPitchDegToCesiumPitchRad(
    orientation.pitchDeg,
    maxPitchDeg
  );
  const headingDeltaRad = shortestAngleDelta(
    session.startHeadingRad,
    targetHeadingRad
  ) as Radians;
  const pitchDeltaRad = (targetPitchRad - session.startPitchRad) as Radians;

  const headingRotation = Quaternion.fromAxisAngle(
    session.orbitUp,
    headingDeltaRad,
    new Quaternion()
  );
  const headingAdjustedDirection = rotateVectorByQuaternion(
    session.startCameraDirection,
    headingRotation
  );
  const headingAdjustedUp = rotateVectorByQuaternion(
    session.startCameraUp,
    headingRotation
  );
  const headingAdjustedRight = rotateVectorByQuaternion(
    session.startCameraRight,
    headingRotation
  );

  const pitchRotation = Quaternion.fromAxisAngle(
    headingAdjustedRight,
    pitchDeltaRad,
    new Quaternion()
  );
  const nextDirection = rotateVectorByQuaternion(
    headingAdjustedDirection,
    pitchRotation
  );
  const nextUp = rotateVectorByQuaternion(headingAdjustedUp, pitchRotation);
  const normalizedOrientation = orthonormalizeOrientation(
    nextDirection,
    nextUp
  );

  if (session.orbitCenter && typeof session.rangeM === "number") {
    const startOffset = Cartesian3.subtract(
      session.startCameraPosition,
      session.orbitCenter,
      new Cartesian3()
    );
    const headingAdjustedOffset = rotateVectorByQuaternion(
      startOffset,
      headingRotation
    );
    const nextOffset = rotateVectorByQuaternion(
      headingAdjustedOffset,
      pitchRotation
    );

    scene.camera.position = Cartesian3.add(
      session.orbitCenter,
      nextOffset,
      new Cartesian3()
    );
  } else {
    scene.camera.position = Cartesian3.clone(
      session.startCameraPosition,
      new Cartesian3()
    );
  }

  scene.camera.direction = normalizedOrientation.direction;
  scene.camera.up = normalizedOrientation.up;
  scene.camera.right = normalizedOrientation.right;
  scene.requestRender();
};

export const endCesiumCompassDrag = (scene: Scene) => {
  try {
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
  } catch {
    // Ignore transient teardown races.
  }

  scene.requestRender();
};
