import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  type Scene,
} from "@carma/cesium";
import { isFiniteNumber } from "@carma/math";
import { getPointsFromCartographicAndHeadingPitchRange } from "@carma-mapping/engines/cesium/api";
import type { SceneStateHashSnapshot } from "@carma-providers/hash-state";

export const DEFAULT_HASH_RANGE_M = 750;

const CAMERA_DIRECTION_EPSILON = 1e-9;

const readEllipsoidalUpAtAnchor = (anchorECEF: Cartesian3): Cartesian3 =>
  Cartesian3.normalize(anchorECEF, new Cartesian3());

export const buildObjectCentricCameraOrientation = (
  cameraState: SceneStateHashSnapshot
): {
  destination: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  fovRad?: number;
} | null => {
  const anchorCartographic = Cartographic.fromDegrees(
    cameraState.anchor.lngDeg,
    cameraState.anchor.latDeg,
    cameraState.anchor.heightM
  );
  const anchorECEF = Cartographic.toCartesian(
    anchorCartographic,
    Ellipsoid.WGS84,
    new Cartesian3()
  );
  if (!anchorECEF) {
    return null;
  }

  const bearingRad = cameraState.orientation.bearingRad ?? 0;
  const pitchRad = cameraState.orientation.pitchRad ?? 0;
  const range = Math.max(
    0.01,
    cameraState.orientation.rangeM ?? DEFAULT_HASH_RANGE_M
  );

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchorCartographic,
    headingPitchRange: new HeadingPitchRange(bearingRad, pitchRad, range),
  });
  if (!points) {
    return null;
  }

  const destination = points.cameraPositionECEF;
  const directionToAnchor = Cartesian3.subtract(
    points.referencePointECEF,
    destination,
    new Cartesian3()
  );
  if (
    Cartesian3.magnitudeSquared(directionToAnchor) <= CAMERA_DIRECTION_EPSILON
  ) {
    return null;
  }

  const direction = Cartesian3.normalize(directionToAnchor, new Cartesian3());
  const upAnchor = readEllipsoidalUpAtAnchor(points.referencePointECEF);
  const right = Cartesian3.normalize(
    Cartesian3.cross(direction, upAnchor, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitudeSquared(right) <= CAMERA_DIRECTION_EPSILON) {
    return null;
  }

  const up = Cartesian3.normalize(
    Cartesian3.cross(right, direction, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitudeSquared(up) <= CAMERA_DIRECTION_EPSILON) {
    return null;
  }

  return {
    destination,
    direction,
    up,
    ...(isFiniteNumber(cameraState.orientation.fovVerticalRad)
      ? { fovRad: cameraState.orientation.fovVerticalRad }
      : {}),
  };
};

export const applyObjectCentricCameraSnapshotToScene = ({
  scene,
  snapshot,
}: {
  scene: Scene;
  snapshot: SceneStateHashSnapshot;
}): boolean => {
  const orientation = buildObjectCentricCameraOrientation(snapshot);
  if (!orientation) {
    return false;
  }

  scene.camera.lookAtTransform(Matrix4.IDENTITY);
  scene.camera.setView({
    destination: orientation.destination,
    orientation: {
      direction: orientation.direction,
      up: orientation.up,
    },
  });

  if (
    isFiniteNumber(orientation.fovRad) &&
    scene.camera.frustum instanceof PerspectiveFrustum
  ) {
    scene.camera.frustum.fov = orientation.fovRad;
  }

  scene.requestRender();
  return true;
};
