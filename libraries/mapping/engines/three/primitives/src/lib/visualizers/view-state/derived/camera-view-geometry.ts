import {
  CAMERA_TYPE,
  readObjectCentricCameraBasis,
} from "@carma-commons/camera/model";
import {
  deriveOrbitAngles,
  type CommonViewState,
} from "@carma-mapping/engines-interop/view-sync";
import {
  clamp,
  isFiniteNumber,
  PI,
  PI_OVER_THREE,
  PI_OVER_TWO,
} from "@carma/math";
import { zeroToTwoPi } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { Vector3 } from "three";
import type { ResolvedViewStateVisualizerVisualizedOptions } from "../view-state-visualizer-types";
import { pointOnBearingCircle } from "./angle-cue-geometry";
import { buildCrosshairLinePoints } from "./crosshair-line-points";

const OPEN_FOV_EPSILON_RAD = 1e-6;

const normalizeBearing = (bearingRadians: number): number =>
  zeroToTwoPi(bearingRadians as Radians) as number;

const clampPerspectiveFovRad = (fovRadians: number): number =>
  clamp(fovRadians, OPEN_FOV_EPSILON_RAD, PI - OPEN_FOV_EPSILON_RAD);

const readHorizontalFov = (viewState: CommonViewState): number | null => {
  const fovHorizontal = viewState.intrinsics?.fovHorizontal;
  return isFiniteNumber(fovHorizontal)
    ? clampPerspectiveFovRad(fovHorizontal)
    : null;
};

const readVerticalFov = (viewState: CommonViewState): number | null => {
  const fovVertical = viewState.intrinsics?.fov;
  return isFiniteNumber(fovVertical)
    ? clampPerspectiveFovRad(fovVertical)
    : null;
};

const readImagePlaneDistance = ({
  viewState,
  visualized,
  distance,
  minHalfExtent,
  maxDistance,
  hemisphereRadius,
}: {
  viewState: CommonViewState;
  visualized: ResolvedViewStateVisualizerVisualizedOptions;
  distance: number;
  minHalfExtent: number;
  maxDistance: number;
  hemisphereRadius: number;
}): number =>
  clamp(
    visualized.imagePlaneDistance ?? distance,
    minHalfExtent,
    hemisphereRadius * maxDistance
  );

const clampImagePlaneHalfExtent = ({
  value,
  minHalfExtent,
}: {
  value: number;
  minHalfExtent: number;
}): number => Math.max(minHalfExtent, value);

export const viewingBearingPitchToCameraSpherePosition = ({
  viewingBearing,
  pitch,
  hemisphereRadius,
}: {
  viewingBearing: number;
  pitch: number;
  hemisphereRadius: number;
}): Vector3 => {
  const normalizedPitch = clamp(pitch, 0, PI_OVER_TWO);
  const cameraSphereAzimuth = normalizeBearing(viewingBearing + PI);
  return pointOnBearingCircle({
    bearing: cameraSphereAzimuth,
    radius: Math.sin(normalizedPitch) * hemisphereRadius,
    y: Math.cos(normalizedPitch) * hemisphereRadius,
  });
};

export const cameraSpherePositionToViewingBearingPitch = (
  position: Vector3
): { bearing: number; pitch: number; elevation: number } => {
  const normalized = position.clone().normalize();
  const elevation = Math.asin(clamp(normalized.y, -1, 1));
  const pitch = PI_OVER_TWO - elevation;
  const cameraSphereAzimuth = Math.atan2(normalized.x, -normalized.z);
  return {
    bearing: normalizeBearing(cameraSphereAzimuth - PI),
    pitch,
    elevation,
  };
};

export const computeUnitHemisphereCameraPosition = ({
  viewState,
  hemisphereRadius,
}: {
  viewState: CommonViewState;
  hemisphereRadius: number;
}): Vector3 =>
  (() => {
    const { bearing, pitch } = deriveOrbitAngles(viewState);
    return viewingBearingPitchToCameraSpherePosition({
      viewingBearing: bearing,
      pitch,
      hemisphereRadius,
    });
  })();

const resolveCameraBasis = ({
  viewState,
  hemisphereRadius,
}: {
  viewState: CommonViewState;
  hemisphereRadius: number;
}) => {
  const cameraPosition = computeUnitHemisphereCameraPosition({
    viewState,
    hemisphereRadius,
  });
  const { forward, right, up } = readObjectCentricCameraBasis(
    viewState.orientation
  );

  return {
    cameraPosition,
    forward,
    right,
    up,
  };
};

export type ViewStateVisualizerImagePlaneGeometry = {
  cameraPosition: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  imagePlaneCenter: Vector3;
  croppedImagePlaneCenter: Vector3;
  hasViewOffset: boolean;
  hasNonStandardViewOffset: boolean;
  imagePlaneCorners: [Vector3, Vector3, Vector3, Vector3];
  offsetImagePlaneCorners: [Vector3, Vector3, Vector3, Vector3] | null;
  fullImagePlaneCorners: [Vector3, Vector3, Vector3, Vector3];
  frustumEdges: [Vector3, Vector3][];
  imagePlaneAxisOrigin: Vector3;
  imagePlaneXAxisEnd: Vector3;
  imagePlaneYAxisEnd: Vector3;
  basisRightEnd: Vector3;
  basisUpEnd: Vector3;
  imagePlaneOriginX: [Vector3, Vector3];
  imagePlaneOriginY: [Vector3, Vector3];
};

export const buildImagePlaneGeometry = ({
  viewState,
  visualized,
  hemisphereRadius,
  imagePlaneDefaults,
  epsilon,
}: {
  viewState: CommonViewState;
  visualized: ResolvedViewStateVisualizerVisualizedOptions;
  hemisphereRadius: number;
  imagePlaneDefaults: {
    distance: number;
    basisLineLength: number;
    originHalfExtent: number;
    minHalfExtent: number;
    fallbackHalfHeight: number;
    fallbackHalfWidth: number;
    maxDistance: number;
  };
  epsilon: number;
}): ViewStateVisualizerImagePlaneGeometry => {
  const { cameraPosition, forward, right, up } = resolveCameraBasis({
    viewState,
    hemisphereRadius,
  });
  const fovVertical = readVerticalFov(viewState);
  const fovHorizontal = readHorizontalFov(viewState);
  const imagePlaneDistance = readImagePlaneDistance({
    viewState,
    visualized,
    distance: imagePlaneDefaults.distance,
    minHalfExtent: imagePlaneDefaults.minHalfExtent,
    maxDistance: imagePlaneDefaults.maxDistance,
    hemisphereRadius,
  });
  const type = viewState.intrinsics?.type ?? CAMERA_TYPE.PERSPECTIVE;
  const viewOffset = viewState.intrinsics?.viewOffset;
  const projectionMatrix = viewState.intrinsics?.projectionMatrix;
  const hasHorizontalViewOffset =
    !!viewOffset &&
    isFiniteNumber(viewOffset.fullWidth) &&
    isFiniteNumber(viewOffset.width) &&
    isFiniteNumber(viewOffset.offsetX) &&
    viewOffset.fullWidth > 0;
  const hasVerticalViewOffset =
    !!viewOffset &&
    isFiniteNumber(viewOffset.fullHeight) &&
    isFiniteNumber(viewOffset.height) &&
    isFiniteNumber(viewOffset.offsetY) &&
    viewOffset.fullHeight > 0;

  const imagePlaneCenter = cameraPosition
    .clone()
    .add(forward.clone().multiplyScalar(imagePlaneDistance));

  const projectionScaleX =
    type === CAMERA_TYPE.PERSPECTIVE && projectionMatrix
      ? Math.abs(projectionMatrix.elements[0])
      : null;
  const projectionScaleY =
    type === CAMERA_TYPE.PERSPECTIVE && projectionMatrix
      ? Math.abs(projectionMatrix.elements[5])
      : null;

  const croppedHalfHeight =
    isFiniteNumber(projectionScaleY) && projectionScaleY > 0
      ? clampImagePlaneHalfExtent({
          value: imagePlaneDistance / projectionScaleY,
          minHalfExtent: imagePlaneDefaults.minHalfExtent,
        })
      : isFiniteNumber(fovVertical)
      ? clampImagePlaneHalfExtent({
          value:
            Math.tan((fovVertical ?? PI_OVER_THREE) * 0.5) * imagePlaneDistance,
          minHalfExtent: imagePlaneDefaults.minHalfExtent,
        })
      : imagePlaneDefaults.fallbackHalfHeight;

  const croppedHalfWidth =
    isFiniteNumber(projectionScaleX) && projectionScaleX > 0
      ? clampImagePlaneHalfExtent({
          value: imagePlaneDistance / projectionScaleX,
          minHalfExtent: imagePlaneDefaults.minHalfExtent,
        })
      : isFiniteNumber(fovHorizontal)
      ? clampImagePlaneHalfExtent({
          value:
            Math.tan((fovHorizontal ?? PI_OVER_TWO) * 0.5) * imagePlaneDistance,
          minHalfExtent: imagePlaneDefaults.minHalfExtent,
        })
      : imagePlaneDefaults.fallbackHalfWidth;

  const fullHalfWidth = croppedHalfWidth;
  const fullHalfHeight = croppedHalfHeight;
  const croppedImagePlaneCenter = imagePlaneCenter.clone();

  const fullTopRight = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(fullHalfWidth))
    .add(up.clone().multiplyScalar(fullHalfHeight));
  const fullTopLeft = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-fullHalfWidth))
    .add(up.clone().multiplyScalar(fullHalfHeight));
  const fullBottomLeft = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-fullHalfWidth))
    .add(up.clone().multiplyScalar(-fullHalfHeight));
  const fullBottomRight = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(fullHalfWidth))
    .add(up.clone().multiplyScalar(-fullHalfHeight));

  const hasViewOffset = hasHorizontalViewOffset || hasVerticalViewOffset;
  const offsetPlaneLeftRatio =
    hasHorizontalViewOffset && viewOffset.fullWidth > 0
      ? viewOffset.offsetX / viewOffset.fullWidth
      : 0;
  const offsetPlaneTopRatio =
    hasVerticalViewOffset && viewOffset.fullHeight > 0
      ? viewOffset.offsetY / viewOffset.fullHeight
      : 0;
  const offsetPlaneWidthRatio =
    hasHorizontalViewOffset && viewOffset.fullWidth > 0
      ? viewOffset.width / viewOffset.fullWidth
      : 1;
  const offsetPlaneHeightRatio =
    hasVerticalViewOffset && viewOffset.fullHeight > 0
      ? viewOffset.height / viewOffset.fullHeight
      : 1;
  const hasNonStandardViewOffset =
    hasViewOffset &&
    (Math.abs(offsetPlaneLeftRatio) > epsilon ||
      Math.abs(offsetPlaneTopRatio) > epsilon ||
      Math.abs(offsetPlaneWidthRatio - 1) > epsilon ||
      Math.abs(offsetPlaneHeightRatio - 1) > epsilon);
  const fullPlaneWidthVector = fullTopRight.clone().sub(fullTopLeft);
  const fullPlaneHeightVector = fullBottomLeft.clone().sub(fullTopLeft);
  const imagePlaneDown = fullPlaneHeightVector.clone().normalize();
  const imagePlaneAxisOrigin = fullTopLeft.clone();
  const offsetPlaneTopLeft = hasViewOffset
    ? fullTopLeft
        .clone()
        .add(fullPlaneWidthVector.clone().multiplyScalar(offsetPlaneLeftRatio))
        .add(fullPlaneHeightVector.clone().multiplyScalar(offsetPlaneTopRatio))
    : null;
  const offsetPlaneTopRight = offsetPlaneTopLeft
    ? offsetPlaneTopLeft
        .clone()
        .add(fullPlaneWidthVector.clone().multiplyScalar(offsetPlaneWidthRatio))
    : null;
  const offsetPlaneBottomLeft = offsetPlaneTopLeft
    ? offsetPlaneTopLeft
        .clone()
        .add(
          fullPlaneHeightVector.clone().multiplyScalar(offsetPlaneHeightRatio)
        )
    : null;
  const offsetPlaneBottomRight =
    offsetPlaneTopRight && offsetPlaneBottomLeft
      ? offsetPlaneTopRight
          .clone()
          .add(
            fullPlaneHeightVector.clone().multiplyScalar(offsetPlaneHeightRatio)
          )
      : null;
  const frustumCorners: [Vector3, Vector3, Vector3, Vector3] = [
    fullTopRight,
    fullTopLeft,
    fullBottomLeft,
    fullBottomRight,
  ];
  const frustumEdges = frustumCorners.map((corner): [Vector3, Vector3] => [
    cameraPosition,
    corner,
  ]);
  const imagePlaneCrosshair = buildCrosshairLinePoints({
    center: imagePlaneCenter,
    horizontalDirection: right,
    verticalDirection: up,
    halfExtent: imagePlaneDefaults.originHalfExtent,
  });

  return {
    cameraPosition,
    forward,
    right,
    up,
    imagePlaneCenter,
    croppedImagePlaneCenter,
    hasViewOffset,
    hasNonStandardViewOffset,
    imagePlaneCorners: [
      fullTopRight,
      fullTopLeft,
      fullBottomLeft,
      fullBottomRight,
    ],
    offsetImagePlaneCorners: hasViewOffset
      ? [
          offsetPlaneTopRight!,
          offsetPlaneTopLeft!,
          offsetPlaneBottomLeft!,
          offsetPlaneBottomRight!,
        ]
      : null,
    fullImagePlaneCorners: [
      fullTopRight,
      fullTopLeft,
      fullBottomLeft,
      fullBottomRight,
    ],
    frustumEdges,
    imagePlaneAxisOrigin,
    imagePlaneXAxisEnd: imagePlaneAxisOrigin
      .clone()
      .add(right.clone().multiplyScalar(imagePlaneDefaults.basisLineLength)),
    imagePlaneYAxisEnd: imagePlaneAxisOrigin
      .clone()
      .add(
        imagePlaneDown
          .clone()
          .multiplyScalar(imagePlaneDefaults.basisLineLength)
      ),
    basisRightEnd: imagePlaneCenter
      .clone()
      .add(right.clone().multiplyScalar(imagePlaneDefaults.basisLineLength)),
    basisUpEnd: imagePlaneCenter
      .clone()
      .add(up.clone().multiplyScalar(imagePlaneDefaults.basisLineLength)),
    imagePlaneOriginX: imagePlaneCrosshair.horizontal,
    imagePlaneOriginY: imagePlaneCrosshair.vertical,
  };
};
