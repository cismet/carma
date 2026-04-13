import { Plane, Vector3 } from "three";

import {
  buildCirclePoints,
  createPlaneBasisFromNormal,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  intersectRayWithPlane,
  getSupportRadius2d,
  MINUS_PI_OVER_FOUR,
  type Point2,
} from "@carma-commons/math";

import {
  createAxisDragConnector,
  type GizmoAxisDragConnector,
} from "./axisDragConnector";
import { AXIS_NUMERIC_EPSILON } from "./constants";
import {
  DEFAULT_VIEW_FOV_RAD,
  projectPointToViewport,
  rayFromClientPosition,
} from "./projectedMoveGizmoMath";
import { toSvgPathD } from "./svgProjection";
const SVG_NS = "http://www.w3.org/2000/svg";

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
const ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD = MINUS_PI_OVER_FOUR;

const createPlaneFromOriginAndNormal = ({
  origin,
  normal,
}: {
  origin: Vector3;
  normal: Vector3;
}): Plane => new Plane().setFromNormalAndCoplanarPoint(normal.clone(), origin);

const ensureNormalizedAxisCandidates = (
  axisCandidates: ProjectedMoveGizmoAxisCandidate[]
): ProjectedMoveGizmoAxisCandidate[] => {
  const normalized = axisCandidates
    .map((candidate) => {
      const direction = candidate.direction.clone();
      if (direction.lengthSq() <= AXIS_NUMERIC_EPSILON) return null;
      direction.normalize();
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
      axisDirection: Vector3;
      startPoint: Vector3;
    }
  | {
      mode: "plane";
      planeNormal: Vector3;
      startPoint: Vector3;
      startPlanePoint: Vector3;
    };

export type ProjectedMoveGizmoAxisCandidate = {
  id: string;
  direction: Vector3;
  color?: string;
  title?: string | null;
};

export type ProjectedMoveGizmoViewOptions = {
  container: HTMLElement;
  axisCandidates: ProjectedMoveGizmoAxisCandidate[];
  initialPoint?: Vector3;
  initialActiveAxisId?: string | null;
  viewMatrix?: number[];
  fovRad?: number;
  discRadius?: number;
  axisWidthPx?: number;
  outlineStrokeWidthPx?: number;
  arrowActiveEdgePx?: number;
  arrowInactiveEdgePx?: number;
  centerHitAreaPx?: number;
  centerPlaneDragCursor?: string;
  showRotationHandle?: boolean;
  getViewportRect?: () => DOMRect | ClientRect | null;
  onPointChange?: (point: Vector3) => void;
  onActiveAxisChange?: (axisId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
};

export type ProjectedMoveGizmoView = {
  setPoint: (point: Vector3) => void;
  getPoint: () => Vector3;
  setViewMatrix: (viewMatrix: number[]) => void;
  setFovRad: (fovRad: number) => void;
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

  let point = options.initialPoint?.clone() ?? new Vector3(0, 0, 0);
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
  let fovRad = options.fovRad ?? DEFAULT_VIEW_FOV_RAD;
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

  const setPointInternal = (nextPoint: Vector3, emit = true) => {
    point = nextPoint.clone();
    if (emit) {
      options.onPointChange?.(point.clone());
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
      fovRad
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
      startPoint: point.clone(),
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
        fovRad
      );
      if (!moveRay) return;
      const nextAxisParam = dragState.connector.updateDragFromRay(moveRay);
      if (nextAxisParam === null) return;
      setPointInternal(
        dragState.startPoint
          .clone()
          .add(dragState.axisDirection.clone().multiplyScalar(nextAxisParam))
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
      fovRad
    );
    if (!ray) return;
    const startPlanePoint = intersectRayWithPlane(
      ray,
      createPlaneFromOriginAndNormal({
        origin: point,
        normal: activeAxis.direction,
      })
    );
    if (!startPlanePoint) return;

    stopDragging();
    dragState = {
      mode: "plane",
      planeNormal: activeAxis.direction.clone(),
      startPoint: point.clone(),
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
        fovRad
      );
      if (!moveRay) return;
      const currentPlanePoint = intersectRayWithPlane(
        moveRay,
        createPlaneFromOriginAndNormal({
          origin: dragState.startPoint,
          normal: dragState.planeNormal,
        })
      );
      if (!currentPlanePoint) return;
      const delta = currentPlanePoint.clone().sub(dragState.startPlanePoint);
      setPointInternal(dragState.startPoint.clone().add(delta));
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
      fovRad
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
      const planeBasis = createPlaneBasisFromNormal(candidate.direction);
      const circlePointsWorld = buildCirclePoints(
        discRadius,
        DISC_OUTLINE_SEGMENTS
      );

      const projectedOutlinePoints = circlePointsWorld
        .map((circlePoint): Point2 | null => {
          const worldPoint = point
            .clone()
            .add(planeBasis.xAxis.clone().multiplyScalar(circlePoint.x))
            .add(planeBasis.yAxis.clone().multiplyScalar(circlePoint.y));
          const projected = projectPointToViewport(
            worldPoint,
            viewMatrix,
            viewportRect,
            fovRad
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
      const planeBasis = createPlaneBasisFromNormal(
        activeAxisCandidate.direction
      );
      const worldHandlePoint = point
        .clone()
        .add(
          planeBasis.xAxis
            .clone()
            .multiplyScalar(Math.cos(handleAngleRad) * discRadius)
        )
        .add(
          planeBasis.yAxis
            .clone()
            .multiplyScalar(Math.sin(handleAngleRad) * discRadius)
        );
      const projectedHandlePoint = projectPointToViewport(
        worldHandlePoint,
        viewMatrix,
        viewportRect,
        fovRad
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
        point
          .clone()
          .add(candidate.direction.clone().multiplyScalar(sampleDistance)),
        viewMatrix,
        viewportRect,
        fovRad
      );
      const minusPoint = projectPointToViewport(
        point
          .clone()
          .add(candidate.direction.clone().multiplyScalar(-sampleDistance)),
        viewMatrix,
        viewportRect,
        fovRad
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

  const setPoint = (nextPoint: Vector3) => {
    setPointInternal(nextPoint, false);
    refresh();
  };

  const setViewMatrix = (nextViewMatrix: number[]) => {
    viewMatrix = Array.from(nextViewMatrix);
    refresh();
  };

  const setFov = (nextFovRad: number) => {
    fovRad = nextFovRad;
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
    getPoint: () => point.clone(),
    setViewMatrix,
    setFovRad: setFov,
    setDiscRadius: setRadius,
    setActiveAxisId,
    getActiveAxisId: () => activeAxisId,
    refresh,
    destroy,
  };
};

export default createProjectedMoveGizmoView;
