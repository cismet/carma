import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Matrix4, Vector3 } from "three";

import {
  buildCirclePoints,
  computeCircleSegments,
  createSteppedScreenScaler,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  getSupportRadius2d,
  MINUS_PI_OVER_FOUR,
  negativePiToPi,
  resolveWorldSizeForScreenTarget,
} from "@carma-commons/math";
import { ecefToEnuMatrix } from "@carma-geo/proj";
import {
  createOrientedDiscMatrix,
  createPlaneBasis,
  getEllipsoidalUpDirectionAtAnchor,
} from "@carma-mapping/annotations/core";
import {
  AXIS_NUMERIC_EPSILON,
  beginPointerDragSession,
  POINTER_DRAG_SESSION_END_REASONS,
  toSvgPathD,
} from "@carma-mapping/gizmo/core";
import {
  useLabelOverlay,
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";
import {
  formatLengthMeters,
  radToDegNumeric,
  type CssPixelPosition,
} from "@carma-units";

import {
  ANNOTATION_GIZMO_DISC_SCALING_MODES,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
  type AnnotationGizmoLabels,
  type AnnotationGizmoPoint,
  type AnnotationPointMoveGizmoOptions,
  type AnnotationScenePrimitiveHandle,
  type AnnotationScreenPosition,
} from "../annotation-engine.types";
import {
  getAxisParamFromClientPosition,
  getAxisSampleWorldStep,
  getClosedPolygonPathD,
  getGroundPointFromClientPosition,
  getPlaneAngleFromClientPosition,
  getPlanePixelsPerWorldMax,
  getPlanePointFromClientPosition,
  projectConeArrowSilhouette,
  projectPlaneOutlinePoints,
  rotateVectorByVersor,
  type ConeArrowSilhouette,
  type ScreenPoint2,
} from "./engine-point-move-gizmo-math";
import {
  createEngineRotationAxisVisualizer,
  type EngineRotationAxisVisualizer,
} from "./engine-rotation-axis-visualizer";

/**
 * Port of the Cesium `useCesiumPointMoveGizmo` onto the `AnnotationEngine`
 * contract. Adapters bind it as `engine.hooks.usePointMoveGizmo`.
 */

type AxisDragState =
  | {
      mode: "translate";
      pointId: string;
      axisOrigin: Vector3;
      axisDirection: Vector3;
      startAxisParam: number;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "plane-translate";
      pointId: string;
      planeOrigin: Vector3;
      planeNormal: Vector3;
      planeBasisX: Vector3;
      planeBasisY: Vector3;
      startPlanePoint: Vector3;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "rotate";
      pointId: string;
      axisOrigin: Vector3;
      rotationNormal: Vector3;
      planeBasisX: Vector3;
      planeBasisY: Vector3;
      lastPlaneAngleRad: number;
      accumulatedDeltaRad: number;
      baseRotationAngleRad: number;
      cleanupWindowListeners: () => void;
    };

type RotationState = {
  pointId: string;
  normal: Vector3;
  angleRad: number;
};

type RotationFrameState = {
  pointId: string;
  activeAxisId: string;
  normal: Vector3;
  baseDirections: Record<string, Vector3>;
};

const OVERLAY_HANDLE_ID = "point-move-u-handle";
const MOVE_GIZMO_OVERLAY_Z_INDEX = 30;
const ENU_UP_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
const ENU_EAST_AXIS_COLOR = "rgba(239, 68, 68, 0.98)";
const ENU_NORTH_AXIS_COLOR = "rgba(34, 197, 94, 0.98)";
const SECONDARY_AXIS_COLOR = "rgba(148, 163, 184, 0.98)";
const INACTIVE_AXIS_OPACITY = 1;
const DISC_OUTLINE_COLOR = "rgba(255,255,255,0.92)";
const DISC_OUTLINE_BASE_OPACITY = 0.92;
// Cesium: `Color.WHITE.withAlpha(0.5)`.
const DISC_FILL_COLOR = "#ffffff";
const DISC_FILL_OPACITY = 0.5;
const AXIS_LINE_COLOR = "#ffffff";
const DISC_SCREEN_PIXEL_RADIUS = 48;
const DISC_SVG_EXTENT = 320;
const DISC_SVG_HALF_EXTENT = DISC_SVG_EXTENT / 2;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
const OPEN_GIZMO_SCENE_CLICK_GUARD_MS = 220;
// Cesium's `ScreenSpaceEventHandler` click pixel tolerance: a press/release
// pair further apart than this is a camera drag, not a scene click.
const SCENE_CLICK_PIXEL_TOLERANCE = 5;
const AXIS_SCREEN_SAMPLE_TARGET_PX = 48;
const AXIS_SCREEN_SAMPLE_MIN_WORLD = 0.25;
const AXIS_SCREEN_SAMPLE_MAX_WORLD = 500;
const DEFAULT_ACTIVE_ARROW_EDGE_PX = 16;
const DEFAULT_INACTIVE_ARROW_EDGE_PX = 12;
const AXIS_LINE_LAYER_Z_INDEX = 0;
const DISC_LAYER_Z_INDEX = 1;
const CENTER_HIT_LAYER_Z_INDEX = 2;
const ARROW_LAYER_Z_INDEX = 3;
const AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX = 1.5;
const PLANE_DRAG_GROUND_SNAP_CURSOR = "row-resize";
const PLANE_DRAG_DISC_CURSOR = "move";
const ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.3;
const INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.05;
// Perspective sizing for the move arrows: their edge length scales with the
// disc's apparent radius relative to its target, clamped so they neither vanish
// when far nor overwhelm the view when close.
const ARROW_PERSPECTIVE_SCALE_MIN = 0.4;
const ARROW_PERSPECTIVE_SCALE_MAX = 4;
const ROTATION_HANDLE_RADIUS_PX = 8;
const ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD = MINUS_PI_OVER_FOUR;
const ROTATION_HANDLE_MIN_MINOR_RADIUS_PX = 0.25;
const ROTATION_NORMAL_SCREEN_SAMPLE_WORLD = 1;

const DEFAULT_AXIS_PRESENTATION = [
  {
    id: "vertical",
    color: ENU_UP_AXIS_COLOR,
    labelKey: "verticalAxis",
  },
  {
    id: "horizontal-east",
    color: ENU_EAST_AXIS_COLOR,
    labelKey: "eastAxis",
  },
  {
    id: "horizontal-north",
    color: ENU_NORTH_AXIS_COLOR,
    labelKey: "northAxis",
  },
] as const;

type DefaultAxisId = (typeof DEFAULT_AXIS_PRESENTATION)[number]["id"];

// Keep the full ENU presentation available while tools expose height only.
const DEFAULT_ENABLED_AXIS_IDS: readonly string[] = ["vertical"];

const isDefaultAxisEnabled = (axisId: string): boolean =>
  DEFAULT_ENABLED_AXIS_IDS.includes(axisId);

const getDefaultAxisPresentation = (
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
) =>
  DEFAULT_AXIS_PRESENTATION.map((axisDefinition) => ({
    id: axisDefinition.id,
    color: axisDefinition.color,
    title:
      axisDefinition.id === "vertical" && axisTitle
        ? axisTitle
        : labels[axisDefinition.labelKey],
  }));

const getEnabledDefaultAxisPresentation = (
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
) =>
  getDefaultAxisPresentation(labels, axisTitle).filter((axisDefinition) =>
    isDefaultAxisEnabled(axisDefinition.id)
  );

const getPhysicalHairlinePx = (): number => {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio;
  if (!Number.isFinite(dpr) || dpr <= AXIS_NUMERIC_EPSILON) return 1;
  return 1 / dpr;
};

const safeDestroy = (
  destroyable: { destroy: () => void } | null | undefined
) => {
  if (!destroyable) return;
  try {
    destroyable.destroy();
  } catch {
    // Engine/widget teardown can race with explicit cleanup; ignore already-destroyed internals.
  }
};

const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Listener removal can race with engine/widget teardown.
  }
};

const setGlobalDragCursor = (
  restoreRef: { current: (() => void) | null },
  cursor: string
) => {
  if (typeof document === "undefined") {
    return;
  }

  const htmlElement = document.documentElement;
  const bodyElement = document.body;
  if (!htmlElement || !bodyElement) {
    return;
  }

  if (!restoreRef.current) {
    const previousHtmlCursor = htmlElement.style.cursor;
    const previousBodyCursor = bodyElement.style.cursor;
    restoreRef.current = () => {
      htmlElement.style.cursor = previousHtmlCursor;
      bodyElement.style.cursor = previousBodyCursor;
      restoreRef.current = null;
    };
  }

  htmlElement.style.cursor = cursor;
  bodyElement.style.cursor = cursor;
};

const restoreGlobalDragCursor = (restoreRef: {
  current: (() => void) | null;
}) => {
  restoreRef.current?.();
};

const DEFAULT_AXIS_ENU_MATRIX_SCRATCH = new Matrix4();

const updateTrianglePathAppearance = (
  pathElement: SVGPathElement | null,
  edgeLengthPx: number
) => {
  if (!pathElement) return;
  pathElement.setAttribute("d", getEquilateralTrianglePathD(edgeLengthPx));
  pathElement.setAttribute(
    "stroke-width",
    `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`
  );
  pathElement.setAttribute("stroke-linejoin", "round");
  pathElement.setAttribute("stroke-linecap", "round");
};

const CONE_ARROW_RIM_STROKE_OPACITY = 0.7;
const CONE_ARROW_BOX_PADDING_PX = AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX + 1;

/**
 * Draws a move arrow as its projected cone: the svg box spans the hull in
 * anchor-relative pixels, the outline keeps the flat arrow's fill and stroke,
 * and the base rim shows while the camera looks at the base. Without a
 * silhouette the flat triangle stays as the caller laid it out.
 */
const applyConeArrowSilhouette = (
  arrowElement: HTMLElement,
  silhouette: ConeArrowSilhouette | null
) => {
  const rimPath = arrowElement.querySelector(
    "[data-point-move-axis-arrow-rim]"
  ) as SVGPathElement | null;
  if (!silhouette || silhouette.hull.length < 3) {
    if (rimPath) rimPath.style.display = "none";
    return;
  }
  const outlinePath = arrowElement.querySelector(
    "[data-point-move-axis-arrow-outline]"
  ) as SVGPathElement | null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of silhouette.hull) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  minX -= CONE_ARROW_BOX_PADDING_PX;
  minY -= CONE_ARROW_BOX_PADDING_PX;
  const width = maxX + CONE_ARROW_BOX_PADDING_PX - minX;
  const height = maxY + CONE_ARROW_BOX_PADDING_PX - minY;
  arrowElement.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  arrowElement.style.width = `${width}px`;
  arrowElement.style.height = `${height}px`;
  arrowElement.style.left = `calc(50% + ${minX}px)`;
  arrowElement.style.top = `calc(50% + ${minY}px)`;
  arrowElement.style.transformOrigin = "0 0";
  arrowElement.style.transform = "none";
  outlinePath?.setAttribute("d", getClosedPolygonPathD(silhouette.hull));
  if (rimPath) {
    if (silhouette.baseRim) {
      rimPath.setAttribute("d", getClosedPolygonPathD(silhouette.baseRim));
      rimPath.style.display = "block";
    } else {
      rimPath.style.display = "none";
    }
  }
};

const getDefaultAxisCandidatesAtPosition = (
  origin: Vector3,
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
): AnnotationGizmoAxisCandidate[] => {
  // ENU → ECEF columns of the inverted ECEF → ENU frame are the east, north
  // and up directions at the origin (Cesium: `eastNorthUpToFixedFrame`).
  const eastDirection = new Vector3();
  const northDirection = new Vector3();
  const upDirection = new Vector3();
  ecefToEnuMatrix(origin, DEFAULT_AXIS_ENU_MATRIX_SCRATCH)
    .invert()
    .extractBasis(eastDirection, northDirection, upDirection);
  eastDirection.normalize();
  northDirection.normalize();
  upDirection.normalize();

  const directionsByAxisId: Record<DefaultAxisId, Vector3> = {
    vertical: upDirection,
    "horizontal-east": eastDirection,
    "horizontal-north": northDirection,
  };

  return getDefaultAxisPresentation(labels, axisTitle).map(
    (axisDefinition) => ({
      id: axisDefinition.id,
      direction: directionsByAxisId[axisDefinition.id],
      color: axisDefinition.color,
      title: axisDefinition.title,
    })
  );
};

// Default axis candidates limited to the axes currently enabled for tools.
// `getDefaultAxisCandidatesAtPosition` keeps generating the full ENU frame.
const getEnabledDefaultAxisCandidatesAtPosition = (
  origin: Vector3,
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
): AnnotationGizmoAxisCandidate[] =>
  getDefaultAxisCandidatesAtPosition(origin, labels, axisTitle).filter(
    (candidate) => isDefaultAxisEnabled(candidate.id)
  );

export const useEnginePointMoveGizmo = (
  engine: AnnotationEngine | null,
  {
    points,
    labels,
    movePointId = null,
    axisDirection = null,
    discPlaneNormal = null,
    axisTitle = null,
    preferredAxisId = null,
    axisCandidates = null,
    showRotationHandle = false,
    showDisc = true,
    discScalingMode = ANNOTATION_GIZMO_DISC_SCALING_MODES.SCREEN,
    discOutlineScreenPixelRadius = DISC_SCREEN_PIXEL_RADIUS,
    discResizeWorldRadiusToScreenTarget = false,
    discQuantizeWorldRadius = false,
    freezeDiscScaleDuringDrag = false,
    discResizeStepFactor = 4,
    showDiscRadiusLabel = false,
    axisWidthPx,
    outlineWidthPx: _outlineWidthPx,
    arrowActiveEdgePx = DEFAULT_ACTIVE_ARROW_EDGE_PX,
    arrowInactiveEdgePx = DEFAULT_INACTIVE_ARROW_EDGE_PX,
    snapPlaneDragToGround = false,
    excludeRegisteredDragSampleOccluders = false,
    radius,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange,
    onRotationDelta,
    onExit,
  }: AnnotationPointMoveGizmoOptions
): void => {
  const { setLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const axisVisualizerRef = useRef<EngineRotationAxisVisualizer | null>(null);
  const discVisualizerRef = useRef<AnnotationScenePrimitiveHandle | null>(null);
  const discModelMatrixRef = useRef(new Matrix4());
  const removeDiscFrameListenerRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<AxisDragState | null>(null);
  const isDraggingRef = useRef(false);
  const suppressNextSceneClickRef = useRef(false);
  const clearInitialSceneClickGuardTimeoutRef = useRef<number | null>(null);
  const movePointRef = useRef<AnnotationGizmoPoint | null>(null);
  const livePointPositionsRef = useRef<Map<string, Vector3>>(new Map());
  const rotationStateRef = useRef<RotationState | null>(null);
  const rotationFrameRef = useRef<RotationFrameState | null>(null);
  const radiusRef = useRef(radius);
  const discSteppedScalerRef = useRef(createSteppedScreenScaler());
  const frozenDragDiscRadiusRef = useRef<number | null>(null);
  const freezeDiscScaleDuringDragRef = useRef(freezeDiscScaleDuringDrag);
  const stepFactorRef = useRef(discResizeStepFactor);
  const showDiscRadiusLabelRef = useRef(showDiscRadiusLabel);
  const radiusHairlineGeometryRef = useRef<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [radiusLabelText, setRadiusLabelText] = useState("");
  const radiusLabelTextRef = useRef("");
  const restoreGlobalCursorRef = useRef<(() => void) | null>(null);
  const onPointPositionChangeRef = useRef(onPointPositionChange);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const onAxisDirectionChangeRef = useRef(onAxisDirectionChange);
  const onRotationDeltaRef = useRef(onRotationDelta);
  const onExitRef = useRef(onExit);
  const axisScreenDirectionRef = useRef<
    Record<string, { x: number; y: number; angleRad: number }>
  >({});
  const axisAnchorDistanceRef = useRef<Record<string, number>>({});
  const axisDirectionRef = useRef<Vector3 | null>(axisDirection);
  const discPlaneNormalRef = useRef<Vector3 | null>(discPlaneNormal);
  const preferredAxisIdRef = useRef<string | null>(preferredAxisId);
  const axisCandidatesRef = useRef<AnnotationGizmoAxisCandidate[] | null>(
    axisCandidates
  );
  const activeAxisIdRef = useRef<string>("vertical");
  const centerPlaneDragCursor = snapPlaneDragToGround
    ? PLANE_DRAG_GROUND_SNAP_CURSOR
    : PLANE_DRAG_DISC_CURSOR;
  const resolvedAxisWidthPx = useMemo(
    () => axisWidthPx ?? getPhysicalHairlinePx(),
    [axisWidthPx]
  );
  const resolveScreenFixedDiscWorldRadius = useCallback(
    (
      origin: Vector3,
      planeNormal: Vector3,
      configuredWorldRadius: number
    ): number => {
      const baseRadius = Math.max(configuredWorldRadius, AXIS_NUMERIC_EPSILON);
      if (!engine || engine.isDestroyed()) {
        return baseRadius;
      }

      const anchorCanvasPosition = engine.worldToScreen(origin);
      if (!anchorCanvasPosition) {
        return baseRadius;
      }

      const planeBasis = createPlaneBasis(planeNormal);
      const pixelPerWorldMax = getPlanePixelsPerWorldMax(
        engine,
        origin,
        planeBasis,
        anchorCanvasPosition,
        DISC_PROJECTION_SCALE_SAMPLE_COUNT
      );
      if (pixelPerWorldMax <= AXIS_NUMERIC_EPSILON) {
        return baseRadius;
      }

      const worldRadius = resolveWorldSizeForScreenTarget({
        targetScreenPx: discOutlineScreenPixelRadius,
        pixelPerWorld: pixelPerWorldMax,
        quantize: false,
      });
      return Math.max(worldRadius, AXIS_NUMERIC_EPSILON);
    },
    [discOutlineScreenPixelRadius, engine]
  );

  const resolveSteppedDiscWorldRadius = useCallback(
    (origin: Vector3): number => {
      if (!engine || engine.isDestroyed()) {
        return Math.max(radiusRef.current, AXIS_NUMERIC_EPSILON);
      }

      return discSteppedScalerRef.current.resolve({
        currentScale: engine.getScreenPixelsPerMeterAt(origin),
        targetScreenPx: discOutlineScreenPixelRadius,
        fallback: Math.max(radiusRef.current, AXIS_NUMERIC_EPSILON),
        stepFactor: stepFactorRef.current,
        quantize: discQuantizeWorldRadius,
        minWorldSize: AXIS_NUMERIC_EPSILON,
      });
    },
    [discOutlineScreenPixelRadius, discQuantizeWorldRadius, engine]
  );

  const computeDiscWorldRadius = useCallback(
    (origin: Vector3, planeNormal: Vector3): number => {
      if (
        discScalingMode === ANNOTATION_GIZMO_DISC_SCALING_MODES.WORLD &&
        discResizeWorldRadiusToScreenTarget
      ) {
        return resolveSteppedDiscWorldRadius(origin);
      }
      if (discScalingMode === ANNOTATION_GIZMO_DISC_SCALING_MODES.WORLD) {
        return Math.max(radiusRef.current, AXIS_NUMERIC_EPSILON);
      }
      return resolveScreenFixedDiscWorldRadius(
        origin,
        planeNormal,
        radiusRef.current
      );
    },
    [
      discScalingMode,
      discResizeWorldRadiusToScreenTarget,
      resolveScreenFixedDiscWorldRadius,
      resolveSteppedDiscWorldRadius,
    ]
  );

  const resolveDiscWorldRadiusForFrame = useCallback(
    (origin: Vector3, planeNormal: Vector3): number => {
      if (freezeDiscScaleDuringDragRef.current && isDraggingRef.current) {
        if (frozenDragDiscRadiusRef.current === null) {
          frozenDragDiscRadiusRef.current = computeDiscWorldRadius(
            origin,
            planeNormal
          );
        }
        return frozenDragDiscRadiusRef.current;
      }
      return computeDiscWorldRadius(origin, planeNormal);
    },
    [computeDiscWorldRadius]
  );

  const getGroundPointWithoutGizmoVisuals = useCallback(
    (clientX: number, clientY: number): Vector3 | null => {
      if (!engine || engine.isDestroyed()) return null;

      // The engine adapter owns all permanent helper exclusions (including this
      // gizmo's axis/disc) and optionally adds the active measurement geometry.
      return getGroundPointFromClientPosition(engine, clientX, clientY, {
        includeDragSampleExclusions: excludeRegisteredDragSampleOccluders,
      });
    },
    [excludeRegisteredDragSampleOccluders, engine]
  );
  const getCanvasScreenPosition = useCallback(
    (
      clientX: number,
      clientY: number
    ): AnnotationScreenPosition | undefined => {
      if (!engine || engine.isDestroyed()) {
        return undefined;
      }

      const canvasRect = engine.canvas.getBoundingClientRect();
      return {
        x: clientX - canvasRect.left,
        y: clientY - canvasRect.top,
      };
    },
    [engine]
  );

  const movePoint = useMemo(
    () =>
      movePointId
        ? points.find((point) => point.id === movePointId) ?? null
        : null,
    [points, movePointId]
  );
  const movePointKey = movePoint?.id ?? null;

  useEffect(() => {
    movePointRef.current = movePoint;
    // Once React has committed the drag result, movePoint.geometryECEF equals
    // the last published position, so drop the local live position here (not on mouseup)
    // to avoid a one-frame snap-back to the pre-commit position. Never clear
    // mid-drag (movePoint also changes every move while dragging).
    if (!isDraggingRef.current && livePointPositionsRef.current.size > 0) {
      livePointPositionsRef.current.clear();
      // Render one settle frame so overlays re-resolve from the committed
      // position now that the live position is gone (otherwise they only
      // refresh on the next camera move).
      if (engine && !engine.isDestroyed()) {
        engine.requestRender();
      }
    }
  });

  useEffect(() => {
    axisScreenDirectionRef.current = {};
    axisAnchorDistanceRef.current = {};
  }, [movePointKey]);

  useEffect(() => {
    if (clearInitialSceneClickGuardTimeoutRef.current !== null) {
      window.clearTimeout(clearInitialSceneClickGuardTimeoutRef.current);
      clearInitialSceneClickGuardTimeoutRef.current = null;
    }

    if (!movePoint) {
      suppressNextSceneClickRef.current = false;
      return;
    }

    // Opening the gizmo is usually triggered by a DOM long-press/click.
    // Ignore the trailing scene click briefly so the newly opened gizmo
    // does not immediately exit on the same interaction.
    suppressNextSceneClickRef.current = true;
    clearInitialSceneClickGuardTimeoutRef.current = window.setTimeout(() => {
      suppressNextSceneClickRef.current = false;
      clearInitialSceneClickGuardTimeoutRef.current = null;
    }, OPEN_GIZMO_SCENE_CLICK_GUARD_MS);

    return () => {
      if (clearInitialSceneClickGuardTimeoutRef.current !== null) {
        window.clearTimeout(clearInitialSceneClickGuardTimeoutRef.current);
        clearInitialSceneClickGuardTimeoutRef.current = null;
      }
    };
  }, [movePointKey]);

  useEffect(() => {
    axisDirectionRef.current = axisDirection;
  }, [axisDirection]);

  useEffect(() => {
    discPlaneNormalRef.current = discPlaneNormal;
  }, [discPlaneNormal]);

  useEffect(() => {
    preferredAxisIdRef.current = preferredAxisId;
  }, [preferredAxisId]);

  useEffect(() => {
    radiusRef.current = radius;
  }, [radius]);

  useEffect(() => {
    freezeDiscScaleDuringDragRef.current = freezeDiscScaleDuringDrag;
  }, [freezeDiscScaleDuringDrag]);

  useEffect(() => {
    showDiscRadiusLabelRef.current = showDiscRadiusLabel;
  }, [showDiscRadiusLabel]);

  useEffect(() => {
    stepFactorRef.current = discResizeStepFactor;
  }, [discResizeStepFactor]);

  useEffect(() => {
    onPointPositionChangeRef.current = onPointPositionChange;
  }, [onPointPositionChange]);

  useEffect(() => {
    onDragStateChangeRef.current = onDragStateChange;
  }, [onDragStateChange]);

  useEffect(() => {
    onAxisDirectionChangeRef.current = onAxisDirectionChange;
  }, [onAxisDirectionChange]);

  useEffect(() => {
    onRotationDeltaRef.current = onRotationDelta;
  }, [onRotationDelta]);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    axisCandidatesRef.current = axisCandidates;
  }, [axisCandidates]);

  useEffect(() => {
    if (!movePoint) return;

    const candidates =
      axisCandidates && axisCandidates.length > 0
        ? axisCandidates
        : getEnabledDefaultAxisCandidatesAtPosition(
            movePoint.geometryECEF,
            labels,
            axisTitle
          );
    if (candidates.length === 0) return;

    if (preferredAxisId) {
      const preferredAxis = candidates.find(
        (candidate) => candidate.id === preferredAxisId
      );
      if (preferredAxis) {
        activeAxisIdRef.current = preferredAxis.id;
        return;
      }
    }

    const normalizedOverride =
      axisDirection && axisDirection.lengthSq() > AXIS_NUMERIC_EPSILON
        ? axisDirection.clone().normalize()
        : null;

    if (normalizedOverride) {
      const matchedByDirection = candidates.find((candidate) => {
        if (
          !candidate.direction ||
          candidate.direction.lengthSq() <= AXIS_NUMERIC_EPSILON
        ) {
          return false;
        }
        const normalizedCandidateDirection = candidate.direction
          .clone()
          .normalize();
        return (
          Math.abs(normalizedCandidateDirection.dot(normalizedOverride)) > 0.999
        );
      });
      if (matchedByDirection) {
        activeAxisIdRef.current = matchedByDirection.id;
        return;
      }
    }

    const currentActiveAxis = candidates.find(
      (candidate) => candidate.id === activeAxisIdRef.current
    );
    if (currentActiveAxis) {
      return;
    }

    activeAxisIdRef.current = candidates[0].id;
  }, [
    axisCandidates,
    axisDirection,
    axisTitle,
    labels,
    movePointKey,
    preferredAxisId,
  ]);

  const getAxisCandidatesAtPosition = useCallback(
    (origin: Vector3): AnnotationGizmoAxisCandidate[] => {
      const configuredCandidates = axisCandidatesRef.current;
      if (!configuredCandidates || configuredCandidates.length === 0) {
        return getEnabledDefaultAxisCandidatesAtPosition(
          origin,
          labels,
          axisTitle
        );
      }

      const normalizedCandidates = configuredCandidates
        .map((candidate): AnnotationGizmoAxisCandidate | null => {
          if (
            !candidate.direction ||
            candidate.direction.lengthSq() <= AXIS_NUMERIC_EPSILON
          ) {
            return null;
          }
          return {
            ...candidate,
            direction: candidate.direction.clone().normalize(),
            color: candidate.color ?? SECONDARY_AXIS_COLOR,
          };
        })
        .filter(
          (candidate): candidate is AnnotationGizmoAxisCandidate =>
            candidate !== null
        );

      const rotationState = rotationStateRef.current;
      if (
        !rotationState ||
        rotationState.pointId !== (movePointRef.current?.id ?? "") ||
        Math.abs(rotationState.angleRad) <= AXIS_NUMERIC_EPSILON
      ) {
        return normalizedCandidates;
      }

      const rotationFrame = rotationFrameRef.current;
      const frameActiveAxisId =
        rotationFrame?.pointId === (movePointRef.current?.id ?? "")
          ? rotationFrame.activeAxisId
          : activeAxisIdRef.current;

      return normalizedCandidates.map((candidate) => {
        if (candidate.id === frameActiveAxisId) {
          return {
            ...candidate,
            direction: rotationState.normal.clone().normalize(),
          };
        }

        const baseDirection =
          rotationFrame?.baseDirections[candidate.id] ?? candidate.direction;

        return {
          ...candidate,
          direction: rotateVectorByVersor(
            baseDirection,
            rotationState.normal,
            rotationState.angleRad
          ),
        };
      });
    },
    [axisTitle, labels]
  );

  const getActiveAxisAtPosition = useCallback(
    (origin: Vector3): AnnotationGizmoAxisCandidate => {
      const candidates = getAxisCandidatesAtPosition(origin);
      if (candidates.length === 0) {
        return {
          id: "vertical",
          direction: getEllipsoidalUpDirectionAtAnchor(origin),
          color: ENU_UP_AXIS_COLOR,
          title: axisTitle ?? labels.verticalAxis,
        };
      }

      const byId = candidates.find(
        (candidate) => candidate.id === activeAxisIdRef.current
      );
      if (byId) return byId;

      const preferredAxisId = preferredAxisIdRef.current;
      if (preferredAxisId) {
        const byPreferredAxisId = candidates.find(
          (candidate) => candidate.id === preferredAxisId
        );
        if (byPreferredAxisId) {
          activeAxisIdRef.current = byPreferredAxisId.id;
          return byPreferredAxisId;
        }
      }

      const overrideDirection = axisDirectionRef.current;
      if (
        overrideDirection &&
        overrideDirection.lengthSq() > AXIS_NUMERIC_EPSILON
      ) {
        const normalizedOverride = overrideDirection.clone().normalize();
        const byDirection = candidates.find(
          (candidate) =>
            Math.abs(candidate.direction.dot(normalizedOverride)) > 0.999
        );
        if (byDirection) {
          activeAxisIdRef.current = byDirection.id;
          return byDirection;
        }
      }

      activeAxisIdRef.current = candidates[0].id;
      return candidates[0];
    },
    [axisTitle, getAxisCandidatesAtPosition, labels.verticalAxis]
  );

  const getDiscPlaneNormalAtPosition = useCallback(
    (origin: Vector3) => {
      const configuredDiscPlaneNormal = discPlaneNormalRef.current;
      if (
        configuredDiscPlaneNormal &&
        configuredDiscPlaneNormal.lengthSq() > AXIS_NUMERIC_EPSILON
      ) {
        return configuredDiscPlaneNormal.clone().normalize();
      }

      return getActiveAxisAtPosition(origin).direction.clone();
    },
    [getActiveAxisAtPosition]
  );

  const stopDragging = useCallback((exitMoveMode: boolean) => {
    const dragMode = dragStateRef.current?.mode ?? null;
    if (dragStateRef.current) {
      dragStateRef.current.cleanupWindowListeners();
      dragStateRef.current = null;
    }

    if (dragMode === "rotate") {
      axisAnchorDistanceRef.current = {};
    }

    restoreGlobalDragCursor(restoreGlobalCursorRef);

    // Drop the frozen-during-drag radius so the next drag re-captures (and may
    // re-step) its size at its own start.
    frozenDragDiscRadiusRef.current = null;

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      onDragStateChangeRef.current?.(false);
    }

    if (exitMoveMode) {
      onExitRef.current?.();
    }
  }, []);

  const startDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      axisCandidateOverride?: AnnotationGizmoAxisCandidate
    ) => {
      if (
        !engine ||
        engine.isDestroyed() ||
        !movePointRef.current ||
        !onPointPositionChangeRef.current
      ) {
        return;
      }

      // Recover from any stale drag state (e.g. lost mouseup when leaving window).
      if (dragStateRef.current || isDraggingRef.current) {
        stopDragging(false);
      }

      const activePoint = movePointRef.current;
      const axisOrigin = activePoint.geometryECEF.clone();
      const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(axisOrigin);
      const activeAxisCandidate = axisCandidateOverride
        ? axisCandidatesAtOrigin.find(
            (candidate) => candidate.id === axisCandidateOverride.id
          ) ?? axisCandidateOverride
        : getActiveAxisAtPosition(axisOrigin);
      const axisDirection = activeAxisCandidate.direction.clone();
      activeAxisIdRef.current = activeAxisCandidate.id;
      if (axisVisualizerRef.current && !engine.isDestroyed()) {
        axisVisualizerRef.current.update(axisOrigin, axisDirection);
      }
      onAxisDirectionChangeRef.current?.(
        axisDirection,
        activeAxisCandidate.title
      );
      const startAxisParam = getAxisParamFromClientPosition(
        engine,
        clientX,
        clientY,
        axisOrigin,
        axisDirection
      );
      if (startAxisParam === null) {
        return;
      }

      const onWindowMouseMove = (mouseMoveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (
          !dragState ||
          dragState.mode !== "translate" ||
          !movePointRef.current
        ) {
          return;
        }

        const axisParam = getAxisParamFromClientPosition(
          engine,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragState.axisOrigin,
          dragState.axisDirection
        );
        if (axisParam === null) return;

        const axisDelta = axisParam - dragState.startAxisParam;
        const nextPosition = dragState.axisOrigin
          .clone()
          .addScaledVector(dragState.axisDirection, axisDelta);

        // Publish synchronously so the disc + overlay (and downstream
        // visualizers) repaint this position on the render we request below,
        // ahead of the setState round-trip.
        livePointPositionsRef.current.set(dragState.pointId, nextPosition);

        onPointPositionChangeRef.current?.(
          dragState.pointId,
          nextPosition,
          getCanvasScreenPosition(
            mouseMoveEvent.clientX,
            mouseMoveEvent.clientY
          )
        );
        engine.requestRender();
      };

      const dragSession = beginPointerDragSession({
        onMove: onWindowMouseMove,
        onEnd: ({ reason }) => {
          if (reason === POINTER_DRAG_SESSION_END_REASONS.RELEASE) {
            suppressNextSceneClickRef.current = true;
          }
          stopDragging(false);
        },
      });

      dragStateRef.current = {
        mode: "translate",
        pointId: activePoint.id,
        axisOrigin,
        axisDirection,
        startAxisParam,
        cleanupWindowListeners: dragSession.cleanup,
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      engine.requestRender();
    },
    [getActiveAxisAtPosition, engine, stopDragging, getAxisCandidatesAtPosition]
  );

  const startRotating = useCallback(
    (clientX: number, clientY: number) => {
      if (!engine || engine.isDestroyed() || !movePointRef.current) {
        return;
      }

      if (dragStateRef.current || isDraggingRef.current) {
        stopDragging(false);
      }

      axisAnchorDistanceRef.current = {};

      const activePoint = movePointRef.current;
      const axisOrigin = activePoint.geometryECEF.clone();
      const activeAxisCandidate = getActiveAxisAtPosition(axisOrigin);
      const rotationNormal = activeAxisCandidate.direction.clone();
      activeAxisIdRef.current = activeAxisCandidate.id;

      const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(axisOrigin);
      const baseDirections: Record<string, Vector3> = {};
      axisCandidatesAtOrigin.forEach((candidate) => {
        baseDirections[candidate.id] = candidate.direction.clone().normalize();
      });
      rotationFrameRef.current = {
        pointId: activePoint.id,
        activeAxisId: activeAxisCandidate.id,
        normal: rotationNormal.clone().normalize(),
        baseDirections,
      };

      const planeBasis = createPlaneBasis(rotationNormal);

      const startPlaneAngleRad = getPlaneAngleFromClientPosition(
        engine,
        clientX,
        clientY,
        axisOrigin,
        rotationNormal,
        planeBasis.xAxis,
        planeBasis.yAxis
      );
      if (startPlaneAngleRad === null) {
        return;
      }

      const currentRotationState = rotationStateRef.current;
      const baseRotationAngleRad =
        currentRotationState?.pointId === activePoint.id
          ? currentRotationState.angleRad
          : 0;

      const onWindowMouseMove = (mouseMoveEvent: MouseEvent) => {
        if (!dragStateRef.current || dragStateRef.current.mode !== "rotate")
          return;

        const nextPlaneAngleRad = getPlaneAngleFromClientPosition(
          engine,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragStateRef.current.axisOrigin,
          dragStateRef.current.rotationNormal,
          dragStateRef.current.planeBasisX,
          dragStateRef.current.planeBasisY
        );
        if (nextPlaneAngleRad === null) return;

        const incrementalDelta = negativePiToPi(
          nextPlaneAngleRad - dragStateRef.current.lastPlaneAngleRad
        );
        dragStateRef.current.lastPlaneAngleRad = nextPlaneAngleRad;

        // Keep rotation direction independent of the camera side.
        dragStateRef.current.accumulatedDeltaRad -= incrementalDelta;
        const deltaAngleRad = -incrementalDelta;
        const nextAngle =
          dragStateRef.current.baseRotationAngleRad +
          dragStateRef.current.accumulatedDeltaRad;

        rotationStateRef.current = {
          pointId: dragStateRef.current.pointId,
          normal: dragStateRef.current.rotationNormal.clone(),
          angleRad: nextAngle,
        };

        onRotationDeltaRef.current?.({
          pointId: dragStateRef.current.pointId,
          axisOrigin: dragStateRef.current.axisOrigin.clone(),
          rotationNormal: dragStateRef.current.rotationNormal.clone(),
          deltaAngleRad,
          accumulatedAngleRad: dragStateRef.current.accumulatedDeltaRad,
        });

        engine.requestRender();
      };

      const dragSession = beginPointerDragSession({
        onMove: onWindowMouseMove,
        onEnd: ({ reason }) => {
          if (reason === POINTER_DRAG_SESSION_END_REASONS.RELEASE) {
            suppressNextSceneClickRef.current = true;
          }
          stopDragging(false);
        },
      });

      dragStateRef.current = {
        mode: "rotate",
        pointId: activePoint.id,
        axisOrigin,
        rotationNormal,
        planeBasisX: planeBasis.xAxis,
        planeBasisY: planeBasis.yAxis,
        lastPlaneAngleRad: startPlaneAngleRad,
        accumulatedDeltaRad: 0,
        baseRotationAngleRad,
        cleanupWindowListeners: dragSession.cleanup,
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      engine.requestRender();
    },
    [getActiveAxisAtPosition, getAxisCandidatesAtPosition, engine, stopDragging]
  );

  const startPlaneDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      options?: { snapToGround?: boolean }
    ) => {
      if (
        !engine ||
        engine.isDestroyed() ||
        !movePointRef.current ||
        !onPointPositionChangeRef.current
      ) {
        return;
      }

      if (dragStateRef.current || isDraggingRef.current) {
        stopDragging(false);
      }

      const activePoint = movePointRef.current;
      const shouldSnapToGround = options?.snapToGround === true;
      const planeOrigin = activePoint.geometryECEF.clone();
      const planeNormal = getDiscPlaneNormalAtPosition(planeOrigin);
      const configuredDiscPlaneNormal = discPlaneNormalRef.current;

      let planeBasisX: Vector3;
      let planeBasisY: Vector3;
      if (
        configuredDiscPlaneNormal &&
        configuredDiscPlaneNormal.lengthSq() > AXIS_NUMERIC_EPSILON
      ) {
        const planeBasis = createPlaneBasis(planeNormal);
        planeBasisX = planeBasis.xAxis;
        planeBasisY = planeBasis.yAxis;
      } else {
        const activeAxisCandidate = getActiveAxisAtPosition(planeOrigin);
        const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(planeOrigin);
        const nonActiveAxes = axisCandidatesAtOrigin
          .filter((candidate) => candidate.id !== activeAxisCandidate.id)
          .map((candidate) => candidate.direction.clone().normalize());

        if (
          nonActiveAxes.length >= 2 &&
          new Vector3()
            .crossVectors(nonActiveAxes[0], nonActiveAxes[1])
            .lengthSq() > AXIS_NUMERIC_EPSILON
        ) {
          planeBasisX = nonActiveAxes[0];
          planeBasisY = nonActiveAxes[1];
        } else {
          const fallbackBasis = createPlaneBasis(planeNormal);
          planeBasisX = fallbackBasis.xAxis;
          planeBasisY = fallbackBasis.yAxis;
        }
      }

      let startPlanePoint = shouldSnapToGround
        ? getGroundPointWithoutGizmoVisuals(clientX, clientY)
        : null;
      if (!startPlanePoint) {
        startPlanePoint = getPlanePointFromClientPosition(
          engine,
          clientX,
          clientY,
          planeOrigin,
          planeNormal
        );
      }
      if (!startPlanePoint) {
        if (!shouldSnapToGround) {
          return;
        }
        startPlanePoint = planeOrigin.clone();
      }

      const onWindowMouseMove = (mouseMoveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.mode !== "plane-translate") return;

        if (shouldSnapToGround) {
          const nextGroundPoint = getGroundPointWithoutGizmoVisuals(
            mouseMoveEvent.clientX,
            mouseMoveEvent.clientY
          );
          if (nextGroundPoint) {
            // Depth pick already resolved synchronously above, so the snapped
            // world point is known now — publish it for this frame's repaint.
            livePointPositionsRef.current.set(
              dragState.pointId,
              nextGroundPoint
            );
            onPointPositionChangeRef.current?.(
              dragState.pointId,
              nextGroundPoint,
              getCanvasScreenPosition(
                mouseMoveEvent.clientX,
                mouseMoveEvent.clientY
              )
            );
            engine.requestRender();
            return;
          }
        }

        const nextPlanePoint = getPlanePointFromClientPosition(
          engine,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragState.planeOrigin,
          dragState.planeNormal
        );
        if (!nextPlanePoint) return;

        const delta = new Vector3().subVectors(
          nextPlanePoint,
          dragState.startPlanePoint
        );
        const deltaX = delta.dot(dragState.planeBasisX);
        const deltaY = delta.dot(dragState.planeBasisY);

        const nextPosition = dragState.planeOrigin
          .clone()
          .addScaledVector(dragState.planeBasisX, deltaX)
          .addScaledVector(dragState.planeBasisY, deltaY);

        // Plane intersection is pure math against the frozen plane, so the
        // position is known now — publish before requesting the render.
        livePointPositionsRef.current.set(dragState.pointId, nextPosition);

        onPointPositionChangeRef.current?.(
          dragState.pointId,
          nextPosition,
          getCanvasScreenPosition(
            mouseMoveEvent.clientX,
            mouseMoveEvent.clientY
          )
        );
        engine.requestRender();
      };

      const dragSession = beginPointerDragSession({
        onMove: onWindowMouseMove,
        onEnd: ({ reason }) => {
          if (reason === POINTER_DRAG_SESSION_END_REASONS.RELEASE) {
            suppressNextSceneClickRef.current = true;
          }
          stopDragging(false);
        },
      });

      dragStateRef.current = {
        mode: "plane-translate",
        pointId: activePoint.id,
        planeOrigin,
        planeNormal,
        planeBasisX,
        planeBasisY,
        startPlanePoint,
        cleanupWindowListeners: dragSession.cleanup,
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      engine.requestRender();
    },
    [
      getActiveAxisAtPosition,
      getAxisCandidatesAtPosition,
      getCanvasScreenPosition,
      getDiscPlaneNormalAtPosition,
      getGroundPointWithoutGizmoVisuals,
      engine,
      stopDragging,
    ]
  );

  useEffect(() => {
    if (!engine || engine.isDestroyed() || !movePoint) {
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeDestroy(discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (removeDiscFrameListenerRef.current) {
        safeCall(removeDiscFrameListenerRef.current);
        removeDiscFrameListenerRef.current = null;
      }
      return;
    }

    // Defensive reset before (re)attach to guarantee at most one axis/disc visualizer pair.
    if (removeDiscFrameListenerRef.current) {
      safeCall(removeDiscFrameListenerRef.current);
      removeDiscFrameListenerRef.current = null;
    }
    if (axisVisualizerRef.current) {
      safeDestroy(axisVisualizerRef.current);
      axisVisualizerRef.current = null;
    }
    if (discVisualizerRef.current) {
      safeDestroy(discVisualizerRef.current);
      discVisualizerRef.current = null;
    }

    const initialAxisDirection = getActiveAxisAtPosition(
      movePoint.geometryECEF
    ).direction;
    const initialDiscPlaneNormal = getDiscPlaneNormalAtPosition(
      movePoint.geometryECEF
    );
    const visualizer = createEngineRotationAxisVisualizer(
      `point-move-axis-${movePoint.id}`,
      {
        origin: movePoint.geometryECEF,
        upVector: initialAxisDirection,
        lengthMultiplier: 2,
        dashPixelLength: 5,
        gapPixelLength: 3,
        color: AXIS_LINE_COLOR,
        width: resolvedAxisWidthPx,
      }
    );
    visualizer.attach(engine, () => engine.requestRender());
    axisVisualizerRef.current = visualizer;

    if (showDisc) {
      // Fresh selection: clear any prior step so the size is captured anew.
      discSteppedScalerRef.current.reset();
      const initialDiscRadius = computeDiscWorldRadius(
        movePoint.geometryECEF,
        initialDiscPlaneNormal
      );
      // Tessellate from the disc's apparent screen size so the filled ring
      // reads as round rather than a visible polygon.
      const disc = engine.createRing({
        id: `point-move-disc-${movePoint.id}`,
        radius: 1,
        innerRadius: 0.5,
        color: DISC_FILL_COLOR,
        opacity: DISC_FILL_OPACITY,
        segments: computeCircleSegments(discOutlineScreenPixelRadius),
        modelMatrix: createOrientedDiscMatrix(
          movePoint.geometryECEF,
          initialDiscPlaneNormal,
          initialDiscRadius,
          discModelMatrixRef.current
        ),
      });
      discVisualizerRef.current = disc;
    }

    // The adapter keeps the gizmo's own axis and disc primitives out of every
    // surface pick by itself.

    // preRender applies the live position before the engine builds this frame's
    // draw commands, keeping the primitive aligned with the DOM overlay.
    const removeDiscFrameListener = engine.subscribePreRender(() => {
      try {
        const currentPoint = movePointRef.current;
        const axisVisualizer = axisVisualizerRef.current;
        if (!currentPoint || !axisVisualizer || engine.isDestroyed()) {
          return;
        }

        // Prefer the synchronously-published live anchor so the disc tracks the
        // pointer without the setState round-trip. The annotation runtime
        // publishes the same callback position to its own visualizers.
        const livePosition =
          livePointPositionsRef.current.get(currentPoint.id) ??
          currentPoint.geometryECEF;

        const axisDirection = getActiveAxisAtPosition(livePosition).direction;
        const discPlaneNormal = getDiscPlaneNormalAtPosition(livePosition);
        axisVisualizer.update(livePosition, axisDirection);

        const discVisualizer = discVisualizerRef.current;
        if (discVisualizer) {
          const discWorldRadius = resolveDiscWorldRadiusForFrame(
            livePosition,
            discPlaneNormal
          );
          discVisualizer.setModelMatrix(
            createOrientedDiscMatrix(
              livePosition,
              discPlaneNormal,
              discWorldRadius,
              discModelMatrixRef.current
            )
          );
        }
      } catch {
        // Ignore frame races during teardown.
      }
    });
    removeDiscFrameListenerRef.current = removeDiscFrameListener;

    engine.requestRender();

    return () => {
      if (removeDiscFrameListenerRef.current) {
        safeCall(removeDiscFrameListenerRef.current);
        removeDiscFrameListenerRef.current = null;
      }
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeDestroy(discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (!engine.isDestroyed()) {
        engine.requestRender();
      }
    };
  }, [
    getDiscPlaneNormalAtPosition,
    resolvedAxisWidthPx,
    getActiveAxisAtPosition,
    computeDiscWorldRadius,
    resolveDiscWorldRadiusForFrame,
    discOutlineScreenPixelRadius,
    movePoint?.id,
    engine,
    showDisc,
  ]);

  const handleAxisMouseDown = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      axisCandidate?: AnnotationGizmoAxisCandidate
    ) => {
      event.preventDefault();
      event.stopPropagation();
      startDragging(event.clientX, event.clientY, axisCandidate);
    },
    [startDragging]
  );

  const handleRotationHandleMouseDown = useCallback(
    (event: ReactMouseEvent<SVGCircleElement>) => {
      event.preventDefault();
      event.stopPropagation();
      startRotating(event.clientX, event.clientY);
    },
    [startRotating]
  );

  const handleDiscPlaneMouseDown = useCallback(
    (event: ReactMouseEvent<SVGPathElement>) => {
      event.preventDefault();
      event.stopPropagation();
      startPlaneDragging(event.clientX, event.clientY, {
        snapToGround: false,
      });
    },
    [startPlaneDragging]
  );

  // The interactive overlay parts capture pointer events (so drags work), which
  // would otherwise swallow the wheel and stop the engine zooming when the cursor
  // is over the disc/handles. Re-dispatch the wheel to the engine canvas so zoom
  // keeps working over the gizmo.
  const forwardWheelToScene = useCallback(
    (event: ReactWheelEvent) => {
      if (!engine || engine.isDestroyed()) return;
      const canvas = engine.canvas;
      if (!canvas) return;
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: false,
          cancelable: true,
        })
      );
    },
    [engine]
  );
  const axisUiLengthPx = useMemo(
    () => Math.min(108, Math.max(72, radius * 16)),
    [radius]
  );
  const axisArrowOffsetPx = Math.max(26, Math.round(axisUiLengthPx * 0.42));
  const centerDragHitAreaPx = 40;
  const overlayAxisCandidates = useMemo(() => {
    if (axisCandidates && axisCandidates.length > 0) {
      return axisCandidates.map((candidate) => ({
        ...candidate,
        color: candidate.color ?? SECONDARY_AXIS_COLOR,
      }));
    }
    const unitDirectionsByAxisId: Record<DefaultAxisId, Vector3> = {
      vertical: new Vector3(0, 0, 1),
      "horizontal-east": new Vector3(1, 0, 0),
      "horizontal-north": new Vector3(0, 1, 0),
    };

    return getEnabledDefaultAxisPresentation(labels, axisTitle).map(
      (axisDefinition) => ({
        id: axisDefinition.id,
        direction: unitDirectionsByAxisId[axisDefinition.id],
        color: axisDefinition.color,
        title: axisDefinition.title,
      })
    ) as AnnotationGizmoAxisCandidate[];
  }, [axisCandidates, axisTitle, labels]);

  const handleContent = useMemo(
    () =>
      createElement(
        "div",
        {
          style: {
            position: "relative",
            width: `${axisUiLengthPx}px`,
            height: `${axisUiLengthPx}px`,
            pointerEvents: "none",
            userSelect: "none",
            overflow: "visible",
          },
        },
        ...overlayAxisCandidates.flatMap((axisCandidate) => [
          createElement("div", {
            key: `${axisCandidate.id}-line`,
            "data-point-move-axis-line": axisCandidate.id,
            style: {
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${axisArrowOffsetPx * 2}px`,
              height: `${resolvedAxisWidthPx}px`,
              background: "rgba(255,255,255,0.82)",
              opacity: 1,
              zIndex: AXIS_LINE_LAYER_Z_INDEX,
              pointerEvents: "none",
            },
          }),
          createElement(
            "svg",
            {
              key: `${axisCandidate.id}-arrow-up`,
              "data-point-move-axis-arrow-up": axisCandidate.id,
              onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
                handleAxisMouseDown(event, axisCandidate),
              onWheel: forwardWheelToScene,
              viewBox: getEquilateralTriangleViewBox(arrowActiveEdgePx),
              style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -100%)",
                transformOrigin: "50% 100%",
                width: `${arrowActiveEdgePx}px`,
                height: `${getEquilateralTriangleHeight(arrowActiveEdgePx)}px`,
                display: "block",
                color: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
                zIndex: ARROW_LAYER_Z_INDEX,
                pointerEvents: "auto",
                cursor: "move",
                userSelect: "none",
                overflow: "visible",
              },
              title: axisCandidate.title ?? labels.genericAxis,
            },
            createElement("path", {
              "data-point-move-axis-arrow-outline": "true",
              d: getEquilateralTrianglePathD(arrowActiveEdgePx),
              fill: "currentColor",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              paintOrder: "stroke",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
            }),
            createElement("path", {
              "data-point-move-axis-arrow-rim": "true",
              d: "",
              fill: "none",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeOpacity: CONE_ARROW_RIM_STROKE_OPACITY,
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
              style: { display: "none" },
            })
          ),
          createElement(
            "svg",
            {
              key: `${axisCandidate.id}-arrow-down`,
              "data-point-move-axis-arrow-down": axisCandidate.id,
              onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
                handleAxisMouseDown(event, axisCandidate),
              onWheel: forwardWheelToScene,
              viewBox: getEquilateralTriangleViewBox(arrowActiveEdgePx),
              style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -100%)",
                transformOrigin: "50% 100%",
                width: `${arrowActiveEdgePx}px`,
                height: `${getEquilateralTriangleHeight(arrowActiveEdgePx)}px`,
                display: "block",
                color: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
                zIndex: ARROW_LAYER_Z_INDEX,
                pointerEvents: "auto",
                cursor: "move",
                userSelect: "none",
                overflow: "visible",
              },
              title: axisCandidate.title ?? labels.genericAxis,
            },
            createElement("path", {
              "data-point-move-axis-arrow-outline": "true",
              d: getEquilateralTrianglePathD(arrowActiveEdgePx),
              fill: "currentColor",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              paintOrder: "stroke",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
            }),
            createElement("path", {
              "data-point-move-axis-arrow-rim": "true",
              d: "",
              fill: "none",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeOpacity: CONE_ARROW_RIM_STROKE_OPACITY,
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
              style: { display: "none" },
            })
          ),
        ]),
        createElement(
          "svg",
          {
            key: "disc-outline-svg",
            "data-point-move-disc-outline-svg": "true",
            viewBox: `${-DISC_SVG_HALF_EXTENT} ${-DISC_SVG_HALF_EXTENT} ${DISC_SVG_EXTENT} ${DISC_SVG_EXTENT}`,
            width: `${DISC_SVG_EXTENT}`,
            height: `${DISC_SVG_EXTENT}`,
            style: {
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${DISC_SVG_EXTENT}px`,
              height: `${DISC_SVG_EXTENT}px`,
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: DISC_LAYER_Z_INDEX,
            },
          },
          ...overlayAxisCandidates.map((axisCandidate) =>
            createElement("path", {
              key: `disc-outline-path-${axisCandidate.id}`,
              "data-point-move-disc-outline-path": axisCandidate.id,
              d: "",
              fill: "none",
              stroke: DISC_OUTLINE_COLOR,
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
              style: {
                opacity: DISC_OUTLINE_BASE_OPACITY,
                display: "none",
                pointerEvents: "none",
              },
            })
          ),
          createElement(
            "path",
            {
              key: "disc-interaction-path",
              "data-point-move-disc-interaction-path": "true",
              d: "",
              onMouseDown: handleDiscPlaneMouseDown,
              onWheel: forwardWheelToScene,
              fill: "rgba(255,255,255,0.001)",
              stroke: "none",
              style: {
                display: "none",
                pointerEvents: "auto",
                cursor: PLANE_DRAG_DISC_CURSOR,
              },
            },
            createElement("title", null, labels.outerDisc)
          ),
          ...(showRotationHandle
            ? [
                createElement("ellipse", {
                  key: "disc-rotation-handle",
                  "data-point-move-disc-rotation-handle": "true",
                  cx: "0",
                  cy: "0",
                  rx: `${ROTATION_HANDLE_RADIUS_PX}`,
                  ry: `${ROTATION_HANDLE_RADIUS_PX}`,
                  onMouseDown: handleRotationHandleMouseDown,
                  onWheel: forwardWheelToScene,
                  fill: DISC_OUTLINE_COLOR,
                  stroke: DISC_OUTLINE_COLOR,
                  strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
                  vectorEffect: "non-scaling-stroke",
                  style: {
                    display: "none",
                    pointerEvents: "auto",
                    cursor: "grab",
                  },
                }),
              ]
            : [])
        ),
        createElement("div", {
          "data-point-move-axis-center-hit": "true",
          onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
            startPlaneDragging(event.clientX, event.clientY, {
              snapToGround: snapPlaneDragToGround,
            }),
          onWheel: forwardWheelToScene,
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: `${centerDragHitAreaPx}px`,
            height: `${centerDragHitAreaPx}px`,
            borderRadius: "50%",
            background: "transparent",
            zIndex: CENTER_HIT_LAYER_Z_INDEX,
            pointerEvents: "auto",
            cursor: centerPlaneDragCursor,
            userSelect: "none",
          },
          title: snapPlaneDragToGround ? labels.surfacePlane : labels.freePlane,
        })
      ),
    [
      arrowActiveEdgePx,
      axisArrowOffsetPx,
      resolvedAxisWidthPx,
      axisUiLengthPx,
      centerDragHitAreaPx,
      handleDiscPlaneMouseDown,
      handleAxisMouseDown,
      handleRotationHandleMouseDown,
      forwardWheelToScene,
      overlayAxisCandidates,
      centerPlaneDragCursor,
      labels,
      showRotationHandle,
      snapPlaneDragToGround,
      startPlaneDragging,
    ]
  );

  const radiusHairlineLineVisualizers = useMemo<LineVisualizerData[]>(() => {
    if (!showDiscRadiusLabel || !showDisc || !movePoint) {
      return [];
    }
    return [
      {
        id: `${OVERLAY_HANDLE_ID}-radius-hairline`,
        getSvgLine: () => {
          const geometry = radiusHairlineGeometryRef.current;
          if (!geometry) {
            return null;
          }
          return {
            start: {
              x: geometry.startX,
              y: geometry.startY,
            } as CssPixelPosition,
            end: { x: geometry.endX, y: geometry.endY } as CssPixelPosition,
          };
        },
        stroke: DISC_OUTLINE_COLOR,
        strokeWidth: 0.25,
        labelText: radiusLabelText,
        labelColor: DISC_OUTLINE_COLOR,
        labelFontSize: 8,
      },
    ];
  }, [movePoint, radiusLabelText, showDisc, showDiscRadiusLabel]);

  useLineVisualizers(
    radiusHairlineLineVisualizers,
    radiusHairlineLineVisualizers.length > 0
  );

  useEffect(() => {
    if (!engine || engine.isDestroyed() || !movePoint) {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      return;
    }

    removeLabelOverlayElement(OVERLAY_HANDLE_ID);

    setLabelOverlayElement({
      id: OVERLAY_HANDLE_ID,
      zIndex: MOVE_GIZMO_OVERLAY_Z_INDEX,
      content: handleContent,
      updatePosition: (elementDiv) => {
        try {
          const rawPoint = movePointRef.current;
          if (!rawPoint || engine.isDestroyed()) return false;

          // Use the live anchor so the overlay does not wait for React state.
          const activePoint = {
            id: rawPoint.id,
            geometryECEF:
              livePointPositionsRef.current.get(rawPoint.id) ??
              rawPoint.geometryECEF,
          };

          const projectedAnchor = engine.worldToScreen(
            activePoint.geometryECEF
          );
          if (!projectedAnchor) return false;
          const anchorCanvasPosition: AnnotationScreenPosition = {
            x: projectedAnchor.x,
            y: projectedAnchor.y,
          };

          const axisCandidatesAtPoint = getAxisCandidatesAtPosition(
            activePoint.geometryECEF
          );
          const activeAxisCandidateAtPoint =
            axisCandidatesAtPoint.find(
              (candidate) => candidate.id === activeAxisIdRef.current
            ) ??
            axisCandidatesAtPoint[0] ??
            null;
          const activeAxisId = activeAxisCandidateAtPoint?.id ?? null;
          const configuredDiscPlaneNormal = discPlaneNormalRef.current;
          const activeDiscPlaneNormal = getDiscPlaneNormalAtPosition(
            activePoint.geometryECEF
          );
          const projectedOutlinesByAxisId = new Map<
            string,
            {
              supportRadius: number;
              pathD: string;
              projectedPoints?: ScreenPoint2[];
              worldRadius?: number;
              planeBasisX?: Vector3;
              planeBasisY?: Vector3;
            }
          >();

          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${anchorCanvasPosition.x}px`;
          elementDiv.style.top = `${anchorCanvasPosition.y}px`;
          elementDiv.style.transform = "translate(-50%, -50%)";
          elementDiv.style.zIndex = `${MOVE_GIZMO_OVERLAY_Z_INDEX}`;
          elementDiv.style.pointerEvents = "none";
          elementDiv.style.display = "block";

          axisCandidatesAtPoint.forEach((planeCandidate) => {
            const discOutlinePath = elementDiv.querySelector(
              `[data-point-move-disc-outline-path="${planeCandidate.id}"]`
            ) as SVGPathElement | null;
            if (!discOutlinePath) return;

            const showFallbackCenteredCircle = () => {
              const shouldRenderPlaneOutline =
                showDisc &&
                activeAxisId !== null &&
                planeCandidate.id === activeAxisId;
              const fallbackPoints = buildCirclePoints(
                discOutlineScreenPixelRadius,
                computeCircleSegments(discOutlineScreenPixelRadius)
              );
              const fallbackPathD = toSvgPathD(fallbackPoints, {
                close: true,
                digits: 2,
              });
              projectedOutlinesByAxisId.set(planeCandidate.id, {
                supportRadius: Math.max(discOutlineScreenPixelRadius, 1),
                pathD: fallbackPathD,
                projectedPoints: fallbackPoints,
              });
              discOutlinePath.setAttribute("d", fallbackPathD);
              discOutlinePath.style.display = shouldRenderPlaneOutline
                ? "block"
                : "none";
              discOutlinePath.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
              discOutlinePath.style.stroke = DISC_OUTLINE_COLOR;
            };

            const planeNormalForCandidate =
              configuredDiscPlaneNormal &&
              configuredDiscPlaneNormal.lengthSq() > AXIS_NUMERIC_EPSILON
                ? activeDiscPlaneNormal
                : planeCandidate.direction;
            const planeBasis = createPlaneBasis(planeNormalForCandidate);

            // Sync the overlay outline to the exact world radius the 3D disc
            // uses (same screen/world resize/freeze logic) so both representations
            // always agree.
            const discWorldRadius = resolveDiscWorldRadiusForFrame(
              activePoint.geometryECEF,
              planeNormalForCandidate
            );

            if (!Number.isFinite(discWorldRadius) || discWorldRadius <= 0) {
              showFallbackCenteredCircle();
              return;
            }

            // Tessellate from the disc's apparent screen radius so the outline
            // stays smooth (round) as it grows/shrinks with the camera.
            const pixelPerWorldMax = getPlanePixelsPerWorldMax(
              engine,
              activePoint.geometryECEF,
              planeBasis,
              anchorCanvasPosition,
              DISC_PROJECTION_SCALE_SAMPLE_COUNT
            );
            const outlineScreenRadiusPx =
              pixelPerWorldMax > AXIS_NUMERIC_EPSILON
                ? discWorldRadius * pixelPerWorldMax
                : discOutlineScreenPixelRadius;
            const outlineSegments = computeCircleSegments(
              outlineScreenRadiusPx
            );

            const projectedOutlinePoints = projectPlaneOutlinePoints(
              engine,
              activePoint.geometryECEF,
              planeBasis,
              discWorldRadius,
              outlineSegments,
              anchorCanvasPosition
            );

            if (projectedOutlinePoints.length < 12) {
              showFallbackCenteredCircle();
              return;
            }

            const maxProjectedRadius = getSupportRadius2d(
              projectedOutlinePoints
            );

            const pathD = toSvgPathD(projectedOutlinePoints, {
              close: true,
              digits: 2,
            });
            projectedOutlinesByAxisId.set(planeCandidate.id, {
              supportRadius:
                maxProjectedRadius > AXIS_NUMERIC_EPSILON
                  ? maxProjectedRadius
                  : Math.max(discOutlineScreenPixelRadius, 1),
              pathD,
              projectedPoints: projectedOutlinePoints,
              worldRadius: discWorldRadius,
              planeBasisX: planeBasis.xAxis,
              planeBasisY: planeBasis.yAxis,
            });

            discOutlinePath.setAttribute("d", pathD);
            const shouldRenderPlaneOutline =
              showDisc &&
              activeAxisId !== null &&
              planeCandidate.id === activeAxisId;
            discOutlinePath.style.display = shouldRenderPlaneOutline
              ? "block"
              : "none";
            discOutlinePath.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
            discOutlinePath.style.stroke = DISC_OUTLINE_COLOR;
          });

          const discInteractionPath = elementDiv.querySelector(
            '[data-point-move-disc-interaction-path="true"]'
          ) as SVGPathElement | null;
          const rotationHandle = elementDiv.querySelector(
            '[data-point-move-disc-rotation-handle="true"]'
          ) as SVGEllipseElement | null;

          const activeOutline = activeAxisId
            ? projectedOutlinesByAxisId.get(activeAxisId)
            : undefined;

          const arrowPerspectiveScale =
            activeOutline && discOutlineScreenPixelRadius > AXIS_NUMERIC_EPSILON
              ? Math.min(
                  ARROW_PERSPECTIVE_SCALE_MAX,
                  Math.max(
                    ARROW_PERSPECTIVE_SCALE_MIN,
                    activeOutline.supportRadius / discOutlineScreenPixelRadius
                  )
                )
              : 1;

          const activeAxisColor =
            axisCandidatesAtPoint.find(
              (candidate) => candidate.id === activeAxisId
            )?.color ?? DISC_OUTLINE_COLOR;

          if (discInteractionPath) {
            if (showDisc && activeOutline) {
              discInteractionPath.setAttribute("d", activeOutline.pathD);
              discInteractionPath.style.display = "block";
            } else {
              discInteractionPath.style.display = "none";
              discInteractionPath.setAttribute("d", "");
            }
            discInteractionPath.style.cursor =
              isDraggingRef.current &&
              dragStateRef.current?.mode === "plane-translate"
                ? "grabbing"
                : PLANE_DRAG_DISC_CURSOR;
          }

          if (rotationHandle) {
            if (showRotationHandle && showDisc && activeOutline) {
              let handleTargetAngleRad =
                ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD;

              if (
                activeAxisId &&
                activeOutline.planeBasisX &&
                activeOutline.planeBasisY
              ) {
                const inPlaneAxes = axisCandidatesAtPoint.filter(
                  (candidate) => candidate.id !== activeAxisId
                );
                const primaryInPlaneAxis = inPlaneAxes[0]?.direction;
                if (primaryInPlaneAxis) {
                  const projectedX = primaryInPlaneAxis.dot(
                    activeOutline.planeBasisX
                  );
                  const projectedY = primaryInPlaneAxis.dot(
                    activeOutline.planeBasisY
                  );
                  if (
                    Math.hypot(projectedX, projectedY) > AXIS_NUMERIC_EPSILON
                  ) {
                    const primaryAxisAngleRad = Math.atan2(
                      projectedY,
                      projectedX
                    );
                    handleTargetAngleRad =
                      primaryAxisAngleRad +
                      ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD;
                  }
                }
              }

              const handleDirX = Math.cos(handleTargetAngleRad);
              const handleDirY = Math.sin(handleTargetAngleRad);

              let handleX = handleDirX * activeOutline.supportRadius;
              let handleY = handleDirY * activeOutline.supportRadius;

              if (
                activeOutline.worldRadius !== undefined &&
                activeOutline.planeBasisX &&
                activeOutline.planeBasisY
              ) {
                const worldHandlePoint = activePoint.geometryECEF
                  .clone()
                  .addScaledVector(
                    activeOutline.planeBasisX,
                    handleDirX * activeOutline.worldRadius
                  )
                  .addScaledVector(
                    activeOutline.planeBasisY,
                    handleDirY * activeOutline.worldRadius
                  );
                const projectedHandlePoint =
                  engine.worldToScreen(worldHandlePoint);
                if (projectedHandlePoint) {
                  handleX = projectedHandlePoint.x - anchorCanvasPosition.x;
                  handleY = projectedHandlePoint.y - anchorCanvasPosition.y;
                }
              }

              const activeNormal = (
                configuredDiscPlaneNormal &&
                configuredDiscPlaneNormal.lengthSq() > AXIS_NUMERIC_EPSILON
                  ? activeDiscPlaneNormal
                  : activeAxisCandidateAtPoint?.direction ??
                    getEllipsoidalUpDirectionAtAnchor(activePoint.geometryECEF)
              )
                .clone()
                .normalize();
              const cameraPositionECEF = engine.getCameraPositionECEF();
              const toCamera = cameraPositionECEF
                ? new Vector3()
                    .subVectors(cameraPositionECEF, activePoint.geometryECEF)
                    .normalize()
                : null;
              const facingFactor = toCamera
                ? Math.abs(activeNormal.dot(toCamera))
                : 1;
              const minorRadius = Math.max(
                ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
                ROTATION_HANDLE_RADIUS_PX * facingFactor
              );

              const normalTipWorld = activePoint.geometryECEF
                .clone()
                .addScaledVector(
                  activeNormal,
                  ROTATION_NORMAL_SCREEN_SAMPLE_WORLD
                );
              const normalTipCanvas = engine.worldToScreen(normalTipWorld);
              let ellipseRotationDeg = 0;
              if (normalTipCanvas) {
                const normalDx = normalTipCanvas.x - anchorCanvasPosition.x;
                const normalDy = normalTipCanvas.y - anchorCanvasPosition.y;
                if (Math.hypot(normalDx, normalDy) > AXIS_NUMERIC_EPSILON) {
                  const normalAngleRad = Math.atan2(normalDy, normalDx);
                  ellipseRotationDeg = radToDegNumeric(
                    normalAngleRad - Math.PI / 2
                  );
                }
              }

              rotationHandle.setAttribute("cx", `${handleX}`);
              rotationHandle.setAttribute("cy", `${handleY}`);
              rotationHandle.setAttribute("rx", `${ROTATION_HANDLE_RADIUS_PX}`);
              rotationHandle.setAttribute("ry", `${minorRadius}`);
              rotationHandle.setAttribute("fill", activeAxisColor);
              rotationHandle.setAttribute("stroke", DISC_OUTLINE_COLOR);
              rotationHandle.setAttribute(
                "stroke-width",
                `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`
              );
              rotationHandle.setAttribute(
                "transform",
                `rotate(${ellipseRotationDeg} ${handleX} ${handleY})`
              );
              rotationHandle.style.cursor =
                isDraggingRef.current && dragStateRef.current?.mode === "rotate"
                  ? "grabbing"
                  : "grab";
              rotationHandle.style.display = "block";
            } else {
              rotationHandle.style.display = "none";
              rotationHandle.removeAttribute("transform");
            }
          }

          axisCandidatesAtPoint.forEach((axisCandidate) => {
            const previousScreenDirection =
              axisScreenDirectionRef.current[axisCandidate.id] ?? null;

            let axisAngleRad =
              previousScreenDirection?.angleRad ?? -Math.PI / 2;
            let axisDirX = previousScreenDirection?.x ?? 0;
            let axisDirY = previousScreenDirection?.y ?? -1;

            const unitAxisSampleWorld = activePoint.geometryECEF
              .clone()
              .add(axisCandidate.direction);
            const unitAxisSampleCanvas =
              engine.worldToScreen(unitAxisSampleWorld);

            const unitSamplePixels = unitAxisSampleCanvas
              ? Math.hypot(
                  unitAxisSampleCanvas.x - anchorCanvasPosition.x,
                  unitAxisSampleCanvas.y - anchorCanvasPosition.y
                )
              : 0;

            const sampleWorldStep = getAxisSampleWorldStep(
              unitSamplePixels,
              AXIS_SCREEN_SAMPLE_TARGET_PX,
              AXIS_SCREEN_SAMPLE_MIN_WORLD,
              AXIS_SCREEN_SAMPLE_MAX_WORLD
            );

            if (sampleWorldStep > 0) {
              const plusWorld = activePoint.geometryECEF
                .clone()
                .addScaledVector(axisCandidate.direction, sampleWorldStep);
              const minusWorld = activePoint.geometryECEF
                .clone()
                .addScaledVector(axisCandidate.direction, -sampleWorldStep);

              const plusProjected = engine.worldToScreen(plusWorld);
              const plusCanvas = plusProjected
                ? { x: plusProjected.x, y: plusProjected.y }
                : null;
              const minusProjected = engine.worldToScreen(minusWorld);
              const minusCanvas = minusProjected
                ? { x: minusProjected.x, y: minusProjected.y }
                : null;

              let dx = 0;
              let dy = 0;
              if (plusCanvas && minusCanvas) {
                dx = plusCanvas.x - minusCanvas.x;
                dy = plusCanvas.y - minusCanvas.y;
              } else if (plusCanvas) {
                dx = plusCanvas.x - anchorCanvasPosition.x;
                dy = plusCanvas.y - anchorCanvasPosition.y;
              } else if (minusCanvas) {
                dx = anchorCanvasPosition.x - minusCanvas.x;
                dy = anchorCanvasPosition.y - minusCanvas.y;
              }

              const vectorLength = Math.hypot(dx, dy);
              if (vectorLength > 0.001) {
                let nextDirX = dx / vectorLength;
                let nextDirY = dy / vectorLength;
                let nextAngleRad = Math.atan2(dy, dx);

                if (previousScreenDirection) {
                  const dotWithPrevious =
                    nextDirX * previousScreenDirection.x +
                    nextDirY * previousScreenDirection.y;
                  if (dotWithPrevious < 0) {
                    nextDirX *= -1;
                    nextDirY *= -1;
                    nextAngleRad = negativePiToPi(nextAngleRad + Math.PI);
                  }
                }

                if (vectorLength < 6 && previousScreenDirection) {
                  axisDirX = previousScreenDirection.x;
                  axisDirY = previousScreenDirection.y;
                  axisAngleRad = previousScreenDirection.angleRad;
                } else {
                  axisDirX = nextDirX;
                  axisDirY = nextDirY;
                  axisAngleRad = nextAngleRad;
                  axisScreenDirectionRef.current[axisCandidate.id] = {
                    x: axisDirX,
                    y: axisDirY,
                    angleRad: axisAngleRad,
                  };
                }
              }
            }

            const isActiveAxis = activeAxisIdRef.current === axisCandidate.id;
            const axisOpacity = isActiveAxis ? 1 : INACTIVE_AXIS_OPACITY;
            const baseArrowEdgePx = isActiveAxis
              ? arrowActiveEdgePx
              : arrowInactiveEdgePx;
            const arrowEdgePx = Math.max(
              1,
              baseArrowEdgePx * arrowPerspectiveScale
            );
            const arrowHeightPx = getEquilateralTriangleHeight(arrowEdgePx);
            let arrowAnchorBaseDistancePx = axisArrowOffsetPx;

            if (projectedOutlinesByAxisId.size > 0 && activeAxisId) {
              let supportDistance = 0;

              if (axisCandidate.id === activeAxisId) {
                projectedOutlinesByAxisId.forEach((outline, outlineAxisId) => {
                  if (outlineAxisId === activeAxisId) return;
                  const s = outline.supportRadius;
                  if (s > supportDistance) supportDistance = s;
                });
                // No other in-plane disc to clear (e.g. only the vertical axis
                // is enabled) → sit just outside our own disc so the distance
                // tracks the disc under perspective.
                if (supportDistance <= AXIS_NUMERIC_EPSILON) {
                  supportDistance = activeOutline?.supportRadius ?? 0;
                }
              } else if (activeOutline) {
                supportDistance = activeOutline.supportRadius;
              }

              if (supportDistance > AXIS_NUMERIC_EPSILON) {
                const multiplier =
                  axisCandidate.id === activeAxisId
                    ? ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER
                    : INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER;
                arrowAnchorBaseDistancePx = Math.max(
                  supportDistance * multiplier,
                  20
                );
              }
            }

            const isRotateMode = dragStateRef.current?.mode === "rotate";
            if (isRotateMode) {
              const cachedDistance =
                axisAnchorDistanceRef.current[axisCandidate.id];
              if (Number.isFinite(cachedDistance) && cachedDistance > 0) {
                arrowAnchorBaseDistancePx = cachedDistance;
              } else {
                axisAnchorDistanceRef.current[axisCandidate.id] =
                  arrowAnchorBaseDistancePx;
              }
            } else {
              axisAnchorDistanceRef.current[axisCandidate.id] =
                arrowAnchorBaseDistancePx;
            }

            const arrowOffsetPx = arrowAnchorBaseDistancePx;

            const axisLine = elementDiv.querySelector(
              `[data-point-move-axis-line="${axisCandidate.id}"]`
            ) as HTMLElement | null;
            if (axisLine) {
              axisLine.style.width = `${arrowOffsetPx * 2}px`;
              axisLine.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad)`;
              axisLine.style.opacity = `${axisOpacity}`;
            }

            // The arrows as cones in perspective, on the world axis whose
            // screen direction the flat layout uses (it may be flipped to
            // keep the screen direction stable).
            const cameraPositionForArrows = engine.getCameraPositionECEF();
            const worldAxisSign =
              unitAxisSampleCanvas &&
              (unitAxisSampleCanvas.x - anchorCanvasPosition.x) * axisDirX +
                (unitAxisSampleCanvas.y - anchorCanvasPosition.y) * axisDirY <
                0
                ? -1
                : 1;
            const resolveConeArrow = (sign: 1 | -1) =>
              cameraPositionForArrows
                ? projectConeArrowSilhouette({
                    project: (world) => engine.worldToScreen(world),
                    origin: activePoint.geometryECEF,
                    direction: axisCandidate.direction
                      .clone()
                      .multiplyScalar(worldAxisSign * sign),
                    offsetPx: arrowOffsetPx,
                    edgePx: arrowEdgePx,
                    heightPx: arrowHeightPx,
                    anchorCanvasPosition,
                    cameraPosition: cameraPositionForArrows,
                  })
                : null;

            const axisArrowUp = elementDiv.querySelector(
              `[data-point-move-axis-arrow-up="${axisCandidate.id}"]`
            ) as HTMLElement | null;
            if (axisArrowUp) {
              axisArrowUp.setAttribute(
                "viewBox",
                getEquilateralTriangleViewBox(arrowEdgePx)
              );
              axisArrowUp.style.width = `${arrowEdgePx}px`;
              axisArrowUp.style.height = `${arrowHeightPx}px`;
              axisArrowUp.style.left = `calc(50% + ${
                axisDirX * arrowOffsetPx
              }px)`;
              axisArrowUp.style.top = `calc(50% + ${
                axisDirY * arrowOffsetPx
              }px)`;
              axisArrowUp.style.transformOrigin = "50% 100%";
              axisArrowUp.style.transform = `translate(-50%, -100%) rotate(${
                axisAngleRad + Math.PI / 2
              }rad)`;
              axisArrowUp.style.opacity = `${axisOpacity}`;
              axisArrowUp.style.cursor = isDraggingRef.current
                ? "grabbing"
                : "move";
              updateTrianglePathAppearance(
                axisArrowUp.querySelector(
                  "[data-point-move-axis-arrow-outline]"
                ) as SVGPathElement | null,
                arrowEdgePx
              );
              applyConeArrowSilhouette(axisArrowUp, resolveConeArrow(1));
            }

            const axisArrowDown = elementDiv.querySelector(
              `[data-point-move-axis-arrow-down="${axisCandidate.id}"]`
            ) as HTMLElement | null;
            if (axisArrowDown) {
              axisArrowDown.setAttribute(
                "viewBox",
                getEquilateralTriangleViewBox(arrowEdgePx)
              );
              axisArrowDown.style.width = `${arrowEdgePx}px`;
              axisArrowDown.style.height = `${arrowHeightPx}px`;
              axisArrowDown.style.left = `calc(50% + ${
                -axisDirX * arrowOffsetPx
              }px)`;
              axisArrowDown.style.top = `calc(50% + ${
                -axisDirY * arrowOffsetPx
              }px)`;
              axisArrowDown.style.transformOrigin = "50% 100%";
              axisArrowDown.style.transform = `translate(-50%, -100%) rotate(${
                axisAngleRad + Math.PI / 2 + Math.PI
              }rad)`;
              axisArrowDown.style.opacity = `${axisOpacity}`;
              axisArrowDown.style.cursor = isDraggingRef.current
                ? "grabbing"
                : "move";
              updateTrianglePathAppearance(
                axisArrowDown.querySelector(
                  "[data-point-move-axis-arrow-outline]"
                ) as SVGPathElement | null,
                arrowEdgePx
              );
              applyConeArrowSilhouette(axisArrowDown, resolveConeArrow(-1));
            }
          });

          const centerHit = elementDiv.querySelector(
            '[data-point-move-axis-center-hit="true"]'
          ) as HTMLElement | null;
          if (centerHit) {
            centerHit.style.cursor =
              isDraggingRef.current &&
              dragStateRef.current?.mode === "plane-translate"
                ? "grabbing"
                : centerPlaneDragCursor;
          }

          const horizontalRadiusPx = activeOutline?.supportRadius ?? 0;
          const radiusWorldValue = activeOutline?.worldRadius;
          if (
            showDiscRadiusLabelRef.current &&
            showDisc &&
            horizontalRadiusPx > AXIS_NUMERIC_EPSILON &&
            radiusWorldValue !== undefined &&
            Number.isFinite(radiusWorldValue)
          ) {
            radiusHairlineGeometryRef.current = {
              startX: anchorCanvasPosition.x,
              startY: anchorCanvasPosition.y,
              endX: anchorCanvasPosition.x + horizontalRadiusPx,
              endY: anchorCanvasPosition.y,
            };
            const nextRadiusLabelText = formatLengthMeters(radiusWorldValue, {
              maximumFractionDigitsMeters: 0,
            });
            if (nextRadiusLabelText !== radiusLabelTextRef.current) {
              radiusLabelTextRef.current = nextRadiusLabelText;
              setRadiusLabelText(nextRadiusLabelText);
            }
          } else if (radiusHairlineGeometryRef.current !== null) {
            radiusHairlineGeometryRef.current = null;
          }

          return true;
        } catch {
          // Overlay refresh can race with engine/widget teardown.
          return false;
        }
      },
      visible: true,
    });

    return () => {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
    };
  }, [
    setLabelOverlayElement,
    handleContent,
    movePoint?.id,
    axisArrowOffsetPx,
    removeLabelOverlayElement,
    engine,
    getAxisCandidatesAtPosition,
    computeDiscWorldRadius,
    resolveDiscWorldRadiusForFrame,
    radius,
    discScalingMode,
    discOutlineScreenPixelRadius,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    showDisc,
  ]);

  useEffect(() => {
    if (!engine || engine.isDestroyed() || !movePoint) return;

    // Port of the Cesium `ScreenSpaceEventHandler` LEFT_CLICK: a canvas click
    // whose press and release stayed within the click pixel tolerance. Camera
    // drags end with a DOM click too, but never counted as a Cesium click.
    const canvas = engine.canvas;
    let pressClientPosition: { x: number; y: number } | null = null;
    const handleCanvasMouseDown = (mouseEvent: MouseEvent) => {
      pressClientPosition =
        mouseEvent.button === 0
          ? { x: mouseEvent.clientX, y: mouseEvent.clientY }
          : null;
    };
    const handleCanvasClick = (mouseEvent: MouseEvent) => {
      if (mouseEvent.button !== 0) return;
      const pressPosition = pressClientPosition;
      pressClientPosition = null;
      if (
        pressPosition &&
        Math.hypot(
          mouseEvent.clientX - pressPosition.x,
          mouseEvent.clientY - pressPosition.y
        ) > SCENE_CLICK_PIXEL_TOLERANCE
      ) {
        return;
      }
      if (suppressNextSceneClickRef.current) {
        suppressNextSceneClickRef.current = false;
        return;
      }
      if (isDraggingRef.current) return;
      onExitRef.current?.();
    };
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    canvas.addEventListener("click", handleCanvasClick);

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      stopDragging(false);
      onExitRef.current?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
      canvas.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [movePoint?.id, engine, stopDragging]);

  useEffect(() => {
    if (movePoint) return;
    stopDragging(false);
    removeLabelOverlayElement(OVERLAY_HANDLE_ID);
  }, [movePoint, removeLabelOverlayElement, stopDragging]);

  useEffect(
    () => () => {
      if (clearInitialSceneClickGuardTimeoutRef.current !== null) {
        window.clearTimeout(clearInitialSceneClickGuardTimeoutRef.current);
        clearInitialSceneClickGuardTimeoutRef.current = null;
      }
      stopDragging(false);
      livePointPositionsRef.current.clear();
      restoreGlobalDragCursor(restoreGlobalCursorRef);
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeDestroy(discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (removeDiscFrameListenerRef.current) {
        safeCall(removeDiscFrameListenerRef.current);
        removeDiscFrameListenerRef.current = null;
      }
    },
    [removeLabelOverlayElement, engine, stopDragging]
  );
};
