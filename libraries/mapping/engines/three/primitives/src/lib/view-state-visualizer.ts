import { clamp } from "@carma/math";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  projectOrthogonalLineLabelAnchor,
  projectOrthogonalPolylineLabelAnchor,
  projectPointToCanvas,
} from "./overlay/labelAnchors";
import type {
  ViewStateVisualizerCamera,
  ViewStateVisualizerCueKey,
  ViewStateVisualizerDisplayOptions,
  ViewStateVisualizerLabelAnchors,
  ViewStateVisualizerOptions,
  ViewStateVisualizerPrimitive,
  ViewStateVisualizerSpecification,
  ViewStateVisualizerSize,
} from "./types";

const DEFAULT_SIZE: ViewStateVisualizerSize = {
  widthPx: 176,
  heightPx: 176,
};

const HEMISPHERE_RADIUS = 1;
const CAMERA_BOX_SIZE = HEMISPHERE_RADIUS / 6;
const VISUALIZER_FRAME_PADDING = CAMERA_BOX_SIZE * 1.5;
const DEFAULT_VIEW_ROTATION_AROUND_UP = Math.PI / 6;
const DEFAULT_VIEW_ORBIT_PHI = Math.acos(1.22 / Math.hypot(4.1, 1.22));
const DEFAULT_VIEW_FOV_DEG = 38;

const orbitAnglesToVector3 = ({
  radius,
  theta,
  phi,
}: {
  radius: number;
  theta: number;
  phi: number;
}): THREE.Vector3 => new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);

const resolveDefaultFrameHalfExtent = () =>
  HEMISPHERE_RADIUS + VISUALIZER_FRAME_PADDING;

const resolveOrbitRadiusForFrameHalfExtent = (fovDeg: number) =>
  resolveDefaultFrameHalfExtent() / Math.tan((fovDeg * Math.PI) / 360);

const DEFAULT_CAMERA: ViewStateVisualizerCamera = {
  fovDeg: DEFAULT_VIEW_FOV_DEG,
  position: (() => {
    const position = orbitAnglesToVector3({
      radius: resolveOrbitRadiusForFrameHalfExtent(DEFAULT_VIEW_FOV_DEG),
      theta: DEFAULT_VIEW_ROTATION_AROUND_UP,
      phi: DEFAULT_VIEW_ORBIT_PHI,
    });
    return {
      x: position.x,
      y: position.y,
      z: position.z,
    };
  })(),
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_NORTH = new THREE.Vector3(0, 0, -1);
const WORLD_EAST = new THREE.Vector3(1, 0, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const ZERO_ELEVATION_DISC_RADIUS = HEMISPHERE_RADIUS * 0.25;
const ANGLE_INDICATOR_RADIUS = HEMISPHERE_RADIUS * 0.15;
const AXIS_LENGTH = HEMISPHERE_RADIUS * 0.5;
const CAMERA_BASIS_LINE_LENGTH = HEMISPHERE_RADIUS * 0.24;
const IMAGE_PLANE_DISTANCE = HEMISPHERE_RADIUS * 0.42;
const IMAGE_PLANE_ORIGIN_SIZE = HEMISPHERE_RADIUS * 0.05;
const MAX_IMAGE_PLANE_HALF_EXTENT = HEMISPHERE_RADIUS * 0.44;
const ALTITUDE_OVERFLOW_GAP_HALF_HEIGHT = HEMISPHERE_RADIUS * 0.16;
const ALTITUDE_SCALE_BREAK_HALF_HEIGHT = HEMISPHERE_RADIUS * 0.032;
const ALTITUDE_SCALE_BREAK_HALF_WIDTH = HEMISPHERE_RADIUS * 0.024;
const OUTER_ARC_RADIUS = HEMISPHERE_RADIUS;
const GRATICULE_CARDINAL_OPACITY = 0.42;
const LABEL_UP_OFFSET = HEMISPHERE_RADIUS * 0.01;
const CAMERA_GREY = 0x94a3b8;
const CAMERA_GREY_DARK = 0x64748b;
const CAMERA_GREY_EMISSIVE = 0x334155;
const ALTITUDE_GREY = 0x94a3b8;
const DEFAULT_CUE_COLORS: Record<ViewStateVisualizerCueKey, string> = {
  bearing: "#22d3ee",
  pitch: "#f59e0b",
  range: "#64748b",
  altitude: "#94a3b8",
  east: "#dc2626",
  north: "#16a34a",
  up: "#2563eb",
  imageX: "#dc2626",
  imageY: "#2563eb",
};
const DEFAULT_IMPORTANT_LINE_WIDTH_PX = 2;
const DEFAULT_HAIRLINE_WIDTH_PX = 0.5;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeBearing = (bearingRadians: number): number => {
  const fullTurn = Math.PI * 2;
  const normalized = bearingRadians % fullTurn;
  return normalized >= 0 ? normalized : normalized + fullTurn;
};

const pointOnBearingCircle = ({
  bearing,
  radius,
  y = 0,
}: {
  bearing: number;
  radius: number;
  y?: number;
}): THREE.Vector3 =>
  new THREE.Vector3(
    Math.sin(bearing) * radius,
    y,
    -Math.cos(bearing) * radius
  );

const readImagePlaneDistance = (
  cameraModel: ViewStateVisualizerSpecification
): number =>
  clamp(
    cameraModel.display?.imagePlaneDistance ?? IMAGE_PLANE_DISTANCE,
    HEMISPHERE_RADIUS * 0.08,
    HEMISPHERE_RADIUS * 1.5
  );

const readGroundDistance = (
  altitudeMeters: number,
  rangeMeters: number
): { groundDistance: number; overflow: boolean } => {
  if (!isFiniteNumber(altitudeMeters) || altitudeMeters <= 0) {
    return {
      groundDistance: 0,
      overflow: false,
    };
  }

  if (!isFiniteNumber(rangeMeters) || rangeMeters <= 0) {
    return {
      groundDistance: HEMISPHERE_RADIUS,
      overflow: true,
    };
  }

  const relativeAltitude = altitudeMeters / rangeMeters;
  return {
    groundDistance: clamp(relativeAltitude, 0, HEMISPHERE_RADIUS),
    overflow: relativeAltitude > HEMISPHERE_RADIUS,
  };
};

const buildAltitudeStemGeometry = ({
  planeDiscY,
  overflow,
  showScaleBreak,
}: {
  planeDiscY: number;
  overflow: boolean;
  showScaleBreak: boolean;
}) => {
  if (!overflow || !showScaleBreak) {
    return {
      stemSegments: [[new THREE.Vector3(0, planeDiscY, 0), ORIGIN.clone()]],
      overflowScaleBreakMarkers: null as [THREE.Vector3[], THREE.Vector3[]] | null,
    };
  }

  const midpointY = planeDiscY * 0.5;
  const gapUpperY = midpointY + ALTITUDE_OVERFLOW_GAP_HALF_HEIGHT;
  const gapLowerY = midpointY - ALTITUDE_OVERFLOW_GAP_HALF_HEIGHT;
  const buildScaleBreakMarker = (centerY: number): THREE.Vector3[] => [
    new THREE.Vector3(0, centerY + ALTITUDE_SCALE_BREAK_HALF_HEIGHT * 1.5, 0),
    new THREE.Vector3(
      ALTITUDE_SCALE_BREAK_HALF_WIDTH,
      centerY + ALTITUDE_SCALE_BREAK_HALF_HEIGHT * 0.5,
      0
    ),
    new THREE.Vector3(
      -ALTITUDE_SCALE_BREAK_HALF_WIDTH,
      centerY - ALTITUDE_SCALE_BREAK_HALF_HEIGHT * 0.5,
      0
    ),
    new THREE.Vector3(0, centerY - ALTITUDE_SCALE_BREAK_HALF_HEIGHT * 1.5, 0),
  ];

  return {
    stemSegments: [
      [
        new THREE.Vector3(0, planeDiscY, 0),
        new THREE.Vector3(0, gapUpperY, 0),
      ],
      [new THREE.Vector3(0, gapLowerY, 0), ORIGIN.clone()],
    ],
    overflowScaleBreakMarkers: [
      buildScaleBreakMarker(gapUpperY),
      buildScaleBreakMarker(gapLowerY),
    ],
  };
};

const readHorizontalFov = (
  cameraModel: ViewStateVisualizerSpecification
): number | null => {
  const intrinsics = cameraModel.intrinsics;
  const fovHorizontal = intrinsics?.fovHorizontal;

  if (isFiniteNumber(fovHorizontal)) {
    return fovHorizontal;
  }

  return null;
};

const readVerticalFov = (
  cameraModel: ViewStateVisualizerSpecification
): number | null => {
  const intrinsics = cameraModel.intrinsics;
  const fovVertical = intrinsics?.fov;

  if (isFiniteNumber(fovVertical)) {
    return fovVertical;
  }

  return null;
};

const viewingBearingPitchToCameraSpherePosition = (
  viewingBearing: number,
  pitch: number,
  radius: number = HEMISPHERE_RADIUS
): THREE.Vector3 => {
  const normalizedPitch = clamp(pitch, 0, Math.PI / 2);
  // Object-centric pose bearing is the viewing azimuth (anchor -> view direction).
  // The camera sits on the opposite side of the anchor, therefore camera azimuth
  // on the hemisphere is bearing + PI.
  const cameraSphereAzimuth = normalizeBearing(viewingBearing + Math.PI);
  return pointOnBearingCircle({
    bearing: cameraSphereAzimuth,
    radius: Math.sin(normalizedPitch) * radius,
    y: Math.cos(normalizedPitch) * radius,
  });
};

const cameraSpherePositionToViewingBearingPitch = (
  position: THREE.Vector3
): { bearing: number; pitch: number; elevation: number } => {
  const normalized = position.clone().normalize();
  const elevation = Math.asin(clamp(normalized.y, -1, 1));
  const pitch = Math.PI * 0.5 - elevation;
  // Inverse of viewingBearingPitchToCameraSpherePosition: convert camera
  // sphere azimuth back to viewing bearing.
  // viewing bearing by subtracting PI.
  const cameraSphereAzimuth = Math.atan2(normalized.x, -normalized.z);
  return {
    bearing: normalizeBearing(cameraSphereAzimuth - Math.PI),
    pitch,
    elevation,
  };
};

const computeUnitHemisphereCameraPosition = (
  cameraModel: ViewStateVisualizerSpecification
): THREE.Vector3 => {
  // This visualizer is explicitly object-centric: the unit-sphere camera position
  // must come from bearing/pitch, not from an engine-specific world direction.
  // Otherwise the visual can disagree with the canonical pose readout.
  return viewingBearingPitchToCameraSpherePosition(
    cameraModel.pose.bearing,
    cameraModel.pose.pitch,
    HEMISPHERE_RADIUS
  );
};

const buildCirclePoints = ({
  radius,
  axis,
  offset = ORIGIN,
  sampleCount = 48,
  closeLoop = true,
}: {
  radius: number;
  axis: "xz" | "xy" | "yz";
  offset?: THREE.Vector3;
  sampleCount?: number;
  closeLoop?: boolean;
}): THREE.Vector3[] =>
  Array.from({ length: sampleCount + (closeLoop ? 1 : 0) }, (_, index) => {
    const sampleIndex = closeLoop && index === sampleCount ? 0 : index;
    const angle = (sampleIndex / sampleCount) * Math.PI * 2;
    if (axis === "xz") {
      return new THREE.Vector3(
        Math.sin(angle) * radius + offset.x,
        offset.y,
        Math.cos(angle) * radius + offset.z
      );
    }

    if (axis === "xy") {
      return new THREE.Vector3(
        Math.cos(angle) * radius + offset.x,
        Math.sin(angle) * radius + offset.y,
        offset.z
      );
    }

    return new THREE.Vector3(
      offset.x,
      Math.sin(angle) * radius + offset.y,
      Math.cos(angle) * radius + offset.z
    );
  });

const buildUpperSemicirclePoints = ({
  radius,
  axis,
  sampleCount = 48,
}: {
  radius: number;
  axis: "xy" | "yz";
  sampleCount?: number;
}): THREE.Vector3[] =>
  Array.from({ length: sampleCount + 1 }, (_, index) => {
    const angle = (index / sampleCount) * Math.PI;
    if (axis === "xy") {
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      );
    }
    return new THREE.Vector3(
      0,
      Math.sin(angle) * radius,
      Math.cos(angle) * radius
    );
  });

const buildHorizontalArcPoints = ({
  radius,
  startAngle,
  endAngle,
  y = 0,
  sampleCount = 32,
}: {
  radius: number;
  startAngle: number;
  endAngle: number;
  y?: number;
  sampleCount?: number;
}): THREE.Vector3[] =>
  Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const angle = startAngle + (endAngle - startAngle) * t;
    return pointOnBearingCircle({
      bearing: angle,
      radius,
      y,
    });
  });

const buildPitchArcPoints = ({
  bearing,
  elevation,
  radius,
  sampleCount = 28,
}: {
  bearing: number;
  elevation: number;
  radius: number;
  sampleCount?: number;
}): THREE.Vector3[] =>
  Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const angle = elevation * t;
    const point = new THREE.Vector3(0, Math.sin(angle) * radius, -Math.cos(angle) * radius);
    point.applyAxisAngle(WORLD_UP, -bearing);
    return point;
  });

const buildVisualizerCamera = (
  size: ViewStateVisualizerSize,
  config: ViewStateVisualizerCamera
) => {
  const camera = new THREE.PerspectiveCamera(
    config.fovDeg,
    1,
    0.1,
    100
  );
  camera.position.set(config.position.x, config.position.y, config.position.z);
  camera.up.copy(WORLD_UP);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
};


type CanvasPoint = {
  x: number;
  y: number;
};

const cross2d = (origin: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

const buildConvexHull = (points: CanvasPoint[]): CanvasPoint[] => {
  const uniquePoints = points
    .map((point) => ({
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
    }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
    .filter(
      (point, index, array) =>
        index === 0 ||
        point.x !== array[index - 1].x ||
        point.y !== array[index - 1].y
    );

  if (uniquePoints.length <= 2) {
    return uniquePoints;
  }

  const lower: CanvasPoint[] = [];
  uniquePoints.forEach((point) => {
    while (
      lower.length >= 2 &&
      cross2d(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper: CanvasPoint[] = [];
  [...uniquePoints].reverse().forEach((point) => {
    while (
      upper.length >= 2 &&
      cross2d(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  });

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const isPointInsideConvexPolygon = (
  point: CanvasPoint,
  polygon: CanvasPoint[]
): boolean => {
  if (polygon.length < 3) {
    return false;
  }

  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = cross2d(current, next, point);
    if (Math.abs(cross) < 1e-6) {
      continue;
    }

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
      continue;
    }

    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
};

const isPointerInsideProjectedMesh = ({
  clientX,
  clientY,
  mesh,
  geometry,
  size,
  camera,
  canvas,
}: {
  clientX: number;
  clientY: number;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  size: ViewStateVisualizerSize;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
}): boolean => {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) {
    return false;
  }

  const rect = canvas.getBoundingClientRect();
  const pointer = {
    x: ((clientX - rect.left) / rect.width) * size.widthPx,
    y: ((clientY - rect.top) / rect.height) * size.heightPx,
  } satisfies CanvasPoint;

  const vertex = new THREE.Vector3();
  const projectedPoints = Array.from({ length: position.count }, (_, index) => {
    vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    const projected = projectPointToCanvas(vertex, size, camera);
    return {
      x: projected.leftPx,
      y: projected.topPx,
    } satisfies CanvasPoint;
  });

  return isPointInsideConvexPolygon(pointer, buildConvexHull(projectedPoints));
};

const setLineGeometry = (
  line: THREE.Line | THREE.LineLoop | THREE.LineSegments,
  points: THREE.Vector3[]
) => {
  line.geometry.setFromPoints(points);
  if (line instanceof THREE.Line && "computeLineDistances" in line) {
    line.computeLineDistances();
  }
};

const setQuadMeshGeometry = (
  mesh: THREE.Mesh,
  corners: readonly THREE.Vector3[]
) => {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (corners.length < 4) {
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(18), 3)
    );
    return;
  }
  const positions = new Float32Array([
    corners[0].x, corners[0].y, corners[0].z,
    corners[1].x, corners[1].y, corners[1].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[0].x, corners[0].y, corners[0].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[3].x, corners[3].y, corners[3].z,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
};

const setWideLineGeometry = (line: Line2, points: THREE.Vector3[]) => {
  const positions = points.flatMap((point) => [point.x, point.y, point.z]);
  (line.geometry as LineGeometry).setPositions(positions);
  line.computeLineDistances();
};

const resolveCameraBasis = (cameraModel: ViewStateVisualizerSpecification) => {
  const cameraPosition = computeUnitHemisphereCameraPosition(cameraModel);
  const pose = cameraModel.pose;
  const forward = ORIGIN.clone().sub(cameraPosition).normalize();

  let right = new THREE.Vector3().crossVectors(forward, WORLD_UP);
  if (right.lengthSq() < 1e-6) {
    right = WORLD_EAST.clone();
  } else {
    right.normalize();
  }

  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  if (Number.isFinite(pose.roll) && Math.abs(pose.roll ?? 0) > 1e-6) {
    right.applyAxisAngle(forward, pose.roll!);
    up.applyAxisAngle(forward, pose.roll!);
  }

  return {
    cameraPosition,
    forward,
    right,
    up,
  };
};

const buildImagePlaneGeometry = (
  cameraModel: ViewStateVisualizerSpecification
) => {
  const { cameraPosition, forward, right, up } = resolveCameraBasis(cameraModel);
  const fovVertical = readVerticalFov(cameraModel);
  const fovHorizontal = readHorizontalFov(cameraModel);
  const imagePlaneDistance = readImagePlaneDistance(cameraModel);
  const type = cameraModel.intrinsics?.type ?? "PerspectiveCamera";
  const view = cameraModel.intrinsics?.view;
  const projectionMatrix = cameraModel.intrinsics?.projectionMatrix;
  const hasHorizontalViewOffset =
    !!view &&
    isFiniteNumber(view.fullWidth) &&
    isFiniteNumber(view.width) &&
    isFiniteNumber(view.offsetX) &&
    view.fullWidth > 0;
  const hasVerticalViewOffset =
    !!view &&
    isFiniteNumber(view.fullHeight) &&
    isFiniteNumber(view.height) &&
    isFiniteNumber(view.offsetY) &&
    view.fullHeight > 0;

  const imagePlaneCenter = cameraPosition
    .clone()
    .add(forward.clone().multiplyScalar(imagePlaneDistance));

  const projectionScaleX =
    type === "PerspectiveCamera" && projectionMatrix
      ? Math.abs(projectionMatrix.elements[0])
      : null;
  const projectionScaleY =
    type === "PerspectiveCamera" && projectionMatrix
      ? Math.abs(projectionMatrix.elements[5])
      : null;

  const croppedHalfHeight =
    isFiniteNumber(projectionScaleY) && projectionScaleY > 0
      ? clamp(
          imagePlaneDistance / projectionScaleY,
          0.08,
          MAX_IMAGE_PLANE_HALF_EXTENT
        )
      : isFiniteNumber(fovVertical)
        ? clamp(
            Math.tan((fovVertical ?? Math.PI / 3) * 0.5) * imagePlaneDistance,
            0.08,
            MAX_IMAGE_PLANE_HALF_EXTENT
          )
        : 0.18;

  const croppedHalfWidth =
    isFiniteNumber(projectionScaleX) && projectionScaleX > 0
      ? clamp(
          imagePlaneDistance / projectionScaleX,
          0.12,
          MAX_IMAGE_PLANE_HALF_EXTENT
        )
      : isFiniteNumber(fovHorizontal)
        ? clamp(
            Math.tan((fovHorizontal ?? Math.PI / 2) * 0.5) * imagePlaneDistance,
            0.12,
            MAX_IMAGE_PLANE_HALF_EXTENT
          )
        : 0.24;

  const horizontalViewScale =
    hasHorizontalViewOffset && view.width > 0 ? view.width / view.fullWidth : 1;
  const verticalViewScale =
    hasVerticalViewOffset && view.height > 0 ? view.height / view.fullHeight : 1;
  const fullHalfWidth =
    horizontalViewScale > 0 ? croppedHalfWidth / horizontalViewScale : croppedHalfWidth;
  const fullHalfHeight =
    verticalViewScale > 0 ? croppedHalfHeight / verticalViewScale : croppedHalfHeight;

  const offsetX =
    hasHorizontalViewOffset
      ? (((view.offsetX + view.width * 0.5) / view.fullWidth) -
          0.5) *
        fullHalfWidth *
        2
      : 0;
  const offsetY =
    hasVerticalViewOffset
      ? (0.5 -
          (view.offsetY + view.height * 0.5) /
            view.fullHeight) *
        fullHalfHeight *
        2
      : 0;

  const croppedImagePlaneCenter = imagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(offsetX))
    .add(up.clone().multiplyScalar(offsetY));

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

  const topRight = croppedImagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(croppedHalfWidth))
    .add(up.clone().multiplyScalar(croppedHalfHeight));
  const topLeft = croppedImagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-croppedHalfWidth))
    .add(up.clone().multiplyScalar(croppedHalfHeight));
  const bottomLeft = croppedImagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(-croppedHalfWidth))
    .add(up.clone().multiplyScalar(-croppedHalfHeight));
  const bottomRight = croppedImagePlaneCenter
    .clone()
    .add(right.clone().multiplyScalar(croppedHalfWidth))
    .add(up.clone().multiplyScalar(-croppedHalfHeight));

  const frustumEdges = [
    [cameraPosition, topRight],
    [cameraPosition, topLeft],
    [cameraPosition, bottomLeft],
    [cameraPosition, bottomRight],
  ];

  return {
    cameraPosition,
    forward,
    right,
    up,
    imagePlaneCenter,
    croppedImagePlaneCenter,
    hasViewOffset: hasHorizontalViewOffset || hasVerticalViewOffset,
    imagePlaneCorners: [topRight, topLeft, bottomLeft, bottomRight],
    fullImagePlaneCorners: [fullTopRight, fullTopLeft, fullBottomLeft, fullBottomRight],
    frustumEdges,
    basisRightEnd: imagePlaneCenter
      .clone()
      .add(right.clone().multiplyScalar(CAMERA_BASIS_LINE_LENGTH)),
    basisUpEnd: imagePlaneCenter
      .clone()
      .add(up.clone().multiplyScalar(CAMERA_BASIS_LINE_LENGTH)),
    imagePlaneOriginX: [
      imagePlaneCenter.clone().add(right.clone().multiplyScalar(-IMAGE_PLANE_ORIGIN_SIZE)),
      imagePlaneCenter.clone().add(right.clone().multiplyScalar(IMAGE_PLANE_ORIGIN_SIZE)),
    ],
    imagePlaneOriginY: [
      imagePlaneCenter.clone().add(up.clone().multiplyScalar(-IMAGE_PLANE_ORIGIN_SIZE)),
      imagePlaneCenter.clone().add(up.clone().multiplyScalar(IMAGE_PLANE_ORIGIN_SIZE)),
    ],
  };
};

const setLineWidth = (
  line: THREE.Line | THREE.LineLoop | THREE.LineSegments,
  width: number
) => {
  (line.material as THREE.LineBasicMaterial).linewidth = width;
};

const setLineColor = (
  line: THREE.Line | THREE.LineLoop | THREE.LineSegments,
  color: string | number
) => {
  (line.material as THREE.LineBasicMaterial).color.set(color);
};

const setWideLineWidth = (line: Line2, width: number) => {
  (line.material as LineMaterial).linewidth = width;
};

const setWideLineColor = (line: Line2, color: string | number) => {
  (line.material as LineMaterial).color.set(color);
};

const setWideLineResolution = (line: Line2, size: ViewStateVisualizerSize) => {
  (line.material as LineMaterial).resolution.set(size.widthPx, size.heightPx);
};

export const createViewStateVisualizerPrimitive = (
  canvas: HTMLCanvasElement,
  options: ViewStateVisualizerOptions = {}
): ViewStateVisualizerPrimitive => {
  let size: ViewStateVisualizerSize = {
    ...DEFAULT_SIZE,
    ...options.size,
  };
  const cameraConfig: ViewStateVisualizerCamera = {
    ...DEFAULT_CAMERA,
    ...options.camera,
    position: {
      ...DEFAULT_CAMERA.position,
      ...options.camera?.position,
    },
  };

  const initialDisplay = options.display ?? {};

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });

  renderer.setPixelRatio(
    typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio)
  );
  renderer.setSize(size.widthPx, size.heightPx, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // --- Orbit state ---
  const initialOrbitRadius = new THREE.Vector3(
    cameraConfig.position.x,
    cameraConfig.position.y,
    cameraConfig.position.z
  ).length();
  const usesCustomCameraPosition =
    options.camera?.position?.x !== undefined ||
    options.camera?.position?.y !== undefined ||
    options.camera?.position?.z !== undefined;
  let orbitPhi = initialDisplay.orbitPhi ??
    Math.acos(clamp(cameraConfig.position.y / initialOrbitRadius, -1, 1));
  let orbitTheta = initialDisplay.orbitTheta ??
    Math.atan2(cameraConfig.position.x, cameraConfig.position.z);

  // --- Cameras ---
  // Keep sphere visually constant: distance adjusts with FOV so projected size stays the same.
  const initialFovDeg = initialDisplay.fovDeg ?? cameraConfig.fovDeg;
  const baseTangentProduct = usesCustomCameraPosition
    ? initialOrbitRadius * Math.tan((initialFovDeg * Math.PI) / 360)
    : resolveDefaultFrameHalfExtent();
  let currentFovDeg = initialFovDeg;
  const getOrbitRadius = () =>
    baseTangentProduct / Math.tan(currentFovDeg * Math.PI / 360);

  const perspectiveCamera = buildVisualizerCamera(size, {
    ...cameraConfig,
    fovDeg: initialFovDeg,
  });

  const orthoHalf = baseTangentProduct;
  const orthographicCamera = new THREE.OrthographicCamera(
    -orthoHalf, orthoHalf,
    orthoHalf, -orthoHalf,
    0.1, 100
  );
  orthographicCamera.position.copy(perspectiveCamera.position);
  orthographicCamera.up.copy(WORLD_UP);
  orthographicCamera.lookAt(0, 0, 0);
  orthographicCamera.updateProjectionMatrix();
  orthographicCamera.updateMatrixWorld();

  let useOrthographic = initialDisplay.orthographic ?? false;
  const getActiveCamera = (): THREE.Camera =>
    useOrthographic ? orthographicCamera : perspectiveCamera;

  const orbitPositionScratch = new THREE.Vector3();

  const writeOrbitPosition = ({
    target,
    radius,
    theta,
    phi,
  }: {
    target: THREE.Vector3;
    radius: number;
    theta: number;
    phi: number;
  }) => {
    target.setFromSphericalCoords(radius, phi, theta);
  };

  const syncCamerasToOrbit = () => {
    const r = getOrbitRadius();
    writeOrbitPosition({
      target: orbitPositionScratch,
      radius: r,
      theta: orbitTheta,
      phi: orbitPhi,
    });
    perspectiveCamera.position.copy(orbitPositionScratch);
    perspectiveCamera.lookAt(0, 0, 0);
    perspectiveCamera.updateMatrixWorld();
    orthographicCamera.position.copy(orbitPositionScratch);
    orthographicCamera.lookAt(0, 0, 0);
    orthographicCamera.updateMatrixWorld();
  };

  // --- Raycaster + drag state ---
  const raycaster = new THREE.Raycaster();
  type DragMode = "orbit" | "pose" | null;
  let dragMode: DragMode = null;
  let dragStartVector = new THREE.Vector3();
  let dragLastClientX = 0;
  let dragLastClientY = 0;
  // For pose: the bearing/pitch at drag start
  let dragStartBearing = 0;
  let dragStartPitch = 0;

  const pointerToArcball = (clientX: number, clientY: number): THREE.Vector3 => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    // Use the conventional arcball y-up mapping so the resulting versor
    // rotation does not invert vertical pointer input.
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    const lenSq = nx * nx + ny * ny;
    if (lenSq <= 1) {
      return new THREE.Vector3(nx, ny, Math.sqrt(1 - lenSq));
    }
    const len = Math.sqrt(lenSq);
    return new THREE.Vector3(nx / len, ny / len, 0);
  };

  // --- Display state ---
  let currentDisplay: ViewStateVisualizerDisplayOptions = { ...initialDisplay };
  let lastSpecification: ViewStateVisualizerSpecification | null = null;

  // --- Scene objects ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0xcbd5e1, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 1.34);
  sun.position.set(2.6, 3.1, 1.7);
  scene.add(sun);

  const hemisphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      roughness: 0.12,
      metalness: 0.01,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.025,
      side: THREE.DoubleSide,
    })
  );
  hemisphere.renderOrder = 0;
  scene.add(hemisphere);

  const planeDisc = new THREE.Mesh(
    new THREE.CircleGeometry(ZERO_ELEVATION_DISC_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  planeDisc.rotation.x = -Math.PI / 2;
  scene.add(planeDisc);

  const planeDiscOutline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.72,
    })
  );
  scene.add(planeDiscOutline);

  const minPitchRing = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.95,
      dashSize: HEMISPHERE_RADIUS * 0.08,
      gapSize: HEMISPHERE_RADIUS * 0.06,
    })
  );
  scene.add(minPitchRing);

  const northSouthGreatCircle = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: GRATICULE_CARDINAL_OPACITY,
    })
  );
  scene.add(northSouthGreatCircle);

  const eastWestGreatCircle = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: GRATICULE_CARDINAL_OPACITY,
    })
  );
  scene.add(eastWestGreatCircle);

  const cameraLink = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: CAMERA_GREY_DARK,
      transparent: true,
      opacity: 0.76,
    })
  );
  setWideLineResolution(cameraLink, size);
  scene.add(cameraLink);

  const altitudeLineLower = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.96,
    })
  );
  setWideLineResolution(altitudeLineLower, size);
  scene.add(altitudeLineLower);

  const altitudeLineUpper = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.96,
    })
  );
  setWideLineResolution(altitudeLineUpper, size);
  scene.add(altitudeLineUpper);

  const altitudeScaleBreakUpper = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.98,
    })
  );
  setWideLineResolution(altitudeScaleBreakUpper, size);
  scene.add(altitudeScaleBreakUpper);

  const altitudeScaleBreakLower = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.98,
    })
  );
  setWideLineResolution(altitudeScaleBreakLower, size);
  scene.add(altitudeScaleBreakLower);

  const bearingArc = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.88,
    })
  );
  setWideLineResolution(bearingArc, size);
  scene.add(bearingArc);

  const pitchArc = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
    })
  );
  setWideLineResolution(pitchArc, size);
  scene.add(pitchArc);

  const bearingIndicatorArc = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.88,
    })
  );
  setWideLineResolution(bearingIndicatorArc, size);
  scene.add(bearingIndicatorArc);

  const bearingRadial = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.88,
    })
  );
  setWideLineResolution(bearingRadial, size);
  scene.add(bearingRadial);

  const pitchOriginLine = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: CAMERA_GREY_DARK,
      transparent: true,
      opacity: 0.76,
    })
  );
  setWideLineResolution(pitchOriginLine, size);
  scene.add(pitchOriginLine);

  const elevationArc = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
    })
  );
  setWideLineResolution(elevationArc, size);
  scene.add(elevationArc);

  const eastAxis = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(eastAxis);

  const northAxis = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x16a34a,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(northAxis);

  const upAxis = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(upAxis);

  const cameraForward = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.62,
    })
  );
  scene.add(cameraForward);

  const cameraRight = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x7c3aed,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(cameraRight);

  const cameraUp = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x15803d,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(cameraUp);

  const imagePlaneSurface = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({
      color: CAMERA_GREY,
      transparent: true,
      opacity: 0.33,
      depthWrite: false,
      roughness: 0.82,
      metalness: 0.03,
      emissive: CAMERA_GREY_EMISSIVE,
      emissiveIntensity: 0.04,
      side: THREE.DoubleSide,
    })
  );
  scene.add(imagePlaneSurface);

  const imagePlaneOriginX = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(imagePlaneOriginX);

  const imagePlaneOriginY = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.95,
    })
  );
  scene.add(imagePlaneOriginY);

  const frustumEdgeLines = Array.from({ length: 4 }, () => {
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x475569,
        transparent: true,
        opacity: 0.64,
      })
    );
    scene.add(line);
    return line;
  });

  const cameraBoxGeometry = new THREE.BoxGeometry(
    CAMERA_BOX_SIZE,
    CAMERA_BOX_SIZE,
    CAMERA_BOX_SIZE
  );
  const cameraMarker = new THREE.Mesh(
    cameraBoxGeometry,
    new THREE.MeshStandardMaterial({
      color: CAMERA_GREY,
      roughness: 0.82,
      metalness: 0.03,
      emissive: CAMERA_GREY_EMISSIVE,
      emissiveIntensity: 0.05,
    })
  );
  scene.add(cameraMarker);

  // --- Graticule line groups ---
  const graticuleCardinalLines: THREE.Line[] = [
    northSouthGreatCircle,
    eastWestGreatCircle,
  ];
  const graticuleLines: THREE.Line[] = [
    ...graticuleCardinalLines,
  ];

  // --- Display option application ---
  const applyDisplayOptions = (display: ViewStateVisualizerDisplayOptions) => {
    const showGraticule = display.showGraticule ?? true;
    const showSurface = display.showSurface ?? true;
    const showAxes = display.showAxes ?? true;
    const showAngleArcs = display.showAngleArcs ?? true;
    const showImagePlane = display.showImagePlane ?? true;
    const showAltitude = display.showAltitudeStem ?? true;
    const showLink = display.showCameraLink ?? true;

    hemisphere.visible = showSurface;

    graticuleLines.forEach((line) => {
      line.visible = showGraticule;
    });

    eastAxis.visible = showAxes;
    northAxis.visible = showAxes;
    upAxis.visible = showAxes;

    bearingArc.visible = showAngleArcs;
    pitchArc.visible = showAngleArcs;
    bearingIndicatorArc.visible = showAngleArcs;
    bearingRadial.visible = showAngleArcs;
    pitchOriginLine.visible = showAngleArcs;
    elevationArc.visible = showAngleArcs;
    // minPitchRing visibility also depends on data; handled in update

    cameraForward.visible = showImagePlane;
    cameraRight.visible = showImagePlane;
    cameraUp.visible = showImagePlane;
    imagePlaneSurface.visible = showImagePlane;
    imagePlaneOriginX.visible = showImagePlane;
    imagePlaneOriginY.visible = showImagePlane;

    // frustumEdgeLines visibility also depends on data; handled in update

    cameraLink.visible = showLink;

    planeDisc.visible = showAltitude;
    planeDiscOutline.visible = showAltitude;
    altitudeLineLower.visible = showAltitude;
    altitudeLineUpper.visible = showAltitude;
    // altitude scale-break marker visibility depends on data; handled in update

    const importantLineWidthPx = Math.max(
      0.5,
      display.lineWidthPx ?? DEFAULT_IMPORTANT_LINE_WIDTH_PX
    );
    const axisLineWidthPx = Math.max(
      0.5,
      display.axisLineWidthPx ?? importantLineWidthPx * (2 / 3)
    );
    const hairlineWidthPx = Math.max(
      0.5,
      display.hairlineWidthPx ?? DEFAULT_HAIRLINE_WIDTH_PX
    );
    const cueColors = {
      ...DEFAULT_CUE_COLORS,
      ...(display.cueColors ?? {}),
    };

    graticuleCardinalLines.forEach((line) => setLineWidth(line, hairlineWidthPx));
    setLineWidth(minPitchRing, importantLineWidthPx);

    setLineWidth(eastAxis, axisLineWidthPx);
    setLineWidth(northAxis, axisLineWidthPx);
    setLineWidth(upAxis, axisLineWidthPx);

    setWideLineWidth(bearingArc, importantLineWidthPx);
    setWideLineWidth(pitchArc, importantLineWidthPx);
    setWideLineWidth(bearingIndicatorArc, importantLineWidthPx);
    setWideLineWidth(bearingRadial, importantLineWidthPx);
    setWideLineWidth(pitchOriginLine, importantLineWidthPx);
    setWideLineWidth(elevationArc, importantLineWidthPx);
    setWideLineWidth(cameraLink, importantLineWidthPx);
    setWideLineWidth(altitudeLineLower, importantLineWidthPx);
    setWideLineWidth(altitudeLineUpper, importantLineWidthPx);
    setWideLineWidth(altitudeScaleBreakUpper, importantLineWidthPx);
    setWideLineWidth(altitudeScaleBreakLower, importantLineWidthPx);

    setLineWidth(imagePlaneOriginX, axisLineWidthPx);
    setLineWidth(imagePlaneOriginY, axisLineWidthPx);
    setLineWidth(cameraForward, hairlineWidthPx);
    setLineWidth(cameraRight, axisLineWidthPx);
    setLineWidth(cameraUp, axisLineWidthPx);
    setLineWidth(planeDiscOutline, hairlineWidthPx);

    frustumEdgeLines.forEach((line) => setLineWidth(line, hairlineWidthPx));

    setWideLineColor(bearingArc, cueColors.bearing);
    setWideLineColor(bearingIndicatorArc, cueColors.bearing);
    setWideLineColor(bearingRadial, cueColors.bearing);
    setWideLineColor(pitchArc, cueColors.pitch);
    setWideLineColor(elevationArc, cueColors.pitch);
    setWideLineColor(cameraLink, cueColors.range);
    setWideLineColor(pitchOriginLine, cueColors.range);
    setWideLineColor(altitudeLineLower, cueColors.altitude);
    setWideLineColor(altitudeLineUpper, cueColors.altitude);
    setWideLineColor(altitudeScaleBreakUpper, cueColors.altitude);
    setWideLineColor(altitudeScaleBreakLower, cueColors.altitude);

    setLineColor(planeDiscOutline, cueColors.altitude);
    setLineColor(eastAxis, cueColors.east);
    setLineColor(northAxis, cueColors.north);
    setLineColor(upAxis, cueColors.up);
    setLineColor(imagePlaneOriginX, cueColors.imageX);
    setLineColor(imagePlaneOriginY, cueColors.imageY);
    setLineColor(cameraRight, cueColors.imageX);
    setLineColor(cameraUp, cueColors.imageY);

    // Orbit
    if (display.orbitTheta !== undefined) orbitTheta = display.orbitTheta;
    if (display.orbitPhi !== undefined) orbitPhi = display.orbitPhi;

    // Projection
    if (display.orthographic !== undefined) useOrthographic = display.orthographic;
    if (display.fovDeg !== undefined) {
      currentFovDeg = display.fovDeg;
      perspectiveCamera.fov = display.fovDeg;
      perspectiveCamera.updateProjectionMatrix();
      // Ortho half stays constant (baseTangentProduct) so sphere size is stable
      const aspect = size.widthPx / size.heightPx;
      orthographicCamera.left = -baseTangentProduct * aspect;
      orthographicCamera.right = baseTangentProduct * aspect;
      orthographicCamera.top = baseTangentProduct;
      orthographicCamera.bottom = -baseTangentProduct;
      orthographicCamera.updateProjectionMatrix();
    }

    syncCamerasToOrbit();
  };

  // Apply initial display options
  applyDisplayOptions(currentDisplay);

  // --- Update ---
  const update = (
    cameraModel: ViewStateVisualizerSpecification
  ): ViewStateVisualizerLabelAnchors => {
    lastSpecification = cameraModel;
    const activeCamera = getActiveCamera();

    const displayCameraPosition = computeUnitHemisphereCameraPosition(cameraModel);
    const {
      bearing: viewingBearing,
      elevation,
    } = cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
    const visualBearing = normalizeBearing(viewingBearing);
    const { groundDistance, overflow } = readGroundDistance(
      cameraModel.pose.anchor.altitude ?? 0,
      cameraModel.pose.range ?? 0
    );
    const planeDiscY = -groundDistance;

    const showAngleArcs = currentDisplay.showAngleArcs ?? true;
    const showAltitude = currentDisplay.showAltitudeStem ?? true;
    const showAltitudeScaleBreak =
      currentDisplay.showAltitudeScaleBreak ?? true;
    const showFrustum = currentDisplay.showFrustum ?? true;
    const labelFontSizePx = currentDisplay.labelFontSizePx ?? 11;

    const planeDiscPoints = buildCirclePoints({
      radius: ZERO_ELEVATION_DISC_RADIUS,
      axis: "xz",
      offset: new THREE.Vector3(0, planeDiscY, 0),
    });
    const minPitch = isFiniteNumber(cameraModel.limits?.minPitch)
      ? clamp(cameraModel.limits?.minPitch ?? 0, 0, Math.PI / 2)
      : null;
    const minPitchRingPoints =
      minPitch === null
        ? null
        : buildCirclePoints({
            radius: Math.sin(minPitch) * HEMISPHERE_RADIUS,
            axis: "xz",
            offset: new THREE.Vector3(
              0,
              Math.cos(minPitch) * HEMISPHERE_RADIUS,
              0
            ),
            closeLoop: true,
          });

    const visual = buildImagePlaneGeometry(cameraModel);
    const altitudeStemGeometry = buildAltitudeStemGeometry({
      planeDiscY,
      overflow,
      showScaleBreak: showAltitudeScaleBreak,
    });

    setLineGeometry(planeDiscOutline, planeDiscPoints);
    if (minPitchRingPoints) {
      setLineGeometry(minPitchRing, minPitchRingPoints);
      minPitchRing.visible = showAngleArcs;
    } else {
      setLineGeometry(minPitchRing, [ORIGIN.clone(), ORIGIN.clone()]);
      minPitchRing.visible = false;
    }
    setLineGeometry(
      northSouthGreatCircle,
      buildUpperSemicirclePoints({ radius: 1, axis: "yz" })
    );
    setLineGeometry(
      eastWestGreatCircle,
      buildUpperSemicirclePoints({ radius: 1, axis: "xy" })
    );
    setWideLineGeometry(cameraLink, [ORIGIN.clone(), visual.cameraPosition.clone()]);
    const [lowerSegment, upperSegment] = altitudeStemGeometry.stemSegments;
    setWideLineGeometry(
      altitudeLineLower,
      lowerSegment ?? [new THREE.Vector3(0, planeDiscY, 0), ORIGIN.clone()]
    );
    if (upperSegment) {
      setWideLineGeometry(altitudeLineUpper, upperSegment);
      altitudeLineUpper.visible = showAltitude;
    } else {
      setWideLineGeometry(altitudeLineUpper, [ORIGIN.clone(), ORIGIN.clone()]);
      altitudeLineUpper.visible = false;
    }
    if (altitudeStemGeometry.overflowScaleBreakMarkers) {
      setWideLineGeometry(
        altitudeScaleBreakUpper,
        altitudeStemGeometry.overflowScaleBreakMarkers[0]
      );
      setWideLineGeometry(
        altitudeScaleBreakLower,
        altitudeStemGeometry.overflowScaleBreakMarkers[1]
      );
      altitudeScaleBreakUpper.visible = showAltitude && showAltitudeScaleBreak;
      altitudeScaleBreakLower.visible = showAltitude && showAltitudeScaleBreak;
    } else {
      setWideLineGeometry(altitudeScaleBreakUpper, [ORIGIN.clone(), ORIGIN.clone()]);
      setWideLineGeometry(altitudeScaleBreakLower, [ORIGIN.clone(), ORIGIN.clone()]);
      altitudeScaleBreakUpper.visible = false;
      altitudeScaleBreakLower.visible = false;
    }
    const bearingArcPoints = buildHorizontalArcPoints({
      radius: OUTER_ARC_RADIUS,
      startAngle: 0,
      endAngle: visualBearing,
      y: 0,
    });
    const pitchIndicatorArcPoints = buildPitchArcPoints({
      bearing: viewingBearing,
      elevation,
      radius: ANGLE_INDICATOR_RADIUS,
    });
    const bearingIndicatorArcPoints = buildHorizontalArcPoints({
      radius: ANGLE_INDICATOR_RADIUS,
      startAngle: 0,
      endAngle: visualBearing,
      y: 0,
    });
    const elevationArcPoints = buildPitchArcPoints({
      bearing: viewingBearing,
      elevation,
      radius: OUTER_ARC_RADIUS,
    });
    setWideLineGeometry(bearingArc, bearingArcPoints);
    setWideLineGeometry(pitchArc, pitchIndicatorArcPoints);
    setWideLineGeometry(bearingIndicatorArc, bearingIndicatorArcPoints);
    const pitchArcStartPoint = pointOnBearingCircle({
      bearing: viewingBearing,
      radius: OUTER_ARC_RADIUS,
    });
    // EN radial part for bearing/range cue.
    const bearingEquatorPoint = pointOnBearingCircle({
      bearing: visualBearing,
      radius: OUTER_ARC_RADIUS,
    });
    setWideLineGeometry(bearingRadial, [
      bearingEquatorPoint,
      ORIGIN.clone(),
    ]);
    setWideLineGeometry(pitchOriginLine, [
      ORIGIN.clone(),
      pitchArcStartPoint,
    ]);
    // Elevation arc: meridian arc from equator point up to camera position
    setWideLineGeometry(elevationArc, elevationArcPoints);
    setLineGeometry(eastAxis, [
      ORIGIN.clone(),
      WORLD_EAST.clone().multiplyScalar(AXIS_LENGTH),
    ]);
    setLineGeometry(northAxis, [
      ORIGIN.clone(),
      WORLD_NORTH.clone().multiplyScalar(OUTER_ARC_RADIUS),
    ]);
    setLineGeometry(upAxis, [
      ORIGIN.clone(),
      WORLD_UP.clone().multiplyScalar(AXIS_LENGTH),
    ]);
    setLineGeometry(cameraForward, [
      visual.cameraPosition.clone(),
      visual.imagePlaneCenter.clone(),
    ]);
    setLineGeometry(cameraRight, [
      visual.imagePlaneCenter.clone(),
      visual.basisRightEnd.clone(),
    ]);
    setLineGeometry(cameraUp, [
      visual.imagePlaneCenter.clone(),
      visual.basisUpEnd.clone(),
    ]);
    setQuadMeshGeometry(imagePlaneSurface, visual.imagePlaneCorners);
    setLineGeometry(imagePlaneOriginX, visual.imagePlaneOriginX);
    setLineGeometry(imagePlaneOriginY, visual.imagePlaneOriginY);

    frustumEdgeLines.forEach((line, index) => {
      const edge = visual.frustumEdges[index];
      setLineGeometry(line, edge ? edge : [visual.cameraPosition.clone(), visual.cameraPosition.clone()]);
      line.visible = showFrustum && Boolean(edge);
    });

    hemisphere.position.copy(ORIGIN);
    planeDisc.position.set(0, planeDiscY, 0);
    const cameraRadial = visual.cameraPosition.clone().normalize();
    cameraMarker.position.copy(
      visual.cameraPosition
        .clone()
        .add(cameraRadial.multiplyScalar(CAMERA_BOX_SIZE * 0.5))
    );
    const cameraBasisMatrix = new THREE.Matrix4().makeBasis(
      visual.right,
      visual.up,
      visual.forward.clone().negate()
    );
    cameraMarker.setRotationFromMatrix(cameraBasisMatrix);

    renderer.render(scene, activeCamera);

    const commonPlanarLabelOffset = WORLD_UP.clone().multiplyScalar(LABEL_UP_OFFSET);
    const altitudeLabelWorldPoint = new THREE.Vector3(0, planeDiscY * 0.5, 0);
    const altitudeAnchor = projectPointToCanvas(
      altitudeLabelWorldPoint,
      size,
      activeCamera
    );
    const bearingArcMidpoint =
      bearingArcPoints[Math.floor(bearingArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const pitchArcMidpoint =
      elevationArcPoints[Math.floor(elevationArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const bearingAnchor = projectOrthogonalPolylineLabelAnchor({
      points: bearingArcPoints,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: bearingArcMidpoint.clone().multiplyScalar(1.08),
    });
    const pitchAnchor = projectOrthogonalPolylineLabelAnchor({
      points: elevationArcPoints,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: pitchArcMidpoint.clone().multiplyScalar(1.08),
    });
    const rangeLabelFallbackBiasPoint = pitchArcStartPoint
      .clone()
      .add(WORLD_UP.clone().multiplyScalar(HEMISPHERE_RADIUS * 0.35));
    const rangeAnchor = projectOrthogonalLineLabelAnchor({
      lineStart: ORIGIN,
      lineEnd: pitchArcStartPoint,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: pitchArcMidpoint,
      fallbackBiasToward: rangeLabelFallbackBiasPoint,
    });

    return {
      bearing: bearingAnchor,
      pitch: pitchAnchor,
      range: rangeAnchor,
      altitude: {
        leftPx: altitudeAnchor.leftPx + labelFontSizePx,
        topPx: altitudeAnchor.topPx,
      },
      east: projectPointToCanvas(
        WORLD_EAST.clone().multiplyScalar(AXIS_LENGTH),
        size,
        activeCamera
      ),
      north: projectPointToCanvas(
        WORLD_NORTH.clone()
          .multiplyScalar(AXIS_LENGTH + 0.05)
          .add(commonPlanarLabelOffset),
        size,
        activeCamera
      ),
      up: projectPointToCanvas(
        WORLD_UP.clone().multiplyScalar(AXIS_LENGTH),
        size,
        activeCamera
      ),
      imageX: projectPointToCanvas(
        visual.basisRightEnd
          .clone()
          .add(visual.right.clone().multiplyScalar(CAMERA_BASIS_LINE_LENGTH * 0.14)),
        size,
        activeCamera
      ),
      imageY: projectPointToCanvas(
        visual.basisUpEnd
          .clone()
          .add(visual.up.clone().multiplyScalar(CAMERA_BASIS_LINE_LENGTH * 0.14)),
        size,
        activeCamera
      ),
    };
  };

  // --- Pointer interaction (raycaster-based versor drag) ---
  const onPointerDown = (e: PointerEvent) => {
    if (!lastSpecification) return;

    // Raycast to determine drag target
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), getActiveCamera());

    const sphereHits = raycaster.intersectObject(hemisphere);

    // Check camera cube first, but only if it is not occluded by the hemisphere.
    const cubeHits = raycaster.intersectObject(cameraMarker, false);
    const cubeHit = cubeHits[0];
    const sphereHit = sphereHits[0];
    const cubeIsInFrontOfSphere =
      cubeHit && (!sphereHit || cubeHit.distance <= sphereHit.distance);
    const pointerInsideCubeSilhouette = isPointerInsideProjectedMesh({
      clientX: e.clientX,
      clientY: e.clientY,
      mesh: cameraMarker,
      geometry: cameraBoxGeometry,
      size,
      camera: getActiveCamera(),
      canvas,
    });
    if (cubeIsInFrontOfSphere && pointerInsideCubeSilhouette && options.onPoseChange) {
      dragMode = "pose";
      dragStartVector = pointerToArcball(e.clientX, e.clientY);
      const displayCameraPosition = computeUnitHemisphereCameraPosition(lastSpecification);
      const displayPose = cameraSpherePositionToViewingBearingPitch(displayCameraPosition);
      dragStartBearing = displayPose.bearing;
      dragStartPitch = displayPose.pitch;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }
    if (sphereHits.length > 0 && (currentDisplay.interactive ?? false)) {
      dragMode = "orbit";
      dragStartVector = pointerToArcball(e.clientX, e.clientY);
      dragLastClientX = e.clientX;
      dragLastClientY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragMode || !lastSpecification) return;

    if (dragMode === "pose") {
      const currentVector = pointerToArcball(e.clientX, e.clientY);
      const screenRotation = new THREE.Quaternion().setFromUnitVectors(
        dragStartVector,
        currentVector
      );
      const activeCamera = getActiveCamera();
      const cameraWorldQuaternion = activeCamera.quaternion.clone();
      const worldRotation = cameraWorldQuaternion
        .clone()
        .multiply(screenRotation)
        .multiply(cameraWorldQuaternion.clone().invert())
        .normalize();

      // Rotate camera direction vector on the hemisphere
      const startCamVec = viewingBearingPitchToCameraSpherePosition(
        dragStartBearing,
        dragStartPitch,
        1
      );
      const rotated = startCamVec.clone().applyQuaternion(worldRotation);
      const next = cameraSpherePositionToViewingBearingPitch(rotated);

      const minPitch = lastSpecification.limits?.minPitch ?? 0;
      options.onPoseChange?.(next.bearing, clamp(next.pitch, minPitch, Math.PI / 2));
    } else if (dragMode === "orbit") {
      // Incremental pointer-delta orbit avoids unstable fast spins when the
      // arcball pointer crosses the flattened outer ring.
      const rect = canvas.getBoundingClientRect();
      const deltaX = (e.clientX - dragLastClientX) / Math.max(rect.width, 1);
      const deltaY = (e.clientY - dragLastClientY) / Math.max(rect.height, 1);
      const orbitSensitivity = Math.PI * 1.2;

      orbitTheta -= deltaX * orbitSensitivity;
      orbitPhi = clamp(
        orbitPhi - deltaY * orbitSensitivity,
        0.15,
        Math.PI * 0.48
      );
      dragLastClientX = e.clientX;
      dragLastClientY = e.clientY;

      syncCamerasToOrbit();
      const anchors = update(lastSpecification);
      options.onInteraction?.(anchors);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragMode) return;
    dragMode = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "grab";
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.style.cursor = "grab";

  // --- Resize ---
  const resize = (nextSize: ViewStateVisualizerSize) => {
    size = nextSize;
    renderer.setSize(size.widthPx, size.heightPx, false);
    perspectiveCamera.aspect = size.widthPx / size.heightPx;
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();
    setWideLineResolution(bearingArc, size);
    setWideLineResolution(pitchArc, size);
    setWideLineResolution(bearingIndicatorArc, size);
    setWideLineResolution(bearingRadial, size);
    setWideLineResolution(pitchOriginLine, size);
    setWideLineResolution(elevationArc, size);
    setWideLineResolution(cameraLink, size);
    setWideLineResolution(altitudeLineLower, size);
    setWideLineResolution(altitudeLineUpper, size);
    setWideLineResolution(altitudeScaleBreakUpper, size);
    setWideLineResolution(altitudeScaleBreakLower, size);
    const aspect = size.widthPx / size.heightPx;
    orthographicCamera.left = -baseTangentProduct * aspect;
    orthographicCamera.right = baseTangentProduct * aspect;
    orthographicCamera.top = baseTangentProduct;
    orthographicCamera.bottom = -baseTangentProduct;
    orthographicCamera.updateProjectionMatrix();
    orthographicCamera.updateMatrixWorld();
  };

  // --- setDisplay ---
  const setDisplay = (
    displayOptions: ViewStateVisualizerDisplayOptions
  ): ViewStateVisualizerLabelAnchors | null => {
    currentDisplay = { ...currentDisplay, ...displayOptions };
    applyDisplayOptions(currentDisplay);

    canvas.style.cursor = dragMode ? "grabbing" : "grab";

    if (lastSpecification) {
      return update(lastSpecification);
    }
    return null;
  };

  // --- Dispose ---
  const dispose = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);

    renderer.dispose();
    hemisphere.geometry.dispose();
    (hemisphere.material as THREE.Material).dispose();
    planeDisc.geometry.dispose();
    (planeDisc.material as THREE.Material).dispose();
    planeDiscOutline.geometry.dispose();
    (planeDiscOutline.material as THREE.Material).dispose();
    minPitchRing.geometry.dispose();
    (minPitchRing.material as THREE.Material).dispose();
    northSouthGreatCircle.geometry.dispose();
    (northSouthGreatCircle.material as THREE.Material).dispose();
    eastWestGreatCircle.geometry.dispose();
    (eastWestGreatCircle.material as THREE.Material).dispose();
    (cameraLink.geometry as LineGeometry).dispose();
    (cameraLink.material as LineMaterial).dispose();
    (altitudeLineLower.geometry as LineGeometry).dispose();
    (altitudeLineLower.material as LineMaterial).dispose();
    (altitudeLineUpper.geometry as LineGeometry).dispose();
    (altitudeLineUpper.material as LineMaterial).dispose();
    (altitudeScaleBreakUpper.geometry as LineGeometry).dispose();
    (altitudeScaleBreakUpper.material as LineMaterial).dispose();
    (altitudeScaleBreakLower.geometry as LineGeometry).dispose();
    (altitudeScaleBreakLower.material as LineMaterial).dispose();
    (bearingArc.geometry as LineGeometry).dispose();
    (bearingArc.material as LineMaterial).dispose();
    (pitchArc.geometry as LineGeometry).dispose();
    (pitchArc.material as LineMaterial).dispose();
    (bearingIndicatorArc.geometry as LineGeometry).dispose();
    (bearingIndicatorArc.material as LineMaterial).dispose();
    (bearingRadial.geometry as LineGeometry).dispose();
    (bearingRadial.material as LineMaterial).dispose();
    (pitchOriginLine.geometry as LineGeometry).dispose();
    (pitchOriginLine.material as LineMaterial).dispose();
    (elevationArc.geometry as LineGeometry).dispose();
    (elevationArc.material as LineMaterial).dispose();
    eastAxis.geometry.dispose();
    (eastAxis.material as THREE.Material).dispose();
    northAxis.geometry.dispose();
    (northAxis.material as THREE.Material).dispose();
    upAxis.geometry.dispose();
    (upAxis.material as THREE.Material).dispose();
    cameraForward.geometry.dispose();
    (cameraForward.material as THREE.Material).dispose();
    cameraRight.geometry.dispose();
    (cameraRight.material as THREE.Material).dispose();
    cameraUp.geometry.dispose();
    (cameraUp.material as THREE.Material).dispose();
    imagePlaneSurface.geometry.dispose();
    (imagePlaneSurface.material as THREE.Material).dispose();
    imagePlaneOriginX.geometry.dispose();
    (imagePlaneOriginX.material as THREE.Material).dispose();
    imagePlaneOriginY.geometry.dispose();
    (imagePlaneOriginY.material as THREE.Material).dispose();
    frustumEdgeLines.forEach((line) => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    cameraMarker.geometry.dispose();
    (cameraMarker.material as THREE.Material).dispose();
  };

  return {
    update,
    resize,
    setDisplay,
    dispose,
  };
};
