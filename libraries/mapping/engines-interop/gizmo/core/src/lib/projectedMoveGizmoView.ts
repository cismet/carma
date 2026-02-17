import {
  buildCirclePoints,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  getSupportRadius2d,
  type Point2,
} from "@carma-commons/math";
import {
  createAxisDragConnector,
  type GizmoAxisDragConnector,
} from "./axisDragConnector";
import {
  AXIS_NUMERIC_EPSILON,
  gizmoDot,
  gizmoNormalize,
  type GizmoAxisCandidate,
  type GizmoRay3,
  type GizmoVec3,
} from "./gizmoMath";
import { toSvgPathD, transformPointWithMatrix } from "./svgProjection";

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_FOV_DEG = 55;
const DEFAULT_DISC_RADIUS = 1.2;
const DEFAULT_ACTIVE_ARROW_EDGE_PX = 16;
const DEFAULT_INACTIVE_ARROW_EDGE_PX = 12;
const DEFAULT_AXIS_LINE_WIDTH_PX = 1;
const DEFAULT_OUTLINE_STROKE_WIDTH_PX = 1.5;
const DEFAULT_DISC_CURSOR = "move";
const DISC_OUTLINE_SEGMENTS = 72;
const DISC_OUTLINE_COLOR = "rgba(255,255,255,0.92)";
const DISC_OUTLINE_BASE_OPACITY = 0.92;
const DISC_SVG_EXTENT = 320;
const DISC_SVG_HALF_EXTENT = DISC_SVG_EXTENT / 2;
const INACTIVE_AXIS_OPACITY = 1;
const ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.3;
const INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.05;
const AXIS_LINE_LAYER_Z_INDEX = 0;
const DISC_LAYER_Z_INDEX = 1;
const CENTER_HIT_LAYER_Z_INDEX = 2;
const ARROW_LAYER_Z_INDEX = 3;
const ROTATION_HANDLE_RADIUS_PX = 8;
const ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD = -Math.PI / 4;

const cloneVec3 = (v: GizmoVec3): GizmoVec3 => ({ x: v.x, y: v.y, z: v.z });

const addVec3 = (a: GizmoVec3, b: GizmoVec3): GizmoVec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

const subVec3 = (a: GizmoVec3, b: GizmoVec3): GizmoVec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const mulVec3Scalar = (v: GizmoVec3, scalar: number): GizmoVec3 => ({
  x: v.x * scalar,
  y: v.y * scalar,
  z: v.z * scalar,
});

const addScaledVec3 = (
  origin: GizmoVec3,
  direction: GizmoVec3,
  scalar: number
): GizmoVec3 => addVec3(origin, mulVec3Scalar(direction, scalar));

const crossVec3 = (a: GizmoVec3, b: GizmoVec3): GizmoVec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type Matrix3 = {
  a11: number;
  a12: number;
  a13: number;
  a21: number;
  a22: number;
  a23: number;
  a31: number;
  a32: number;
  a33: number;
};

type Mat3Inverse = {
  determinant: number;
  inverse: Matrix3;
};

const extractLinear3x3 = (matrix: readonly number[]): Matrix3 => ({
  a11: matrix[0] ?? 1,
  a12: matrix[1] ?? 0,
  a13: matrix[2] ?? 0,
  a21: matrix[4] ?? 0,
  a22: matrix[5] ?? 1,
  a23: matrix[6] ?? 0,
  a31: matrix[8] ?? 0,
  a32: matrix[9] ?? 0,
  a33: matrix[10] ?? 1,
});

const invert3x3 = (matrix: Matrix3): Mat3Inverse | null => {
  const { a11, a12, a13, a21, a22, a23, a31, a32, a33 } = matrix;

  const b11 = a22 * a33 - a23 * a32;
  const b12 = -(a21 * a33 - a23 * a31);
  const b13 = a21 * a32 - a22 * a31;

  const b21 = -(a12 * a33 - a13 * a32);
  const b22 = a11 * a33 - a13 * a31;
  const b23 = -(a11 * a32 - a12 * a31);

  const b31 = a12 * a23 - a13 * a22;
  const b32 = -(a11 * a23 - a13 * a21);
  const b33 = a11 * a22 - a12 * a21;

  const determinant = a11 * b11 + a12 * b12 + a13 * b13;
  if (Math.abs(determinant) <= AXIS_NUMERIC_EPSILON) return null;

  const invDet = 1 / determinant;
  return {
    determinant,
    inverse: {
      a11: b11 * invDet,
      a12: b21 * invDet,
      a13: b31 * invDet,
      a21: b12 * invDet,
      a22: b22 * invDet,
      a23: b32 * invDet,
      a31: b13 * invDet,
      a32: b23 * invDet,
      a33: b33 * invDet,
    },
  };
};

const multiplyMat3Vec3 = (matrix: Matrix3, vector: GizmoVec3): GizmoVec3 => ({
  x: matrix.a11 * vector.x + matrix.a12 * vector.y + matrix.a13 * vector.z,
  y: matrix.a21 * vector.x + matrix.a22 * vector.y + matrix.a23 * vector.z,
  z: matrix.a31 * vector.x + matrix.a32 * vector.y + matrix.a33 * vector.z,
});

type ProjectedPoint = {
  x: number;
  y: number;
  depth: number;
};

const projectPointToViewport = (
  point: GizmoVec3,
  viewMatrix: number[],
  viewportRect: DOMRect | ClientRect,
  fovDeg: number
): ProjectedPoint | null => {
  const safeWidth = Math.max(1, viewportRect.width);
  const safeHeight = Math.max(1, viewportRect.height);
  const safeFov = clamp(fovDeg, 10, 150);
  const tanHalfFov = Math.tan(toRad(safeFov) / 2);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= AXIS_NUMERIC_EPSILON) {
    return null;
  }

  const view = transformPointWithMatrix(point, viewMatrix, {
    matrixOrder: "row-major",
  });
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.z)
  ) {
    return null;
  }
  if (view.z <= 0.05) return null;

  const aspect = safeWidth / safeHeight;
  const xNdc = view.x / (view.z * tanHalfFov * aspect);
  const yNdc = view.y / (view.z * tanHalfFov);
  if (!Number.isFinite(xNdc) || !Number.isFinite(yNdc)) return null;

  return {
    x: (xNdc + 1) * 0.5 * safeWidth,
    y: (1 - yNdc) * 0.5 * safeHeight,
    depth: view.z,
  };
};

const rayFromClientPosition = (
  clientX: number,
  clientY: number,
  viewportRect: DOMRect | ClientRect,
  viewMatrix: number[],
  fovDeg: number
): GizmoRay3 | null => {
  const safeWidth = Math.max(1, viewportRect.width);
  const safeHeight = Math.max(1, viewportRect.height);
  const safeFov = clamp(fovDeg, 10, 150);
  const tanHalfFov = Math.tan(toRad(safeFov) / 2);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= AXIS_NUMERIC_EPSILON) {
    return null;
  }

  const linear = extractLinear3x3(viewMatrix);
  const inverted = invert3x3(linear);
  if (!inverted) return null;

  const ndcX = ((clientX - viewportRect.left) / safeWidth) * 2 - 1;
  const ndcY = 1 - ((clientY - viewportRect.top) / safeHeight) * 2;
  const aspect = safeWidth / safeHeight;

  const directionView = gizmoNormalize(
    {
      x: ndcX * tanHalfFov * aspect,
      y: ndcY * tanHalfFov,
      z: 1,
    },
    AXIS_NUMERIC_EPSILON
  );
  if (!directionView) return null;

  const directionLocal = gizmoNormalize(
    multiplyMat3Vec3(inverted.inverse, directionView),
    AXIS_NUMERIC_EPSILON
  );
  if (!directionLocal) return null;

  const translationView: GizmoVec3 = {
    x: viewMatrix[3] ?? 0,
    y: viewMatrix[7] ?? 0,
    z: viewMatrix[11] ?? 0,
  };

  const originLocal = multiplyMat3Vec3(inverted.inverse, {
    x: -translationView.x,
    y: -translationView.y,
    z: -translationView.z,
  });

  return {
    origin: originLocal,
    direction: directionLocal,
  };
};

const intersectRayWithPlane = (
  ray: GizmoRay3,
  planeOrigin: GizmoVec3,
  planeNormal: GizmoVec3
): GizmoVec3 | null => {
  const denominator = gizmoDot(ray.direction, planeNormal);
  if (Math.abs(denominator) <= AXIS_NUMERIC_EPSILON) return null;

  const originToPlane = subVec3(planeOrigin, ray.origin);
  const t = gizmoDot(originToPlane, planeNormal) / denominator;
  if (!Number.isFinite(t)) return null;

  return addScaledVec3(ray.origin, ray.direction, t);
};

const createPlaneBasis = (
  normal: GizmoVec3
): { xAxis: GizmoVec3; yAxis: GizmoVec3 } => {
  const up = gizmoNormalize(normal) ?? { x: 0, y: 0, z: 1 };
  const reference =
    Math.abs(gizmoDot(up, { x: 0, y: 0, z: 1 })) > 0.9
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: 1 };
  const xAxis = gizmoNormalize(crossVec3(up, reference)) ?? {
    x: 1,
    y: 0,
    z: 0,
  };
  const yAxis = gizmoNormalize(crossVec3(xAxis, up)) ?? { x: 0, y: 1, z: 0 };
  return { xAxis, yAxis };
};

const ensureNormalizedAxisCandidates = (
  axisCandidates: ProjectedMoveGizmoAxisCandidate[]
): ProjectedMoveGizmoAxisCandidate[] => {
  const normalized = axisCandidates
    .map((candidate) => {
      const direction = gizmoNormalize(candidate.direction);
      if (!direction) return null;
      return {
        ...candidate,
        direction,
      };
    })
    .filter(
      (candidate): candidate is ProjectedMoveGizmoAxisCandidate =>
        candidate !== null
    );

  return normalized;
};

type AxisDomElements = {
  line: HTMLDivElement;
  arrowUpSvg: SVGSVGElement;
  arrowUpPath: SVGPathElement;
  arrowDownSvg: SVGSVGElement;
  arrowDownPath: SVGPathElement;
};

type DragState =
  | {
      mode: "axis";
      connector: GizmoAxisDragConnector;
      axisDirection: GizmoVec3;
      startPoint: GizmoVec3;
    }
  | {
      mode: "plane";
      planeNormal: GizmoVec3;
      startPoint: GizmoVec3;
      startPlanePoint: GizmoVec3;
    };

export type ProjectedMoveGizmoAxisCandidate = GizmoAxisCandidate<GizmoVec3>;

export type ProjectedMoveGizmoViewOptions = {
  container: HTMLElement;
  axisCandidates: ProjectedMoveGizmoAxisCandidate[];
  initialPoint?: GizmoVec3;
  initialActiveAxisId?: string | null;
  viewMatrix?: number[];
  fovDeg?: number;
  discRadius?: number;
  axisWidthPx?: number;
  outlineStrokeWidthPx?: number;
  arrowActiveEdgePx?: number;
  arrowInactiveEdgePx?: number;
  centerHitAreaPx?: number;
  centerPlaneDragCursor?: string;
  showRotationHandle?: boolean;
  getViewportRect?: () => DOMRect | ClientRect | null;
  onPointChange?: (point: GizmoVec3) => void;
  onActiveAxisChange?: (axisId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
};

export type ProjectedMoveGizmoView = {
  setPoint: (point: GizmoVec3) => void;
  getPoint: () => GizmoVec3;
  setViewMatrix: (viewMatrix: number[]) => void;
  setFovDeg: (fovDeg: number) => void;
  setDiscRadius: (discRadius: number) => void;
  setActiveAxisId: (axisId: string) => void;
  getActiveAxisId: () => string;
  refresh: () => void;
  destroy: () => void;
};

const createSvgElement = <T extends keyof SVGElementTagNameMap>(
  tagName: T
): SVGElementTagNameMap[T] =>
  document.createElementNS(SVG_NS, tagName) as SVGElementTagNameMap[T];

const styleSvgArrow = (svg: SVGSVGElement, edgePx: number, color: string) => {
  svg.setAttribute("viewBox", getEquilateralTriangleViewBox(edgePx));
  svg.style.width = `${edgePx}px`;
  svg.style.height = `${getEquilateralTriangleHeight(edgePx)}px`;
  svg.style.color = color;
};

const styleTrianglePath = (
  path: SVGPathElement,
  edgePx: number,
  outlineStrokeWidthPx: number
) => {
  path.setAttribute("d", getEquilateralTrianglePathD(edgePx));
  path.setAttribute("stroke-width", `${outlineStrokeWidthPx}`);
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
};

export const createProjectedMoveGizmoView = (
  options: ProjectedMoveGizmoViewOptions
): ProjectedMoveGizmoView => {
  const normalizedCandidates = ensureNormalizedAxisCandidates(
    options.axisCandidates
  );
  if (normalizedCandidates.length === 0) {
    throw new Error(
      "createProjectedMoveGizmoView requires at least one axis candidate with a valid direction."
    );
  }

  const axisWidthPx = options.axisWidthPx ?? DEFAULT_AXIS_LINE_WIDTH_PX;
  const outlineStrokeWidthPx =
    options.outlineStrokeWidthPx ?? DEFAULT_OUTLINE_STROKE_WIDTH_PX;
  const arrowActiveEdgePx = Math.max(
    1,
    options.arrowActiveEdgePx ?? DEFAULT_ACTIVE_ARROW_EDGE_PX
  );
  const arrowInactiveEdgePx = Math.max(
    1,
    options.arrowInactiveEdgePx ?? DEFAULT_INACTIVE_ARROW_EDGE_PX
  );
  const centerHitAreaPx = Math.max(12, options.centerHitAreaPx ?? 40);
  const centerPlaneDragCursor =
    options.centerPlaneDragCursor ?? DEFAULT_DISC_CURSOR;
  const showRotationHandle = options.showRotationHandle ?? true;

  let point = cloneVec3(options.initialPoint ?? { x: 0, y: 0, z: 0 });
  let activeAxisId =
    options.initialActiveAxisId &&
    normalizedCandidates.some(
      (candidate) => candidate.id === options.initialActiveAxisId
    )
      ? options.initialActiveAxisId
      : normalizedCandidates[0].id;

  let viewMatrix = Array.from(
    options.viewMatrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 4, 0, 0, 0, 1]
  );
  let fovDeg = options.fovDeg ?? DEFAULT_FOV_DEG;
  let discRadius = Math.max(
    AXIS_NUMERIC_EPSILON,
    options.discRadius ?? DEFAULT_DISC_RADIUS
  );
  let isDragging = false;
  let dragState: DragState | null = null;
  let stopWindowDragListeners: (() => void) | null = null;
  let destroyed = false;

  const axisScreenDirectionById: Record<
    string,
    {
      x: number;
      y: number;
      angleRad: number;
    }
  > = {};

  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-projected-move-gizmo-root", "true");
  overlayRoot.style.position = "absolute";
  overlayRoot.style.inset = "0";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.userSelect = "none";
  overlayRoot.style.overflow = "hidden";
  overlayRoot.style.zIndex = "8";

  const gizmoGroup = document.createElement("div");
  gizmoGroup.style.position = "absolute";
  gizmoGroup.style.left = "0px";
  gizmoGroup.style.top = "0px";
  gizmoGroup.style.transform = "translate(-50%, -50%)";
  gizmoGroup.style.width = "0";
  gizmoGroup.style.height = "0";
  gizmoGroup.style.overflow = "visible";
  gizmoGroup.style.pointerEvents = "none";

  const axisDomById: Record<string, AxisDomElements> = {};
  normalizedCandidates.forEach((candidate) => {
    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.height = `${axisWidthPx}px`;
    line.style.background = "rgba(255,255,255,0.82)";
    line.style.opacity = "1";
    line.style.zIndex = `${AXIS_LINE_LAYER_Z_INDEX}`;
    line.style.pointerEvents = "none";

    const arrowUpSvg = createSvgElement("svg");
    arrowUpSvg.setAttribute("data-projected-move-gizmo-interactive", "true");
    const arrowUpPath = createSvgElement("path");
    arrowUpPath.setAttribute("fill", "currentColor");
    arrowUpPath.setAttribute("stroke", "rgba(255, 255, 255, 0.95)");
    arrowUpPath.setAttribute("paint-order", "stroke");
    arrowUpPath.setAttribute("vector-effect", "non-scaling-stroke");
    arrowUpPath.setAttribute("shape-rendering", "geometricPrecision");
    styleTrianglePath(arrowUpPath, arrowActiveEdgePx, outlineStrokeWidthPx);
    arrowUpSvg.appendChild(arrowUpPath);
    arrowUpSvg.style.position = "absolute";
    arrowUpSvg.style.display = "block";
    arrowUpSvg.style.zIndex = `${ARROW_LAYER_Z_INDEX}`;
    arrowUpSvg.style.pointerEvents = "auto";
    arrowUpSvg.style.cursor = "move";
    arrowUpSvg.style.overflow = "visible";
    arrowUpSvg.style.transformOrigin = "50% 100%";
    arrowUpSvg.setAttribute("title", candidate.title ?? "Move along axis");
    styleSvgArrow(
      arrowUpSvg,
      arrowActiveEdgePx,
      candidate.color ?? "rgba(148, 163, 184, 0.98)"
    );

    const arrowDownSvg = createSvgElement("svg");
    arrowDownSvg.setAttribute("data-projected-move-gizmo-interactive", "true");
    const arrowDownPath = createSvgElement("path");
    arrowDownPath.setAttribute("fill", "currentColor");
    arrowDownPath.setAttribute("stroke", "rgba(255, 255, 255, 0.95)");
    arrowDownPath.setAttribute("paint-order", "stroke");
    arrowDownPath.setAttribute("vector-effect", "non-scaling-stroke");
    arrowDownPath.setAttribute("shape-rendering", "geometricPrecision");
    styleTrianglePath(arrowDownPath, arrowActiveEdgePx, outlineStrokeWidthPx);
    arrowDownSvg.appendChild(arrowDownPath);
    arrowDownSvg.style.position = "absolute";
    arrowDownSvg.style.display = "block";
    arrowDownSvg.style.zIndex = `${ARROW_LAYER_Z_INDEX}`;
    arrowDownSvg.style.pointerEvents = "auto";
    arrowDownSvg.style.cursor = "move";
    arrowDownSvg.style.overflow = "visible";
    arrowDownSvg.style.transformOrigin = "50% 100%";
    arrowDownSvg.setAttribute("title", candidate.title ?? "Move along axis");
    styleSvgArrow(
      arrowDownSvg,
      arrowActiveEdgePx,
      candidate.color ?? "rgba(148, 163, 184, 0.98)"
    );

    gizmoGroup.append(line, arrowUpSvg, arrowDownSvg);
    axisDomById[candidate.id] = {
      line,
      arrowUpSvg,
      arrowUpPath,
      arrowDownSvg,
      arrowDownPath,
    };
  });

  const discSvg = createSvgElement("svg");
  discSvg.setAttribute(
    "viewBox",
    `${-DISC_SVG_HALF_EXTENT} ${-DISC_SVG_HALF_EXTENT} ${DISC_SVG_EXTENT} ${DISC_SVG_EXTENT}`
  );
  discSvg.style.position = "absolute";
  discSvg.style.left = `${-DISC_SVG_HALF_EXTENT}px`;
  discSvg.style.top = `${-DISC_SVG_HALF_EXTENT}px`;
  discSvg.style.width = `${DISC_SVG_EXTENT}px`;
  discSvg.style.height = `${DISC_SVG_EXTENT}px`;
  discSvg.style.pointerEvents = "none";
  discSvg.style.overflow = "hidden";
  discSvg.style.zIndex = `${DISC_LAYER_Z_INDEX}`;

  const discPathById: Record<string, SVGPathElement> = {};
  normalizedCandidates.forEach((candidate) => {
    const path = createSvgElement("path");
    path.setAttribute("d", "");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", DISC_OUTLINE_COLOR);
    path.setAttribute("stroke-width", `${outlineStrokeWidthPx}`);
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("shape-rendering", "geometricPrecision");
    path.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
    path.style.display = "none";
    path.style.pointerEvents = "none";
    discSvg.appendChild(path);
    discPathById[candidate.id] = path;
  });

  const discInteractionPath = createSvgElement("path");
  discInteractionPath.setAttribute(
    "data-projected-move-gizmo-interactive",
    "true"
  );
  discInteractionPath.setAttribute("d", "");
  discInteractionPath.setAttribute("fill", "rgba(255,255,255,0.001)");
  discInteractionPath.setAttribute("stroke", "none");
  discInteractionPath.style.display = "none";
  discInteractionPath.style.pointerEvents = "auto";
  discInteractionPath.style.cursor = DEFAULT_DISC_CURSOR;
  discSvg.appendChild(discInteractionPath);

  const rotationHandle = createSvgElement("circle");
  rotationHandle.setAttribute("cx", "0");
  rotationHandle.setAttribute("cy", "0");
  rotationHandle.setAttribute("r", `${ROTATION_HANDLE_RADIUS_PX}`);
  rotationHandle.setAttribute("fill", DISC_OUTLINE_COLOR);
  rotationHandle.setAttribute("stroke", DISC_OUTLINE_COLOR);
  rotationHandle.setAttribute("stroke-width", `${outlineStrokeWidthPx}`);
  rotationHandle.style.display = showRotationHandle ? "block" : "none";
  rotationHandle.style.pointerEvents = "none";
  discSvg.appendChild(rotationHandle);

  const centerHit = document.createElement("div");
  centerHit.setAttribute("data-projected-move-gizmo-interactive", "true");
  centerHit.style.position = "absolute";
  centerHit.style.left = `${-centerHitAreaPx / 2}px`;
  centerHit.style.top = `${-centerHitAreaPx / 2}px`;
  centerHit.style.width = `${centerHitAreaPx}px`;
  centerHit.style.height = `${centerHitAreaPx}px`;
  centerHit.style.borderRadius = "50%";
  centerHit.style.background = "transparent";
  centerHit.style.zIndex = `${CENTER_HIT_LAYER_Z_INDEX}`;
  centerHit.style.pointerEvents = "auto";
  centerHit.style.cursor = centerPlaneDragCursor;
  centerHit.style.userSelect = "none";
  centerHit.title = "Move point in plane";

  gizmoGroup.append(discSvg, centerHit);
  overlayRoot.appendChild(gizmoGroup);
  options.container.appendChild(overlayRoot);

  const stopDragging = () => {
    if (stopWindowDragListeners) {
      stopWindowDragListeners();
      stopWindowDragListeners = null;
    }
    if (dragState?.mode === "axis") {
      dragState.connector.endDrag();
    }
    dragState = null;
    if (isDragging) {
      isDragging = false;
      options.onDragStateChange?.(false);
    }
  };

  const getAxisById = (
    axisId: string
  ): ProjectedMoveGizmoAxisCandidate | null =>
    normalizedCandidates.find((candidate) => candidate.id === axisId) ?? null;

  const resolveViewportRect = (): DOMRect | ClientRect | null => {
    return (
      options.getViewportRect?.() ?? options.container.getBoundingClientRect()
    );
  };

  const setPointInternal = (nextPoint: GizmoVec3, emit = true) => {
    point = cloneVec3(nextPoint);
    if (emit) {
      options.onPointChange?.(cloneVec3(point));
    }
  };

  const setActiveAxisInternal = (axisId: string, emit = true) => {
    if (!normalizedCandidates.some((candidate) => candidate.id === axisId)) {
      return;
    }
    activeAxisId = axisId;
    if (emit) {
      options.onActiveAxisChange?.(activeAxisId);
    }
  };

  const beginWindowDrag = (onMove: (moveEvent: MouseEvent) => void) => {
    const handleMove = (moveEvent: MouseEvent) => {
      onMove(moveEvent);
    };

    const handleStop = () => {
      stopDragging();
      refresh();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleStop);
    window.addEventListener("pointerup", handleStop);

    stopWindowDragListeners = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleStop);
      window.removeEventListener("pointerup", handleStop);
    };
  };

  const startAxisDrag = (clientX: number, clientY: number, axisId: string) => {
    const viewportRect = resolveViewportRect();
    const axis = getAxisById(axisId);
    if (!viewportRect || !axis) return;

    const ray = rayFromClientPosition(
      clientX,
      clientY,
      viewportRect,
      viewMatrix,
      fovDeg
    );
    if (!ray) return;

    const connector = createAxisDragConnector({
      axisOrigin: point,
      axisDirection: axis.direction,
      initialAxisParam: 0,
    });
    const started = connector.beginDragFromRay(ray);
    if (!started) return;

    stopDragging();
    setActiveAxisInternal(axisId);

    dragState = {
      mode: "axis",
      connector,
      axisDirection: axis.direction,
      startPoint: cloneVec3(point),
    };
    isDragging = true;
    options.onDragStateChange?.(true);

    beginWindowDrag((moveEvent) => {
      if (!dragState || dragState.mode !== "axis") return;
      const moveRect = resolveViewportRect();
      if (!moveRect) return;
      const moveRay = rayFromClientPosition(
        moveEvent.clientX,
        moveEvent.clientY,
        moveRect,
        viewMatrix,
        fovDeg
      );
      if (!moveRay) return;
      const nextAxisParam = dragState.connector.updateDragFromRay(moveRay);
      if (nextAxisParam === null) return;
      setPointInternal(
        addScaledVec3(
          dragState.startPoint,
          dragState.axisDirection,
          nextAxisParam
        )
      );
      refresh();
    });

    refresh();
  };

  const startPlaneDrag = (clientX: number, clientY: number) => {
    const viewportRect = resolveViewportRect();
    const activeAxis = getAxisById(activeAxisId);
    if (!viewportRect || !activeAxis) return;

    const ray = rayFromClientPosition(
      clientX,
      clientY,
      viewportRect,
      viewMatrix,
      fovDeg
    );
    if (!ray) return;
    const startPlanePoint = intersectRayWithPlane(
      ray,
      point,
      activeAxis.direction
    );
    if (!startPlanePoint) return;

    stopDragging();
    dragState = {
      mode: "plane",
      planeNormal: cloneVec3(activeAxis.direction),
      startPoint: cloneVec3(point),
      startPlanePoint,
    };
    isDragging = true;
    options.onDragStateChange?.(true);

    beginWindowDrag((moveEvent) => {
      if (!dragState || dragState.mode !== "plane") return;
      const moveRect = resolveViewportRect();
      if (!moveRect) return;
      const moveRay = rayFromClientPosition(
        moveEvent.clientX,
        moveEvent.clientY,
        moveRect,
        viewMatrix,
        fovDeg
      );
      if (!moveRay) return;
      const currentPlanePoint = intersectRayWithPlane(
        moveRay,
        dragState.startPoint,
        dragState.planeNormal
      );
      if (!currentPlanePoint) return;
      const delta = subVec3(currentPlanePoint, dragState.startPlanePoint);
      setPointInternal(addVec3(dragState.startPoint, delta));
      refresh();
    });

    refresh();
  };

  normalizedCandidates.forEach((candidate) => {
    const dom = axisDomById[candidate.id];
    dom.arrowUpSvg.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startAxisDrag(event.clientX, event.clientY, candidate.id);
    });
    dom.arrowDownSvg.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startAxisDrag(event.clientX, event.clientY, candidate.id);
    });
  });

  const handlePlaneMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startPlaneDrag(event.clientX, event.clientY);
  };

  discInteractionPath.addEventListener("mousedown", handlePlaneMouseDown);
  centerHit.addEventListener("mousedown", handlePlaneMouseDown);

  const refresh = () => {
    if (destroyed) return;
    const viewportRect = resolveViewportRect();
    if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0) {
      gizmoGroup.style.display = "none";
      return;
    }

    const anchorCanvas = projectPointToViewport(
      point,
      viewMatrix,
      viewportRect,
      fovDeg
    );
    if (!anchorCanvas) {
      gizmoGroup.style.display = "none";
      return;
    }

    gizmoGroup.style.display = "block";
    gizmoGroup.style.left = `${anchorCanvas.x}px`;
    gizmoGroup.style.top = `${anchorCanvas.y}px`;

    const projectedOutlinesByAxisId = new Map<
      string,
      {
        pathD: string;
        supportRadius: number;
      }
    >();

    normalizedCandidates.forEach((candidate) => {
      const pathEl = discPathById[candidate.id];
      const planeBasis = createPlaneBasis(candidate.direction);
      const circlePointsWorld = buildCirclePoints(
        discRadius,
        DISC_OUTLINE_SEGMENTS
      );

      const projectedOutlinePoints = circlePointsWorld
        .map((circlePoint): Point2 | null => {
          const worldPoint = addVec3(
            point,
            addVec3(
              mulVec3Scalar(planeBasis.xAxis, circlePoint.x),
              mulVec3Scalar(planeBasis.yAxis, circlePoint.y)
            )
          );
          const projected = projectPointToViewport(
            worldPoint,
            viewMatrix,
            viewportRect,
            fovDeg
          );
          if (!projected) return null;
          const localX = projected.x - anchorCanvas.x;
          const localY = projected.y - anchorCanvas.y;
          if (
            !Number.isFinite(localX) ||
            !Number.isFinite(localY) ||
            Math.abs(localX) > 8192 ||
            Math.abs(localY) > 8192
          ) {
            return null;
          }
          return { x: localX, y: localY };
        })
        .filter((sample): sample is Point2 => sample !== null);

      if (projectedOutlinePoints.length < 12) {
        pathEl.style.display = "none";
        pathEl.setAttribute("d", "");
        return;
      }

      const supportRadius = getSupportRadius2d(projectedOutlinePoints);
      const pathD = toSvgPathD(projectedOutlinePoints, {
        close: true,
        digits: 2,
      });

      projectedOutlinesByAxisId.set(candidate.id, {
        pathD,
        supportRadius: Math.max(supportRadius, 1),
      });

      pathEl.setAttribute("d", pathD);
      pathEl.style.display = candidate.id === activeAxisId ? "block" : "none";
      pathEl.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
      pathEl.style.stroke = DISC_OUTLINE_COLOR;
    });

    const activeOutline = projectedOutlinesByAxisId.get(activeAxisId);
    if (activeOutline) {
      discInteractionPath.setAttribute("d", activeOutline.pathD);
      discInteractionPath.style.display = "block";
    } else {
      discInteractionPath.setAttribute("d", "");
      discInteractionPath.style.display = "none";
    }
    discInteractionPath.style.cursor =
      isDragging && dragState?.mode === "plane"
        ? "grabbing"
        : centerPlaneDragCursor;

    const activeAxisCandidate =
      normalizedCandidates.find((candidate) => candidate.id === activeAxisId) ??
      null;

    if (showRotationHandle && activeOutline && activeAxisCandidate) {
      const handleAngleRad = ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD;
      let handleX = Math.cos(handleAngleRad) * activeOutline.supportRadius;
      let handleY = Math.sin(handleAngleRad) * activeOutline.supportRadius;

      // Keep the handle on the projected disc by projecting a real point on
      // the active disc in world/view space.
      const planeBasis = createPlaneBasis(activeAxisCandidate.direction);
      const worldHandlePoint = addVec3(
        point,
        addVec3(
          mulVec3Scalar(
            planeBasis.xAxis,
            Math.cos(handleAngleRad) * discRadius
          ),
          mulVec3Scalar(planeBasis.yAxis, Math.sin(handleAngleRad) * discRadius)
        )
      );
      const projectedHandlePoint = projectPointToViewport(
        worldHandlePoint,
        viewMatrix,
        viewportRect,
        fovDeg
      );
      if (projectedHandlePoint) {
        handleX = projectedHandlePoint.x - anchorCanvas.x;
        handleY = projectedHandlePoint.y - anchorCanvas.y;
      }

      rotationHandle.setAttribute("cx", `${handleX}`);
      rotationHandle.setAttribute("cy", `${handleY}`);
      rotationHandle.style.display = "block";
    } else {
      rotationHandle.style.display = "none";
    }

    const sampleDistance = Math.max(0.4, discRadius * 0.72);
    const defaultScreenDirection = { x: 0, y: -1, angleRad: -Math.PI / 2 };

    normalizedCandidates.forEach((candidate) => {
      const dom = axisDomById[candidate.id];
      const previousDirection =
        axisScreenDirectionById[candidate.id] ?? defaultScreenDirection;

      let axisDirX = previousDirection.x;
      let axisDirY = previousDirection.y;
      let axisAngleRad = previousDirection.angleRad;

      const plusPoint = projectPointToViewport(
        addScaledVec3(point, candidate.direction, sampleDistance),
        viewMatrix,
        viewportRect,
        fovDeg
      );
      const minusPoint = projectPointToViewport(
        addScaledVec3(point, candidate.direction, -sampleDistance),
        viewMatrix,
        viewportRect,
        fovDeg
      );

      if (plusPoint && minusPoint) {
        const dx = plusPoint.x - minusPoint.x;
        const dy = plusPoint.y - minusPoint.y;
        const len = Math.hypot(dx, dy);
        if (len > AXIS_NUMERIC_EPSILON) {
          let nextDirX = dx / len;
          let nextDirY = dy / len;
          let nextAngleRad = Math.atan2(nextDirY, nextDirX);

          const dotWithPrevious =
            nextDirX * previousDirection.x + nextDirY * previousDirection.y;
          if (dotWithPrevious < 0) {
            nextDirX *= -1;
            nextDirY *= -1;
            nextAngleRad += Math.PI;
          }

          axisDirX = nextDirX;
          axisDirY = nextDirY;
          axisAngleRad = nextAngleRad;
          axisScreenDirectionById[candidate.id] = {
            x: axisDirX,
            y: axisDirY,
            angleRad: axisAngleRad,
          };
        }
      }

      const isActiveAxis = candidate.id === activeAxisId;
      const axisOpacity = isActiveAxis ? 1 : INACTIVE_AXIS_OPACITY;
      const edgePx = isActiveAxis ? arrowActiveEdgePx : arrowInactiveEdgePx;
      const arrowHeight = getEquilateralTriangleHeight(edgePx);
      const supportRadius = activeOutline?.supportRadius ?? 0;
      const arrowOffsetPx = supportRadius
        ? Math.max(
            supportRadius *
              (isActiveAxis
                ? ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER
                : INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER),
            20
          )
        : 30;

      dom.line.style.left = `${-arrowOffsetPx}px`;
      dom.line.style.top = `${-axisWidthPx / 2}px`;
      dom.line.style.width = `${arrowOffsetPx * 2}px`;
      dom.line.style.transform = `rotate(${axisAngleRad}rad)`;
      dom.line.style.opacity = `${axisOpacity}`;

      styleSvgArrow(
        dom.arrowUpSvg,
        edgePx,
        candidate.color ?? "rgba(148, 163, 184, 0.98)"
      );
      styleTrianglePath(dom.arrowUpPath, edgePx, outlineStrokeWidthPx);
      dom.arrowUpSvg.style.left = `${axisDirX * arrowOffsetPx - edgePx / 2}px`;
      dom.arrowUpSvg.style.top = `${axisDirY * arrowOffsetPx - arrowHeight}px`;
      dom.arrowUpSvg.style.transform = `rotate(${
        axisAngleRad + Math.PI / 2
      }rad)`;
      dom.arrowUpSvg.style.opacity = `${axisOpacity}`;
      dom.arrowUpSvg.style.cursor = isDragging ? "grabbing" : "move";

      styleSvgArrow(
        dom.arrowDownSvg,
        edgePx,
        candidate.color ?? "rgba(148, 163, 184, 0.98)"
      );
      styleTrianglePath(dom.arrowDownPath, edgePx, outlineStrokeWidthPx);
      dom.arrowDownSvg.style.left = `${
        -axisDirX * arrowOffsetPx - edgePx / 2
      }px`;
      dom.arrowDownSvg.style.top = `${
        -axisDirY * arrowOffsetPx - arrowHeight
      }px`;
      dom.arrowDownSvg.style.transform = `rotate(${
        axisAngleRad + Math.PI / 2 + Math.PI
      }rad)`;
      dom.arrowDownSvg.style.opacity = `${axisOpacity}`;
      dom.arrowDownSvg.style.cursor = isDragging ? "grabbing" : "move";
    });

    centerHit.style.cursor =
      isDragging && dragState?.mode === "plane"
        ? "grabbing"
        : centerPlaneDragCursor;
  };

  const setPoint = (nextPoint: GizmoVec3) => {
    setPointInternal(nextPoint, false);
    refresh();
  };

  const setViewMatrix = (nextViewMatrix: number[]) => {
    viewMatrix = Array.from(nextViewMatrix);
    refresh();
  };

  const setFov = (nextFovDeg: number) => {
    fovDeg = nextFovDeg;
    refresh();
  };

  const setRadius = (nextDiscRadius: number) => {
    discRadius = Math.max(AXIS_NUMERIC_EPSILON, nextDiscRadius);
    refresh();
  };

  const setActiveAxisId = (axisId: string) => {
    setActiveAxisInternal(axisId);
    refresh();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopDragging();
    discInteractionPath.removeEventListener("mousedown", handlePlaneMouseDown);
    centerHit.removeEventListener("mousedown", handlePlaneMouseDown);
    overlayRoot.remove();
  };

  refresh();

  return {
    setPoint,
    getPoint: () => cloneVec3(point),
    setViewMatrix,
    setFovDeg: setFov,
    setDiscRadius: setRadius,
    setActiveAxisId,
    getActiveAxisId: () => activeAxisId,
    refresh,
    destroy,
  };
};

export default createProjectedMoveGizmoView;
