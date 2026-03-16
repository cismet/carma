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

const orbitAnglesToPosition = ({
  radius,
  theta,
  phi,
}: {
  radius: number;
  theta: number;
  phi: number;
}) => ({
  x: radius * Math.sin(phi) * Math.sin(theta),
  y: radius * Math.cos(phi),
  z: radius * Math.sin(phi) * Math.cos(theta),
});

const resolveDefaultFrameHalfExtent = () =>
  HEMISPHERE_RADIUS + VISUALIZER_FRAME_PADDING;

const resolveOrbitRadiusForFrameHalfExtent = (fovDeg: number) =>
  resolveDefaultFrameHalfExtent() / Math.tan((fovDeg * Math.PI) / 360);

const DEFAULT_CAMERA: ViewStateVisualizerCamera = {
  fovDeg: DEFAULT_VIEW_FOV_DEG,
  position: orbitAnglesToPosition({
    radius: resolveOrbitRadiusForFrameHalfExtent(DEFAULT_VIEW_FOV_DEG),
    theta: DEFAULT_VIEW_ROTATION_AROUND_UP,
    phi: DEFAULT_VIEW_ORBIT_PHI,
  }),
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
const ALTITUDE_OVERFLOW_DOTTED_FRACTION = HEMISPHERE_RADIUS * 0.16;
const OUTER_ARC_RADIUS = HEMISPHERE_RADIUS;
const GRATICULE_CARDINAL_OPACITY = 0.42;
const LABEL_UP_OFFSET = HEMISPHERE_RADIUS * 0.01;
const CAMERA_GREY = 0x94a3b8;
const CAMERA_GREY_DARK = 0x64748b;
const CAMERA_GREY_EMISSIVE = 0x334155;
const ALTITUDE_GREY = 0x94a3b8;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeHeading = (headingRadians: number): number => {
  const fullTurn = Math.PI * 2;
  const normalized = headingRadians % fullTurn;
  return normalized >= 0 ? normalized : normalized + fullTurn;
};

const pointOnHeadingCircle = ({
  heading,
  radius,
  y = 0,
}: {
  heading: number;
  radius: number;
  y?: number;
}): THREE.Vector3 =>
  new THREE.Vector3(
    Math.sin(heading) * radius,
    y,
    -Math.cos(heading) * radius
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
      overflowMiddleSegment: null as THREE.Vector3[] | null,
    };
  }

  const midpointY = planeDiscY * 0.5;
  const gapUpperY = midpointY + ALTITUDE_OVERFLOW_DOTTED_FRACTION;
  const gapLowerY = midpointY - ALTITUDE_OVERFLOW_DOTTED_FRACTION;

  return {
    stemSegments: [
      [
        new THREE.Vector3(0, planeDiscY, 0),
        new THREE.Vector3(0, gapUpperY, 0),
      ],
      [new THREE.Vector3(0, gapLowerY, 0), ORIGIN.clone()],
    ],
    overflowMiddleSegment: [
      new THREE.Vector3(0, gapUpperY, 0),
      new THREE.Vector3(0, gapLowerY, 0),
    ],
  };
};

const readHorizontalFov = (
  cameraModel: ViewStateVisualizerSpecification
): number | null => {
  const intrinsics = cameraModel.intrinsics;
  const fovHorizontal = intrinsics?.fovHorizontal;
  const fovVertical = intrinsics?.fov;
  const aspect = intrinsics?.aspect;

  if (isFiniteNumber(fovHorizontal)) {
    return fovHorizontal;
  }

  if (isFiniteNumber(fovVertical) && isFiniteNumber(aspect)) {
    return Math.atan(Math.tan(fovVertical * 0.5) * aspect) * 2;
  }

  return null;
};

const readVerticalFov = (
  cameraModel: ViewStateVisualizerSpecification
): number | null => {
  const intrinsics = cameraModel.intrinsics;
  const fovVertical = intrinsics?.fov;
  const fovHorizontal = intrinsics?.fovHorizontal;
  const aspect = intrinsics?.aspect;

  if (isFiniteNumber(fovVertical)) {
    return fovVertical;
  }

  if (isFiniteNumber(fovHorizontal) && isFiniteNumber(aspect)) {
    return Math.atan(Math.tan(fovHorizontal * 0.5) / aspect) * 2;
  }

  return null;
};

const headingPitchToCameraPosition = (
  heading: number,
  pitch: number,
  radius: number = HEMISPHERE_RADIUS
): THREE.Vector3 => {
  const elevation = clamp(-pitch, 0, Math.PI / 2);
  return pointOnHeadingCircle({
    heading: normalizeHeading(heading),
    radius: Math.cos(elevation) * radius,
    y: Math.sin(elevation) * radius,
  });
};

const cameraPositionToHeadingPitch = (
  position: THREE.Vector3
): { heading: number; pitch: number; elevation: number } => {
  const normalized = position.clone().normalize();
  const elevation = Math.asin(clamp(normalized.y, -1, 1));
  return {
    heading: normalizeHeading(Math.atan2(normalized.x, -normalized.z)),
    pitch: -elevation,
    elevation,
  };
};

const computeUnitHemisphereCameraPosition = (
  cameraModel: ViewStateVisualizerSpecification
): THREE.Vector3 => {
  // This visualizer is explicitly object-centric: the unit-sphere camera position
  // must come from heading/pitch, not from an engine-specific world direction.
  // Otherwise the visual can disagree with the canonical pose readout.
  return headingPitchToCameraPosition(
    cameraModel.pose.heading,
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
    return pointOnHeadingCircle({
      heading: angle,
      radius,
      y,
    });
  });

const buildPitchArcPoints = ({
  heading,
  elevation,
  radius,
  sampleCount = 28,
}: {
  heading: number;
  elevation: number;
  radius: number;
  sampleCount?: number;
}): THREE.Vector3[] =>
  Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const angle = elevation * t;
    const point = new THREE.Vector3(0, Math.sin(angle) * radius, -Math.cos(angle) * radius);
    point.applyAxisAngle(WORLD_UP, -heading);
    return point;
  });

const buildMeridianPoints = ({
  heading,
  sampleCount = 48,
}: {
  heading: number;
  sampleCount?: number;
}) =>
  Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const elevation = t * (Math.PI / 2);
    return new THREE.Vector3(
      Math.sin(heading) * Math.cos(elevation) * HEMISPHERE_RADIUS,
      Math.sin(elevation) * HEMISPHERE_RADIUS,
      -Math.cos(heading) * Math.cos(elevation) * HEMISPHERE_RADIUS
    );
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
  const aspect = cameraModel.intrinsics?.aspect;
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
        : clamp(
            croppedHalfHeight * (isFiniteNumber(aspect) ? aspect : 1.4),
            0.12,
            MAX_IMAGE_PLANE_HALF_EXTENT
          );

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

const setWideLineWidth = (line: Line2, width: number) => {
  (line.material as LineMaterial).linewidth = width;
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
  const initialOrbitRadius = Math.sqrt(
    cameraConfig.position.x ** 2 +
    cameraConfig.position.y ** 2 +
    cameraConfig.position.z ** 2
  );
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

  const syncCamerasToOrbit = () => {
    const r = getOrbitRadius();
    const x = r * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = r * Math.cos(orbitPhi);
    const z = r * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    perspectiveCamera.position.set(x, y, z);
    perspectiveCamera.lookAt(0, 0, 0);
    perspectiveCamera.updateMatrixWorld();
    orthographicCamera.position.set(x, y, z);
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
  // For pose: the heading/pitch at drag start
  let dragStartHeading = 0;
  let dragStartPitch = 0;

  const pointerToArcball = (clientX: number, clientY: number): THREE.Vector3 => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    // Use screen-space y-down here so vertical drag follows the pointer 1:1
    // in the visualizer's pose-drag interaction.
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
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
    new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      roughness: 0.8,
      metalness: 0.02,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.03,
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

  const altitudeOverflowMiddle = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: ALTITUDE_GREY,
      transparent: true,
      opacity: 0.98,
      dashed: true,
      dashSize: HEMISPHERE_RADIUS * 0.014,
      gapSize: HEMISPHERE_RADIUS * 0.018,
    })
  );
  setWideLineResolution(altitudeOverflowMiddle, size);
  scene.add(altitudeOverflowMiddle);

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

  const headingIndicatorArc = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.88,
    })
  );
  setWideLineResolution(headingIndicatorArc, size);
  scene.add(headingIndicatorArc);

  const headingRadial = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.88,
    })
  );
  setWideLineResolution(headingRadial, size);
  scene.add(headingRadial);

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
      opacity: 0.82,
    })
  );
  scene.add(cameraRight);

  const cameraUp = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x15803d,
      transparent: true,
      opacity: 0.82,
    })
  );
  scene.add(cameraUp);

  const imagePlaneOutline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.82,
    })
  );
  scene.add(imagePlaneOutline);

  const fullImagePlaneOutline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.3,
    })
  );
  scene.add(fullImagePlaneOutline);

  const imagePlaneOriginX = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.58,
    })
  );
  scene.add(imagePlaneOriginX);

  const imagePlaneOriginY = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.58,
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
    const showFrustum = display.showFrustum ?? true;
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
    headingIndicatorArc.visible = showAngleArcs;
    headingRadial.visible = showAngleArcs;
    pitchOriginLine.visible = showAngleArcs;
    elevationArc.visible = showAngleArcs;
    // minPitchRing visibility also depends on data; handled in update

    cameraForward.visible = showImagePlane;
    cameraRight.visible = showImagePlane;
    cameraUp.visible = showImagePlane;
    imagePlaneOutline.visible = showImagePlane;
    fullImagePlaneOutline.visible = showImagePlane;
    imagePlaneOriginX.visible = showImagePlane;
    imagePlaneOriginY.visible = showImagePlane;

    // frustumEdgeLines visibility also depends on data; handled in update

    cameraLink.visible = showLink;

    planeDisc.visible = showAltitude;
    planeDiscOutline.visible = showAltitude;
    altitudeLineLower.visible = showAltitude;
    altitudeLineUpper.visible = showAltitude;
    // altitudeOverflowMiddle visibility depends on data; handled in update

    // Line widths: graticuleLineWidth is the base, others are multipliers on it
    const base = display.graticuleLineWidth ?? 1;
    const axisW = base * (display.axisLineWidth ?? 2);
    const arcW = base * (display.arcLineWidth ?? 2);
    const imagePlaneW = base * (display.imagePlaneLineWidth ?? 2);
    const frustumW = (base * (display.frustumLineWidth ?? 2)) * (2 / 3);
    const angleCueW = Math.max(0.75, arcW * 0.75);
    const altitudeW = angleCueW;

    const cardinalGraticuleWidth = base / 16;
    graticuleCardinalLines.forEach((line) => setLineWidth(line, cardinalGraticuleWidth));
    setLineWidth(minPitchRing, arcW);

    setLineWidth(eastAxis, axisW);
    setLineWidth(northAxis, axisW);
    setLineWidth(upAxis, axisW);

    setWideLineWidth(bearingArc, angleCueW);
    setWideLineWidth(pitchArc, angleCueW);
    setWideLineWidth(headingIndicatorArc, angleCueW);
    setWideLineWidth(headingRadial, angleCueW);
    setWideLineWidth(pitchOriginLine, angleCueW);
    setWideLineWidth(elevationArc, angleCueW);
    setWideLineWidth(cameraLink, angleCueW);

    setLineWidth(imagePlaneOutline, imagePlaneW);
    setLineWidth(fullImagePlaneOutline, imagePlaneW);
    setLineWidth(imagePlaneOriginX, imagePlaneW);
    setLineWidth(imagePlaneOriginY, imagePlaneW);
    setLineWidth(cameraForward, imagePlaneW);
    setLineWidth(cameraRight, imagePlaneW);
    setLineWidth(cameraUp, imagePlaneW);

    frustumEdgeLines.forEach((line) => setLineWidth(line, frustumW));

    setWideLineWidth(altitudeLineLower, altitudeW);
    setWideLineWidth(altitudeLineUpper, altitudeW);
    setWideLineWidth(altitudeOverflowMiddle, altitudeW);
    setLineWidth(planeDiscOutline, altitudeW);

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
      heading,
      pitch,
      elevation,
    } = cameraPositionToHeadingPitch(displayCameraPosition);
    const visualHeading = normalizeHeading(heading + Math.PI);
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
    const maxPitchElevation = isFiniteNumber(cameraModel.limits?.maxPitch)
      ? clamp(-(cameraModel.limits?.maxPitch ?? 0), 0, Math.PI / 2)
      : null;
    const maxPitchRingPoints =
      maxPitchElevation === null
        ? null
        : buildCirclePoints({
            radius: Math.cos(maxPitchElevation) * HEMISPHERE_RADIUS,
            axis: "xz",
            offset: new THREE.Vector3(
              0,
              Math.sin(maxPitchElevation) * HEMISPHERE_RADIUS,
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
    if (maxPitchRingPoints) {
      setLineGeometry(minPitchRing, maxPitchRingPoints);
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
    if (altitudeStemGeometry.overflowMiddleSegment) {
      setWideLineGeometry(
        altitudeOverflowMiddle,
        altitudeStemGeometry.overflowMiddleSegment
      );
      altitudeOverflowMiddle.visible = showAltitude && showAltitudeScaleBreak;
    } else {
      setWideLineGeometry(altitudeOverflowMiddle, [ORIGIN.clone(), ORIGIN.clone()]);
      altitudeOverflowMiddle.visible = false;
    }
    const headingArcPoints = buildHorizontalArcPoints({
      radius: OUTER_ARC_RADIUS,
      startAngle: 0,
      endAngle: visualHeading,
      y: 0,
    });
    const pitchIndicatorArcPoints = buildPitchArcPoints({
      heading,
      elevation,
      radius: ANGLE_INDICATOR_RADIUS,
    });
    const headingIndicatorArcPoints = buildHorizontalArcPoints({
      radius: ANGLE_INDICATOR_RADIUS,
      startAngle: 0,
      endAngle: visualHeading,
      y: 0,
    });
    const elevationArcPoints = buildPitchArcPoints({
      heading,
      elevation,
      radius: OUTER_ARC_RADIUS,
    });
    setWideLineGeometry(bearingArc, headingArcPoints);
    setWideLineGeometry(pitchArc, pitchIndicatorArcPoints);
    setWideLineGeometry(headingIndicatorArc, headingIndicatorArcPoints);
    const pitchArcStartPoint = pointOnHeadingCircle({
      heading,
      radius: OUTER_ARC_RADIUS,
    });
    // EN radial part for heading/range cue.
    const headingEquatorPoint = pointOnHeadingCircle({
      heading: visualHeading,
      radius: OUTER_ARC_RADIUS,
    });
    setWideLineGeometry(headingRadial, [
      headingEquatorPoint,
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
    setLineGeometry(imagePlaneOutline, [
      ...visual.imagePlaneCorners,
    ]);
    setLineGeometry(fullImagePlaneOutline, [
      ...visual.fullImagePlaneCorners,
    ]);
    fullImagePlaneOutline.visible =
      (currentDisplay.showImagePlane ?? true) && visual.hasViewOffset;
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
    const headingArcMidpoint =
      headingArcPoints[Math.floor(headingArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const pitchArcMidpoint =
      elevationArcPoints[Math.floor(elevationArcPoints.length * 0.5)] ??
      ORIGIN.clone();
    const headingAnchor = projectOrthogonalPolylineLabelAnchor({
      points: headingArcPoints,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: headingArcMidpoint.clone().multiplyScalar(1.08),
    });
    const pitchAnchor = projectOrthogonalPolylineLabelAnchor({
      points: elevationArcPoints,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: pitchArcMidpoint.clone().multiplyScalar(1.08),
    });
    const rangeAnchor = projectOrthogonalLineLabelAnchor({
      lineStart: ORIGIN,
      lineEnd: pitchArcStartPoint,
      size,
      camera: activeCamera,
      offsetPx: labelFontSizePx,
      biasToward: visual.cameraPosition,
    });

    return {
      heading: headingAnchor,
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
      const displayPose = cameraPositionToHeadingPitch(displayCameraPosition);
      dragStartHeading = displayPose.heading;
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
      const startCamVec = headingPitchToCameraPosition(
        dragStartHeading,
        dragStartPitch,
        1
      );
      const rotated = startCamVec.clone().applyQuaternion(worldRotation);
      const next = cameraPositionToHeadingPitch(rotated);

      const maxPitch = lastSpecification.limits?.maxPitch ?? 0;
      options.onPoseChange?.(next.heading, clamp(next.pitch, -Math.PI / 2, maxPitch));
    } else if (dragMode === "orbit") {
      // Incremental pointer-delta orbit avoids unstable fast spins when the
      // arcball pointer crosses the flattened outer ring.
      const rect = canvas.getBoundingClientRect();
      const deltaX = (e.clientX - dragLastClientX) / Math.max(rect.width, 1);
      const deltaY = (e.clientY - dragLastClientY) / Math.max(rect.height, 1);
      const orbitSensitivity = Math.PI * 1.2;

      orbitTheta -= deltaX * orbitSensitivity;
      orbitPhi = clamp(
        orbitPhi + deltaY * orbitSensitivity,
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
    setWideLineResolution(headingIndicatorArc, size);
    setWideLineResolution(headingRadial, size);
    setWideLineResolution(pitchOriginLine, size);
    setWideLineResolution(elevationArc, size);
    setWideLineResolution(cameraLink, size);
    setWideLineResolution(altitudeLineLower, size);
    setWideLineResolution(altitudeLineUpper, size);
    setWideLineResolution(altitudeOverflowMiddle, size);
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
    (altitudeOverflowMiddle.geometry as LineGeometry).dispose();
    (altitudeOverflowMiddle.material as LineMaterial).dispose();
    (bearingArc.geometry as LineGeometry).dispose();
    (bearingArc.material as LineMaterial).dispose();
    (pitchArc.geometry as LineGeometry).dispose();
    (pitchArc.material as LineMaterial).dispose();
    (headingIndicatorArc.geometry as LineGeometry).dispose();
    (headingIndicatorArc.material as LineMaterial).dispose();
    (headingRadial.geometry as LineGeometry).dispose();
    (headingRadial.material as LineMaterial).dispose();
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
    imagePlaneOutline.geometry.dispose();
    (imagePlaneOutline.material as THREE.Material).dispose();
    fullImagePlaneOutline.geometry.dispose();
    (fullImagePlaneOutline.material as THREE.Material).dispose();
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
