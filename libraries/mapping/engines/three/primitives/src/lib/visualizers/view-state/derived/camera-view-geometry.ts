import { Plane, Quaternion, Ray, Vector3 } from "three";

import {
  CAMERA_TYPE,
  createPerspectiveViewClipPlanes3,
  readMetersPerCssPixelFromIntrinsics,
  readLocalCameraBasis,
} from "@carma-commons/camera/model";
import {
  deriveOrbitAngles,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import {
  clamp,
  intersectRayWithPlane,
  isFiniteNumber,
  PI,
  PI_OVER_THREE,
  PI_OVER_TWO,
} from "@carma-commons/math";
import { zeroToTwoPi } from "@carma-units";
import type { Radians } from "@carma-units";

import type { ResolvedViewStateVisualizerVisualizedOptions } from "../view-state-visualizer-types";
import { pointOnBearingCircle } from "./angle-cue-geometry";
import { buildCrosshairLinePoints } from "./crosshair-line-points";
import {
  buildGroundProjectionFromClipPlanes,
  buildOrthographicFrustumClipPlanes,
  buildOrthographicGroundProjectionClipPlanes,
} from "./ground-projection";
const OPEN_FOV_EPSILON_RAD = 1e-6;
const GROUND_PLANE_ORIGIN = new Vector3(0, 0, 0);
const GROUND_PLANE_NORMAL = new Vector3(0, 1, 0);
const GROUND_PLANE = new Plane().setFromNormalAndCoplanarPoint(
  GROUND_PLANE_NORMAL.clone(),
  GROUND_PLANE_ORIGIN
);
const WORLD_UP = new Vector3(0, 1, 0);
const CAMERA_GEOMETRY_SCRATCH = {
  bearingRotation: new Quaternion(),
  inverseBearingRotation: new Quaternion(),
} as const;

const normalizeBearing = (bearingRadians: number): number =>
  zeroToTwoPi(bearingRadians as Radians) as number;

const clampPerspectiveFovRad = (fovRadians: number): number =>
  clamp(fovRadians, OPEN_FOV_EPSILON_RAD, PI - OPEN_FOV_EPSILON_RAD);

const readPositiveFrustumDistance = (
  distance: number | undefined,
  epsilon: number
): number | undefined =>
  isFiniteNumber(distance) && distance > epsilon ? distance : undefined;

const normalizeFrustumDistanceToHemisphere = ({
  distanceMeters,
  rangeMeters,
  hemisphereRadius,
  epsilon,
}: {
  distanceMeters: number | undefined;
  rangeMeters: number | undefined;
  hemisphereRadius: number;
  epsilon: number;
}): number | undefined => {
  if (
    !isFiniteNumber(distanceMeters) ||
    distanceMeters <= epsilon ||
    !isFiniteNumber(rangeMeters) ||
    rangeMeters <= epsilon
  ) {
    return undefined;
  }

  return (distanceMeters / rangeMeters) * hemisphereRadius;
};

const readHorizontalFov = (viewState: ViewState): number | null => {
  const fovHorizontal = viewState.intrinsics?.fovHorizontal;
  return isFiniteNumber(fovHorizontal)
    ? clampPerspectiveFovRad(fovHorizontal)
    : null;
};

const readVerticalFov = (viewState: ViewState): number | null => {
  const fovVertical = viewState.intrinsics?.fov;
  return isFiniteNumber(fovVertical)
    ? clampPerspectiveFovRad(fovVertical)
    : null;
};

const readAspectRatio = (viewState: ViewState): number => {
  const viewport = viewState.metadata.viewport;
  if (
    isFiniteNumber(viewport?.widthPx) &&
    viewport.widthPx > 0 &&
    isFiniteNumber(viewport?.heightPx) &&
    viewport.heightPx > 0
  ) {
    return viewport.widthPx / viewport.heightPx;
  }

  const viewOffset = viewState.intrinsics?.viewOffset;
  if (
    isFiniteNumber(viewOffset?.width) &&
    viewOffset.width > 0 &&
    isFiniteNumber(viewOffset?.height) &&
    viewOffset.height > 0
  ) {
    return viewOffset.width / viewOffset.height;
  }

  const fovVertical = viewState.intrinsics?.fov;
  const fovHorizontal = viewState.intrinsics?.fovHorizontal;
  if (
    isFiniteNumber(fovVertical) &&
    fovVertical > 0 &&
    isFiniteNumber(fovHorizontal) &&
    fovHorizontal > 0
  ) {
    const tanVerticalHalfFov = Math.tan(fovVertical * 0.5);
    const tanHorizontalHalfFov = Math.tan(fovHorizontal * 0.5);

    if (
      isFiniteNumber(tanVerticalHalfFov) &&
      tanVerticalHalfFov > 0 &&
      isFiniteNumber(tanHorizontalHalfFov) &&
      tanHorizontalHalfFov > 0
    ) {
      return tanHorizontalHalfFov / tanVerticalHalfFov;
    }
  }

  return 1;
};

const readImagePlaneDistance = ({
  viewState,
  visualized,
  distance,
  maxDistance,
  hemisphereRadius,
  epsilon,
}: {
  viewState: ViewState;
  visualized: ResolvedViewStateVisualizerVisualizedOptions;
  distance: number;
  maxDistance: number;
  hemisphereRadius: number;
  epsilon: number;
}): number => {
  const projectionType = viewState.intrinsics?.type ?? CAMERA_TYPE.PERSPECTIVE;
  const defaultDistance =
    projectionType === CAMERA_TYPE.ORTHOGRAPHIC ? hemisphereRadius : distance;

  return clamp(
    visualized.imagePlaneDistance ?? defaultDistance,
    epsilon,
    hemisphereRadius * maxDistance
  );
};

const clampPositiveImagePlaneHalfExtent = ({
  value,
  epsilon,
}: {
  value: number;
  epsilon: number;
  // Keep the image plane numerically open, but do not impose a visual minimum
  // extent. Small resolved FOVs must be allowed to collapse accordingly.
}): number => Math.max(epsilon, value);

const readViewportDimensions = (
  viewState: ViewState
): { widthPx: number; heightPx: number } | null => {
  const viewport = viewState.metadata.viewport;
  if (
    isFiniteNumber(viewport?.widthPx) &&
    viewport.widthPx > 0 &&
    isFiniteNumber(viewport?.heightPx) &&
    viewport.heightPx > 0
  ) {
    return {
      widthPx: viewport.widthPx,
      heightPx: viewport.heightPx,
    };
  }

  const viewOffset = viewState.intrinsics?.viewOffset;
  if (
    isFiniteNumber(viewOffset?.width) &&
    viewOffset.width > 0 &&
    isFiniteNumber(viewOffset?.height) &&
    viewOffset.height > 0
  ) {
    return {
      widthPx: viewOffset.width,
      heightPx: viewOffset.height,
    };
  }

  return null;
};

const readOrthographicHalfExtentsFromScale = ({
  viewState,
  rangeMeters,
  hemisphereRadius,
  epsilon,
}: {
  viewState: ViewState;
  rangeMeters: number;
  hemisphereRadius: number;
  epsilon: number;
}): { halfWidth: number; halfHeight: number } | null => {
  const viewport = readViewportDimensions(viewState);
  if (!viewport) {
    return null;
  }

  const metersPerCssPixel = readMetersPerCssPixelFromIntrinsics({
    intrinsics: viewState.intrinsics,
    rangeM: rangeMeters,
    viewportWidthPx: viewport.widthPx,
    viewportHeightPx: viewport.heightPx,
  });
  if (
    !isFiniteNumber(metersPerCssPixel) ||
    metersPerCssPixel <= epsilon ||
    !isFiniteNumber(rangeMeters) ||
    rangeMeters <= epsilon
  ) {
    return null;
  }

  const halfWidth = normalizeFrustumDistanceToHemisphere({
    distanceMeters: metersPerCssPixel * viewport.widthPx * 0.5,
    rangeMeters,
    hemisphereRadius,
    epsilon,
  });
  const halfHeight = normalizeFrustumDistanceToHemisphere({
    distanceMeters: metersPerCssPixel * viewport.heightPx * 0.5,
    rangeMeters,
    hemisphereRadius,
    epsilon,
  });

  return isFiniteNumber(halfWidth) &&
    halfWidth > epsilon &&
    isFiniteNumber(halfHeight) &&
    halfHeight > epsilon
    ? {
        halfWidth: clampPositiveImagePlaneHalfExtent({
          value: halfWidth,
          epsilon,
        }),
        halfHeight: clampPositiveImagePlaneHalfExtent({
          value: halfHeight,
          epsilon,
        }),
      }
    : null;
};

const readOrthographicFallbackHalfExtents = ({
  aspect,
  hemisphereRadius,
  epsilon,
}: {
  aspect: number;
  hemisphereRadius: number;
  epsilon: number;
}): { halfWidth: number; halfHeight: number } => {
  const resolvedAspect = isFiniteNumber(aspect) && aspect > 0 ? aspect : 1;

  return resolvedAspect >= 1
    ? {
        halfWidth: clampPositiveImagePlaneHalfExtent({
          value: hemisphereRadius * 0.25,
          epsilon,
        }),
        halfHeight: clampPositiveImagePlaneHalfExtent({
          value: (hemisphereRadius * 0.25) / resolvedAspect,
          epsilon,
        }),
      }
    : {
        halfWidth: clampPositiveImagePlaneHalfExtent({
          value: hemisphereRadius * 0.25 * resolvedAspect,
          epsilon,
        }),
        halfHeight: clampPositiveImagePlaneHalfExtent({
          value: hemisphereRadius * 0.25,
          epsilon,
        }),
      };
};

const intersectForwardRayWithGroundPlane = ({
  origin,
  direction,
  epsilon,
}: {
  origin: Vector3;
  direction: Vector3;
  epsilon: number;
}): Vector3 | null => {
  const resolvedDirection = direction.clone();
  if (resolvedDirection.lengthSq() <= epsilon * epsilon) {
    return null;
  }

  resolvedDirection.normalize();
  const intersection = intersectRayWithPlane(
    new Ray(origin.clone(), resolvedDirection),
    GROUND_PLANE,
    epsilon
  );

  if (!intersection) {
    return null;
  }

  return intersection.clone().sub(origin).dot(resolvedDirection) >= -epsilon
    ? intersection
    : null;
};

const intersectForwardRayWithSphereBoundary = ({
  origin,
  direction,
  radius,
  epsilon,
}: {
  origin: Vector3;
  direction: Vector3;
  radius: number;
  epsilon: number;
}): Vector3 | null => {
  const resolvedDirection = direction.clone();
  if (resolvedDirection.lengthSq() <= epsilon * epsilon) {
    return null;
  }

  resolvedDirection.normalize();

  const a = resolvedDirection.dot(resolvedDirection);
  const b = 2 * origin.dot(resolvedDirection);
  const c = origin.dot(origin) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (!Number.isFinite(discriminant) || discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(Math.max(0, discriminant));
  const t0 = (-b - sqrtDiscriminant) / (2 * a);
  const t1 = (-b + sqrtDiscriminant) / (2 * a);
  const intersections = [t0, t1]
    .filter((candidate) => Number.isFinite(candidate) && candidate > epsilon)
    .sort((left, right) => left - right);
  const t =
    intersections.length >= 2
      ? intersections[1]
      : intersections.length === 1
      ? intersections[0]
      : undefined;

  return typeof t === "number"
    ? origin.clone().add(resolvedDirection.multiplyScalar(t))
    : null;
};

const resolveFrustumEdgeEndpoint = ({
  origin,
  direction,
  hemisphereRadius,
  epsilon,
}: {
  origin: Vector3;
  direction: Vector3;
  hemisphereRadius: number;
  epsilon: number;
}): Vector3 | null => {
  if (origin.y < -epsilon) {
    return null;
  }

  const groundIntersection = intersectForwardRayWithGroundPlane({
    origin,
    direction,
    epsilon,
  });
  const sphereIntersection = intersectForwardRayWithSphereBoundary({
    origin,
    direction,
    radius: hemisphereRadius,
    epsilon,
  });

  const candidates = [groundIntersection, sphereIntersection]
    .filter((point): point is Vector3 => point !== null)
    .map((point) => ({
      point,
      distanceSq: point.distanceToSquared(origin),
    }))
    .sort((left, right) => left.distanceSq - right.distanceSq);

  return candidates[0]?.point ?? null;
};

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
  viewState: ViewState;
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
  viewState: ViewState;
  hemisphereRadius: number;
}) => {
  const { bearing, pitch } = deriveOrbitAngles(viewState);
  const cameraPosition = viewingBearingPitchToCameraSpherePosition({
    viewingBearing: bearing,
    pitch,
    hemisphereRadius,
  });
  const { forward, right, up } = readLocalCameraBasis(viewState.orientation);

  return {
    bearing,
    cameraPosition,
    forward,
    right,
    up,
  };
};

const rotatePoint = (point: Vector3, rotation: Quaternion): Vector3 =>
  point.clone().applyQuaternion(rotation);

const rotateLine = (
  line: [Vector3, Vector3],
  rotation: Quaternion
): [Vector3, Vector3] => [
  rotatePoint(line[0], rotation),
  rotatePoint(line[1], rotation),
];

const rotateQuad = (
  corners: [Vector3, Vector3, Vector3, Vector3],
  rotation: Quaternion
): [Vector3, Vector3, Vector3, Vector3] => [
  rotatePoint(corners[0], rotation),
  rotatePoint(corners[1], rotation),
  rotatePoint(corners[2], rotation),
  rotatePoint(corners[3], rotation),
];

const rotateOptionalQuad = (
  corners: [Vector3, Vector3, Vector3, Vector3] | null,
  rotation: Quaternion
): [Vector3, Vector3, Vector3, Vector3] | null =>
  corners ? rotateQuad(corners, rotation) : null;

const rotateOptionalPolygon = (
  polygon: Vector3[] | null,
  rotation: Quaternion
): Vector3[] | null =>
  polygon?.map((point) => rotatePoint(point, rotation)) ?? null;

const rotateFrustumEdges = (
  edges: ([Vector3, Vector3] | null)[],
  rotation: Quaternion
): ([Vector3, Vector3] | null)[] =>
  edges.map((edge) => (edge ? rotateLine(edge, rotation) : null));

const rotateResolvedGeometry = (
  geometry: ViewStateVisualizerImagePlaneGeometry,
  rotation: Quaternion
): ViewStateVisualizerImagePlaneGeometry => ({
  ...geometry,
  cameraPosition: rotatePoint(geometry.cameraPosition, rotation),
  forward: rotatePoint(geometry.forward, rotation),
  right: rotatePoint(geometry.right, rotation),
  up: rotatePoint(geometry.up, rotation),
  imagePlaneCenter: rotatePoint(geometry.imagePlaneCenter, rotation),
  croppedImagePlaneCenter: rotatePoint(
    geometry.croppedImagePlaneCenter,
    rotation
  ),
  imagePlaneCorners: rotateQuad(geometry.imagePlaneCorners, rotation),
  offsetImagePlaneCorners: rotateOptionalQuad(
    geometry.offsetImagePlaneCorners,
    rotation
  ),
  orthographicTangentPlaneCorners: rotateOptionalQuad(
    geometry.orthographicTangentPlaneCorners,
    rotation
  ),
  projectionPlanePolygon: rotateOptionalPolygon(
    geometry.projectionPlanePolygon,
    rotation
  ),
  fullImagePlaneCorners: rotateQuad(geometry.fullImagePlaneCorners, rotation),
  frustumEdges: rotateFrustumEdges(geometry.frustumEdges, rotation),
  imagePlaneAxisOrigin: rotatePoint(geometry.imagePlaneAxisOrigin, rotation),
  imagePlaneXAxisEnd: rotatePoint(geometry.imagePlaneXAxisEnd, rotation),
  imagePlaneYAxisEnd: rotatePoint(geometry.imagePlaneYAxisEnd, rotation),
  basisRightEnd: rotatePoint(geometry.basisRightEnd, rotation),
  basisUpEnd: rotatePoint(geometry.basisUpEnd, rotation),
  imagePlaneOriginX: rotateLine(geometry.imagePlaneOriginX, rotation),
  imagePlaneOriginY: rotateLine(geometry.imagePlaneOriginY, rotation),
});

export type ViewStateVisualizerImagePlaneGeometry = {
  cameraPosition: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  imagePlaneCenter: Vector3;
  croppedImagePlaneCenter: Vector3;
  hasViewOffset: boolean;
  imagePlaneCorners: [Vector3, Vector3, Vector3, Vector3];
  offsetImagePlaneCorners: [Vector3, Vector3, Vector3, Vector3] | null;
  orthographicTangentPlaneCorners: [Vector3, Vector3, Vector3, Vector3] | null;
  projectionPlanePolygon: Vector3[] | null;
  fullImagePlaneCorners: [Vector3, Vector3, Vector3, Vector3];
  frustumEdges: ([Vector3, Vector3] | null)[];
  imagePlaneAxisOrigin: Vector3;
  imagePlaneXAxisEnd: Vector3;
  imagePlaneYAxisEnd: Vector3;
  basisRightEnd: Vector3;
  basisUpEnd: Vector3;
  imagePlaneOriginX: [Vector3, Vector3];
  imagePlaneOriginY: [Vector3, Vector3];
};

const buildImagePlaneGeometryInResolvedFrame = ({
  viewState,
  visualized,
  hemisphereRadius,
  imagePlaneDefaults,
  epsilon,
  cameraPosition,
  forward,
  right,
  up,
}: {
  viewState: ViewState;
  visualized: ResolvedViewStateVisualizerVisualizedOptions;
  hemisphereRadius: number;
  imagePlaneDefaults: {
    distance: number;
    basisLineLength: number;
    originHalfExtent: number;
    fallbackHalfHeight: number;
    fallbackHalfWidth: number;
    maxDistance: number;
  };
  epsilon: number;
  cameraPosition: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
}): ViewStateVisualizerImagePlaneGeometry => {
  const fovVertical = readVerticalFov(viewState);
  const fovHorizontal = readHorizontalFov(viewState);
  const { range } = deriveOrbitAngles(viewState);
  const imagePlaneDistance = readImagePlaneDistance({
    viewState,
    visualized,
    distance: imagePlaneDefaults.distance,
    maxDistance: imagePlaneDefaults.maxDistance,
    hemisphereRadius,
    epsilon,
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
  const aspect = readAspectRatio(viewState);
  const orthographicHalfExtents =
    type === CAMERA_TYPE.ORTHOGRAPHIC
      ? readOrthographicHalfExtentsFromScale({
          viewState,
          rangeMeters: range,
          hemisphereRadius,
          epsilon,
        }) ??
        readOrthographicFallbackHalfExtents({
          aspect,
          hemisphereRadius,
          epsilon,
        })
      : null;

  const croppedHalfHeight = orthographicHalfExtents
    ? orthographicHalfExtents.halfHeight
    : isFiniteNumber(projectionScaleY) && projectionScaleY > 0
    ? clampPositiveImagePlaneHalfExtent({
        value: imagePlaneDistance / projectionScaleY,
        epsilon,
      })
    : isFiniteNumber(fovVertical)
    ? clampPositiveImagePlaneHalfExtent({
        value:
          Math.tan((fovVertical ?? PI_OVER_THREE) * 0.5) * imagePlaneDistance,
        epsilon,
      })
    : imagePlaneDefaults.fallbackHalfHeight;

  const croppedHalfWidth = orthographicHalfExtents
    ? orthographicHalfExtents.halfWidth
    : isFiniteNumber(projectionScaleX) && projectionScaleX > 0
    ? clampPositiveImagePlaneHalfExtent({
        value: imagePlaneDistance / projectionScaleX,
        epsilon,
      })
    : isFiniteNumber(fovHorizontal)
    ? clampPositiveImagePlaneHalfExtent({
        value:
          Math.tan((fovHorizontal ?? PI_OVER_TWO) * 0.5) * imagePlaneDistance,
        epsilon,
      })
    : imagePlaneDefaults.fallbackHalfWidth;

  const fullHalfWidth = croppedHalfWidth;
  const fullHalfHeight = croppedHalfHeight;
  const perspectiveImagePlaneCenter = imagePlaneCenter.clone();

  const perspectiveTopRight = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(fullHalfWidth))
    .add(up.clone().multiplyScalar(fullHalfHeight));
  const perspectiveTopLeft = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-fullHalfWidth))
    .add(up.clone().multiplyScalar(fullHalfHeight));
  const perspectiveBottomLeft = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-fullHalfWidth))
    .add(up.clone().multiplyScalar(-fullHalfHeight));
  const perspectiveBottomRight = imagePlaneCenter
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
  const perspectivePlaneWidthVector = perspectiveTopRight
    .clone()
    .sub(perspectiveTopLeft);
  const perspectivePlaneHeightVector = perspectiveBottomLeft
    .clone()
    .sub(perspectiveTopLeft);
  const offsetPlaneTopLeft = hasViewOffset
    ? perspectiveTopLeft
        .clone()
        .add(
          perspectivePlaneWidthVector
            .clone()
            .multiplyScalar(offsetPlaneLeftRatio)
        )
        .add(
          perspectivePlaneHeightVector
            .clone()
            .multiplyScalar(offsetPlaneTopRatio)
        )
    : null;
  const offsetPlaneTopRight = offsetPlaneTopLeft
    ? offsetPlaneTopLeft
        .clone()
        .add(
          perspectivePlaneWidthVector
            .clone()
            .multiplyScalar(offsetPlaneWidthRatio)
        )
    : null;
  const offsetPlaneBottomLeft = offsetPlaneTopLeft
    ? offsetPlaneTopLeft
        .clone()
        .add(
          perspectivePlaneHeightVector
            .clone()
            .multiplyScalar(offsetPlaneHeightRatio)
        )
    : null;
  const offsetPlaneBottomRight =
    offsetPlaneTopRight && offsetPlaneBottomLeft
      ? offsetPlaneTopRight
          .clone()
          .add(
            perspectivePlaneHeightVector
              .clone()
              .multiplyScalar(offsetPlaneHeightRatio)
          )
      : null;
  const frustumBackCorners: [Vector3, Vector3, Vector3, Vector3] = [
    cameraPosition
      .clone()
      .add(right.clone().multiplyScalar(fullHalfWidth))
      .add(up.clone().multiplyScalar(fullHalfHeight)),
    cameraPosition
      .clone()
      .add(right.clone().multiplyScalar(-fullHalfWidth))
      .add(up.clone().multiplyScalar(fullHalfHeight)),
    cameraPosition
      .clone()
      .add(right.clone().multiplyScalar(-fullHalfWidth))
      .add(up.clone().multiplyScalar(-fullHalfHeight)),
    cameraPosition
      .clone()
      .add(right.clone().multiplyScalar(fullHalfWidth))
      .add(up.clone().multiplyScalar(-fullHalfHeight)),
  ];
  const perspectiveImagePlaneCorners: [Vector3, Vector3, Vector3, Vector3] = [
    perspectiveTopRight,
    perspectiveTopLeft,
    perspectiveBottomLeft,
    perspectiveBottomRight,
  ];
  const tangentPlaneCorners: [Vector3, Vector3, Vector3, Vector3] = [
    frustumBackCorners[0]!,
    frustumBackCorners[1]!,
    frustumBackCorners[2]!,
    frustumBackCorners[3]!,
  ];
  const imagePlaneCorners =
    type === CAMERA_TYPE.ORTHOGRAPHIC
      ? tangentPlaneCorners
      : perspectiveImagePlaneCorners;
  const imagePlaneCenterResolved =
    type === CAMERA_TYPE.ORTHOGRAPHIC
      ? cameraPosition.clone()
      : perspectiveImagePlaneCenter;
  const imagePlaneWidthVector = imagePlaneCorners[0]
    .clone()
    .sub(imagePlaneCorners[1]);
  const imagePlaneHeightVector = imagePlaneCorners[2]
    .clone()
    .sub(imagePlaneCorners[1]);
  const imagePlaneDown = imagePlaneHeightVector.clone().normalize();
  const imagePlaneAxisOrigin = imagePlaneCorners[1].clone();
  const orthographicProjectionCornerCandidates =
    type === CAMERA_TYPE.ORTHOGRAPHIC
      ? (tangentPlaneCorners.map((corner) =>
          intersectForwardRayWithGroundPlane({
            origin: corner,
            direction: forward,
            epsilon,
          })
        ) as [Vector3 | null, Vector3 | null, Vector3 | null, Vector3 | null])
      : null;
  const orthographicProjectionCorners =
    orthographicProjectionCornerCandidates &&
    orthographicProjectionCornerCandidates.every(
      (corner): corner is Vector3 => corner !== null
    )
      ? (orthographicProjectionCornerCandidates as [
          Vector3,
          Vector3,
          Vector3,
          Vector3
        ])
      : null;
  const perspectiveViewClipPlanes =
    type === CAMERA_TYPE.PERSPECTIVE
      ? createPerspectiveViewClipPlanes3({
          apex: cameraPosition,
          forward,
          up,
          fovHorizontalRad: fovHorizontal ?? PI_OVER_TWO,
          fovVerticalRad: fovVertical ?? PI_OVER_THREE,
          near: normalizeFrustumDistanceToHemisphere({
            distanceMeters: readPositiveFrustumDistance(
              viewState.intrinsics?.frustum?.near,
              epsilon
            ),
            rangeMeters: range,
            hemisphereRadius,
            epsilon,
          }),
          far: normalizeFrustumDistanceToHemisphere({
            distanceMeters: readPositiveFrustumDistance(
              viewState.intrinsics?.frustum?.far,
              epsilon
            ),
            rangeMeters: range,
            hemisphereRadius,
            epsilon,
          }),
          epsilon,
        })
      : null;
  const orthographicNear = readPositiveFrustumDistance(
    normalizeFrustumDistanceToHemisphere({
      distanceMeters: readPositiveFrustumDistance(
        viewState.intrinsics?.frustum?.near,
        epsilon
      ),
      rangeMeters: range,
      hemisphereRadius,
      epsilon,
    }),
    epsilon
  );
  const orthographicFar = readPositiveFrustumDistance(
    normalizeFrustumDistanceToHemisphere({
      distanceMeters: readPositiveFrustumDistance(
        viewState.intrinsics?.frustum?.far,
        epsilon
      ),
      rangeMeters: range,
      hemisphereRadius,
      epsilon,
    }),
    epsilon
  );
  const projectionPlane = (() => {
    return type === CAMERA_TYPE.ORTHOGRAPHIC
      ? buildGroundProjectionFromClipPlanes({
          radius: hemisphereRadius,
          clipPlanes: orthographicProjectionCorners
            ? buildOrthographicGroundProjectionClipPlanes({
                projectedCorners: orthographicProjectionCorners,
                imagePlaneCenter: imagePlaneCenterResolved,
                forward,
                near: orthographicNear,
                far: orthographicFar,
                epsilon,
              })
            : buildOrthographicFrustumClipPlanes({
                tangentPlaneCorners,
                imagePlaneCenter: imagePlaneCenterResolved,
                forward,
                near: orthographicNear,
                far: orthographicFar,
                epsilon,
              }),
          epsilon,
        })
      : buildGroundProjectionFromClipPlanes({
          radius: hemisphereRadius,
          clipPlanes: perspectiveViewClipPlanes!,
          epsilon,
        });
  })();
  const frustumEdges =
    type === CAMERA_TYPE.ORTHOGRAPHIC
      ? tangentPlaneCorners.map((corner) => {
          const endpoint = resolveFrustumEdgeEndpoint({
            origin: corner,
            direction: forward,
            hemisphereRadius,
            epsilon,
          });

          return endpoint ? ([corner, endpoint] as [Vector3, Vector3]) : null;
        })
      : perspectiveImagePlaneCorners.map((corner): [Vector3, Vector3] => {
          const endpoint = resolveFrustumEdgeEndpoint({
            origin: cameraPosition,
            direction: corner.clone().sub(cameraPosition),
            hemisphereRadius,
            epsilon,
          });

          return [cameraPosition, endpoint ?? corner];
        });
  const imagePlaneCrosshair = buildCrosshairLinePoints({
    center: imagePlaneCenterResolved,
    horizontalDirection: right,
    verticalDirection: up,
    halfExtent: imagePlaneDefaults.originHalfExtent,
  });

  return {
    cameraPosition,
    forward,
    right,
    up,
    imagePlaneCenter: imagePlaneCenterResolved,
    croppedImagePlaneCenter: imagePlaneCenterResolved.clone(),
    hasViewOffset,
    imagePlaneCorners,
    offsetImagePlaneCorners: hasViewOffset
      ? [
          offsetPlaneTopRight!,
          offsetPlaneTopLeft!,
          offsetPlaneBottomLeft!,
          offsetPlaneBottomRight!,
        ]
      : null,
    orthographicTangentPlaneCorners:
      type === CAMERA_TYPE.ORTHOGRAPHIC ? tangentPlaneCorners : null,
    projectionPlanePolygon: projectionPlane,
    fullImagePlaneCorners: imagePlaneCorners,
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
    basisRightEnd: imagePlaneCenterResolved
      .clone()
      .add(right.clone().multiplyScalar(imagePlaneDefaults.basisLineLength)),
    basisUpEnd: imagePlaneCenterResolved
      .clone()
      .add(up.clone().multiplyScalar(imagePlaneDefaults.basisLineLength)),
    imagePlaneOriginX: imagePlaneCrosshair.horizontal,
    imagePlaneOriginY: imagePlaneCrosshair.vertical,
  };
};

export const buildImagePlaneGeometry = ({
  viewState,
  visualized,
  hemisphereRadius,
  imagePlaneDefaults,
  epsilon,
}: {
  viewState: ViewState;
  visualized: ResolvedViewStateVisualizerVisualizedOptions;
  hemisphereRadius: number;
  imagePlaneDefaults: {
    distance: number;
    basisLineLength: number;
    originHalfExtent: number;
    fallbackHalfHeight: number;
    fallbackHalfWidth: number;
    maxDistance: number;
  };
  epsilon: number;
}): ViewStateVisualizerImagePlaneGeometry => {
  const { bearing, cameraPosition, forward, right, up } = resolveCameraBasis({
    viewState,
    hemisphereRadius,
  });
  const inverseBearingRotation =
    CAMERA_GEOMETRY_SCRATCH.inverseBearingRotation.setFromAxisAngle(
      WORLD_UP,
      -bearing
    );
  const localGeometry = buildImagePlaneGeometryInResolvedFrame({
    viewState,
    visualized,
    hemisphereRadius,
    imagePlaneDefaults,
    epsilon,
    cameraPosition: rotatePoint(cameraPosition, inverseBearingRotation),
    forward: rotatePoint(forward, inverseBearingRotation),
    right: rotatePoint(right, inverseBearingRotation),
    up: rotatePoint(up, inverseBearingRotation),
  });

  if (Math.abs(bearing) <= epsilon) {
    return localGeometry;
  }

  const bearingRotation =
    CAMERA_GEOMETRY_SCRATCH.bearingRotation.setFromAxisAngle(WORLD_UP, bearing);

  return rotateResolvedGeometry(localGeometry, bearingRotation);
};
