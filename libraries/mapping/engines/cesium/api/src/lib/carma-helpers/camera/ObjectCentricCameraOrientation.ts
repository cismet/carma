import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  type Scene,
} from "../../cesium";
import { writePerspectiveFrustumVerticalFov } from "./PerspectiveFrustumFov";
import { getPointsFromCartographicAndHeadingPitchRange } from "../Transforms";

export type ObjectCentricCameraViewInput = {
  anchorLngRad: number;
  anchorLatRad: number;
  anchorHeightM: number;
  bearingRad?: number;
  pitchRad?: number;
  rangeM?: number;
  fovVerticalRad?: number;
};

export type ObjectCentricCameraOrientation = {
  destination: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  fovRad?: number;
};

export type ObjectCentricCameraViewOptions = {
  defaultRangeM?: number;
  minRangeM?: number;
};

const CAMERA_DIRECTION_EPSILON = 1e-9;
const DEFAULT_MIN_RANGE_M = 0.01;
export const DEFAULT_OBJECT_CENTRIC_RANGE_M = 750;

const readEllipsoidalUpAtEnuOrigin = (enuOriginECEF: Cartesian3): Cartesian3 =>
  Cartesian3.normalize(enuOriginECEF, new Cartesian3());

export const buildObjectCentricCameraOrientation = (
  view: ObjectCentricCameraViewInput,
  options: ObjectCentricCameraViewOptions = {}
): ObjectCentricCameraOrientation | null => {
  const defaultRangeM = options.defaultRangeM ?? DEFAULT_OBJECT_CENTRIC_RANGE_M;
  const minRangeM = options.minRangeM ?? DEFAULT_MIN_RANGE_M;

  const anchorCartographic = Cartographic.fromRadians(
    view.anchorLngRad,
    view.anchorLatRad,
    view.anchorHeightM
  );
  const anchorECEF = Cartographic.toCartesian(
    anchorCartographic,
    Ellipsoid.WGS84,
    new Cartesian3()
  );
  if (!anchorECEF) {
    return null;
  }

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchorCartographic,
    headingPitchRange: new HeadingPitchRange(
      view.bearingRad ?? 0,
      view.pitchRad ?? 0,
      Math.max(minRangeM, view.rangeM ?? defaultRangeM)
    ),
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
  const upAnchor = readEllipsoidalUpAtEnuOrigin(anchorECEF);
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
    ...(Number.isFinite(view.fovVerticalRad)
      ? { fovRad: view.fovVerticalRad }
      : {}),
  };
};

export const applyObjectCentricCameraViewToScene = ({
  scene,
  view,
  options,
}: {
  scene: Scene;
  view: ObjectCentricCameraViewInput;
  options?: ObjectCentricCameraViewOptions;
}): boolean => {
  const orientation = buildObjectCentricCameraOrientation(view, options);
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

  const { fovRad } = orientation;
  if (
    typeof fovRad === "number" &&
    Number.isFinite(fovRad) &&
    scene.camera.frustum instanceof PerspectiveFrustum
  ) {
    writePerspectiveFrustumVerticalFov(scene.camera.frustum, fovRad);
  }

  scene.requestRender();
  return true;
};
