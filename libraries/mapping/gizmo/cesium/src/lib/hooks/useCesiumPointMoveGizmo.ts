import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  buildCirclePoints,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  getSupportRadius2d,
  MINUS_PI_OVER_FOUR,
  negativePiToPi,
} from "@carma-commons/math";
import {
  createRotationAxisVisualizer,
  type RotationAxisVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import { AXIS_NUMERIC_EPSILON, toSvgPathD } from "@carma-mapping/gizmo/core";
import { useLabelOverlay } from "@carma-providers/label-overlay";
import {
  Cartesian3,
  Color,
  Matrix4,
  Primitive,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  defined,
  type Scene,
} from "@carma-cesium";
import {
  CarmaTransforms,
  createRing,
} from "@carma-mapping/engines/cesium/core";

import {
  createPlaneBasis,
  getAxisParamFromClientPosition,
  getAxisSampleWorldStep,
  getGroundPointFromClientPosition,
  getPlaneAngleFromClientPosition,
  getPlanePixelsPerWorldMax,
  getPlanePointFromClientPosition,
  getUpVectorAtPosition,
  projectPlaneOutlinePoints,
  rotateVectorByVersor,
  type ScreenPoint2,
} from "../cesiumPointMoveGizmoMath";
export type CesiumGizmoPoint = {
  id: string;
  geometryECEF: Cartesian3;
};

type AxisDragState =
  | {
      mode: "translate";
      pointId: string;
      axisOrigin: Cartesian3;
      axisDirection: Cartesian3;
      startAxisParam: number;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "plane-translate";
      pointId: string;
      planeOrigin: Cartesian3;
      planeNormal: Cartesian3;
      planeBasisX: Cartesian3;
      planeBasisY: Cartesian3;
      startPlanePoint: Cartesian3;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "rotate";
      pointId: string;
      axisOrigin: Cartesian3;
      rotationNormal: Cartesian3;
      planeBasisX: Cartesian3;
      planeBasisY: Cartesian3;
      lastPlaneAngleRad: number;
      accumulatedDeltaRad: number;
      baseRotationAngleRad: number;
      cleanupWindowListeners: () => void;
    };

type RotationState = {
  pointId: string;
  normal: Cartesian3;
  angleRad: number;
};

type RotationFrameState = {
  pointId: string;
  activeAxisId: string;
  normal: Cartesian3;
  baseDirections: Record<string, Cartesian3>;
};

export type CesiumMoveGizmoAxisCandidate = {
  id: string;
  direction: Cartesian3;
  color?: string;
  title?: string | null;
};

export type CesiumGizmoRotationDelta = {
  pointId: string;
  axisOrigin: Cartesian3;
  rotationNormal: Cartesian3;
  deltaAngleRad: number;
  accumulatedAngleRad: number;
};

export type CesiumGizmoScreenPosition = ScreenPoint2;

export type UseCesiumPointMoveGizmoOptions = {
  points: CesiumGizmoPoint[];
  movePointId?: string | null;
  axisDirection?: Cartesian3 | null;
  discPlaneNormal?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: CesiumMoveGizmoAxisCandidate[] | null;
  showRotationHandle?: boolean;
  showDisc?: boolean;
  discOutlineFixedScreenSize?: boolean;
  discOutlineScreenPixelRadius?: number;
  axisWidthPx?: number;
  outlineWidthPx?: number;
  arrowActiveEdgePx?: number;
  arrowInactiveEdgePx?: number;
  snapPlaneDragToGround?: boolean;
  radius: number;
  onPointPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3,
    screenPosition?: CesiumGizmoScreenPosition
  ) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisDirectionChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  onRotationDelta?: (delta: CesiumGizmoRotationDelta) => void;
  onExit?: () => void;
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
const DISC_FILL_COLOR = Color.WHITE.withAlpha(0.5);
const DISC_SCREEN_PIXEL_RADIUS = 32;
const DISC_OUTLINE_SEGMENTS = 72;
const DISC_SVG_EXTENT = 320;
const DISC_SVG_HALF_EXTENT = DISC_SVG_EXTENT / 2;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
const OPEN_GIZMO_SCENE_CLICK_GUARD_MS = 220;
const AXIS_SCREEN_SAMPLE_TARGET_PX = 48;
const AXIS_SCREEN_SAMPLE_MIN_WORLD = 0.25;
const AXIS_SCREEN_SAMPLE_MAX_WORLD = 500;
const DEFAULT_ACTIVE_ARROW_EDGE_PX = 16;
const DEFAULT_INACTIVE_ARROW_EDGE_PX = 12;
// Keep rotate handle/disc below arrows.
const AXIS_LINE_LAYER_Z_INDEX = 0;
const DISC_LAYER_Z_INDEX = 1;
const CENTER_HIT_LAYER_Z_INDEX = 2;
const ARROW_LAYER_Z_INDEX = 3;
const AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX = 1.5;
const PLANE_DRAG_GROUND_SNAP_CURSOR = "row-resize";
const PLANE_DRAG_DISC_CURSOR = "move";
const ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.3;
const INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER = 1.05;
const ROTATION_HANDLE_RADIUS_PX = 8;
const ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD = MINUS_PI_OVER_FOUR;
const ROTATION_HANDLE_MIN_MINOR_RADIUS_PX = 0.25;
const ROTATION_NORMAL_SCREEN_SAMPLE_WORLD = 1;

const DEFAULT_VERTICAL_AXIS_TITLE = "Punkt entlang der U-Achse verschieben";
const DEFAULT_EAST_AXIS_TITLE = "Punkt entlang der E-Achse verschieben";
const DEFAULT_NORTH_AXIS_TITLE = "Punkt entlang der N-Achse verschieben";

const DEFAULT_AXIS_PRESENTATION = [
  {
    id: "vertical",
    color: ENU_UP_AXIS_COLOR,
    getTitle: (axisTitle?: string | null) =>
      axisTitle ?? DEFAULT_VERTICAL_AXIS_TITLE,
  },
  {
    id: "horizontal-east",
    color: ENU_EAST_AXIS_COLOR,
    getTitle: () => DEFAULT_EAST_AXIS_TITLE,
  },
  {
    id: "horizontal-north",
    color: ENU_NORTH_AXIS_COLOR,
    getTitle: () => DEFAULT_NORTH_AXIS_TITLE,
  },
] as const;

type DefaultAxisId = (typeof DEFAULT_AXIS_PRESENTATION)[number]["id"];

const getDefaultAxisPresentation = (axisTitle?: string | null) =>
  DEFAULT_AXIS_PRESENTATION.map((axisDefinition) => ({
    id: axisDefinition.id,
    color: axisDefinition.color,
    title: axisDefinition.getTitle(axisTitle),
  }));

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
    // Scene/widget teardown can race with explicit cleanup; ignore already-destroyed internals.
  }
};

const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Listener removal can race with scene/widget destruction.
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

const safeRemovePrimitive = (
  scene: Scene | null,
  primitive: Primitive | null | undefined
) => {
  if (!scene || !primitive) return;
  try {
    if (!scene.isDestroyed()) {
      scene.primitives.remove(primitive);
    }
  } catch {
    // Scene/primitive teardown may race while effects are cleaning up.
  }
};

const DEFAULT_AXIS_ENU_MATRIX_SCRATCH = new Matrix4();

const createOrientedDiscModelMatrix = (
  origin: Cartesian3,
  planeNormal: Cartesian3,
  radius: number,
  result?: Matrix4
): Matrix4 => {
  const safeRadius = Math.max(radius, AXIS_NUMERIC_EPSILON);
  const normalizedNormal = Cartesian3.normalize(planeNormal, new Cartesian3());
  const planeBasis = createPlaneBasis(normalizedNormal);
  return CarmaTransforms.createBasisScaleTranslationMatrix(
    origin,
    planeBasis.xAxis,
    planeBasis.yAxis,
    normalizedNormal,
    safeRadius,
    safeRadius,
    1,
    result
  );
};

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

const getDefaultAxisCandidatesAtPosition = (
  origin: Cartesian3,
  axisTitle?: string | null
): CesiumMoveGizmoAxisCandidate[] => {
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(
    origin,
    undefined,
    DEFAULT_AXIS_ENU_MATRIX_SCRATCH
  );

  const eastDirectionRaw = CarmaTransforms.matrix4ColumnToCartesian3(
    eastNorthUpMatrix,
    0
  );
  const northDirectionRaw = CarmaTransforms.matrix4ColumnToCartesian3(
    eastNorthUpMatrix,
    1
  );
  const upDirectionRaw = CarmaTransforms.matrix4ColumnToCartesian3(
    eastNorthUpMatrix,
    2
  );
  const eastDirection = Cartesian3.normalize(
    eastDirectionRaw,
    eastDirectionRaw
  );
  const northDirection = Cartesian3.normalize(
    northDirectionRaw,
    northDirectionRaw
  );
  const upDirection = Cartesian3.normalize(upDirectionRaw, upDirectionRaw);

  const directionsByAxisId: Record<DefaultAxisId, Cartesian3> = {
    vertical: upDirection,
    "horizontal-east": eastDirection,
    "horizontal-north": northDirection,
  };

  return getDefaultAxisPresentation(axisTitle).map((axisDefinition) => ({
    id: axisDefinition.id,
    direction: directionsByAxisId[axisDefinition.id],
    color: axisDefinition.color,
    title: axisDefinition.title,
  }));
};

export const useCesiumPointMoveGizmo = (
  scene: Scene | null,
  {
    points,
    movePointId = null,
    axisDirection = null,
    discPlaneNormal = null,
    axisTitle = null,
    preferredAxisId = null,
    axisCandidates = null,
    showRotationHandle = true,
    showDisc = true,
    discOutlineFixedScreenSize = true,
    discOutlineScreenPixelRadius = DISC_SCREEN_PIXEL_RADIUS,
    axisWidthPx,
    outlineWidthPx: _outlineWidthPx,
    arrowActiveEdgePx = DEFAULT_ACTIVE_ARROW_EDGE_PX,
    arrowInactiveEdgePx = DEFAULT_INACTIVE_ARROW_EDGE_PX,
    snapPlaneDragToGround = false,
    radius,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange,
    onRotationDelta,
    onExit,
  }: UseCesiumPointMoveGizmoOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const axisVisualizerRef = useRef<RotationAxisVisualizer | null>(null);
  const discVisualizerRef = useRef<Primitive | null>(null);
  const removePostRenderListenerRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<AxisDragState | null>(null);
  const isDraggingRef = useRef(false);
  const suppressNextSceneClickRef = useRef(false);
  const clearInitialSceneClickGuardTimeoutRef = useRef<number | null>(null);
  const movePointRef = useRef<CesiumGizmoPoint | null>(null);
  const rotationStateRef = useRef<RotationState | null>(null);
  const rotationFrameRef = useRef<RotationFrameState | null>(null);
  const radiusRef = useRef(radius);
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
  const axisDirectionRef = useRef<Cartesian3 | null>(axisDirection);
  const discPlaneNormalRef = useRef<Cartesian3 | null>(discPlaneNormal);
  const preferredAxisIdRef = useRef<string | null>(preferredAxisId);
  const axisCandidatesRef = useRef<CesiumMoveGizmoAxisCandidate[] | null>(
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
  const getDiscWorldRadius = useCallback(
    (
      origin: Cartesian3,
      planeNormal: Cartesian3,
      configuredWorldRadius: number
    ): number => {
      const baseRadius = Math.max(configuredWorldRadius, AXIS_NUMERIC_EPSILON);
      if (!discOutlineFixedScreenSize || !scene || scene.isDestroyed()) {
        return baseRadius;
      }

      const anchorCanvasPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        origin
      );
      if (!defined(anchorCanvasPosition)) {
        return baseRadius;
      }

      const planeBasis = createPlaneBasis(planeNormal);
      const pixelPerWorldMax = getPlanePixelsPerWorldMax(
        scene,
        origin,
        planeBasis,
        anchorCanvasPosition,
        DISC_PROJECTION_SCALE_SAMPLE_COUNT
      );
      if (pixelPerWorldMax <= AXIS_NUMERIC_EPSILON) {
        return baseRadius;
      }

      return Math.max(
        discOutlineScreenPixelRadius / pixelPerWorldMax,
        AXIS_NUMERIC_EPSILON
      );
    },
    [discOutlineFixedScreenSize, discOutlineScreenPixelRadius, scene]
  );

  const getGroundPointWithoutGizmoVisuals = useCallback(
    (clientX: number, clientY: number): Cartesian3 | null => {
      if (!scene || scene.isDestroyed()) return null;

      // Ignore gizmo visuals during depth sampling so snaps never land on
      // axis/disc helper geometry.
      const hiddenVisualizers: Array<{ show: () => void }> = [];
      const hiddenPrimitives: Primitive[] = [];
      const axisVisualizer = axisVisualizerRef.current;
      if (axisVisualizer?.isVisible) {
        axisVisualizer.hide();
        hiddenVisualizers.push(axisVisualizer);
      }
      const discVisualizer = discVisualizerRef.current;
      if (discVisualizer?.show) {
        discVisualizer.show = false;
        hiddenPrimitives.push(discVisualizer);
      }

      try {
        return getGroundPointFromClientPosition(scene, clientX, clientY, {
          ignoreTranslucentDepth: true,
        });
      } finally {
        for (const visualizer of hiddenVisualizers) {
          visualizer.show();
        }
        for (const primitive of hiddenPrimitives) {
          primitive.show = true;
        }
      }
    },
    [scene]
  );
  const getCanvasScreenPosition = useCallback(
    (
      clientX: number,
      clientY: number
    ): CesiumGizmoScreenPosition | undefined => {
      if (!scene || scene.isDestroyed()) {
        return undefined;
      }

      const canvasRect = scene.canvas.getBoundingClientRect();
      return {
        x: clientX - canvasRect.left,
        y: clientY - canvasRect.top,
      };
    },
    [scene]
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
  }, [movePoint]);

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
        : getDefaultAxisCandidatesAtPosition(movePoint.geometryECEF, axisTitle);
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
      axisDirection &&
      Cartesian3.magnitudeSquared(axisDirection) > AXIS_NUMERIC_EPSILON
        ? Cartesian3.normalize(axisDirection, new Cartesian3())
        : null;

    if (normalizedOverride) {
      const matchedByDirection = candidates.find((candidate) => {
        if (
          !candidate.direction ||
          Cartesian3.magnitudeSquared(candidate.direction) <=
            AXIS_NUMERIC_EPSILON
        ) {
          return false;
        }
        const normalizedCandidateDirection = Cartesian3.normalize(
          candidate.direction,
          new Cartesian3()
        );
        return (
          Math.abs(
            Cartesian3.dot(normalizedCandidateDirection, normalizedOverride)
          ) > 0.999
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
  }, [axisCandidates, axisDirection, axisTitle, movePointKey, preferredAxisId]);

  const getAxisCandidatesAtPosition = useCallback(
    (origin: Cartesian3): CesiumMoveGizmoAxisCandidate[] => {
      const configuredCandidates = axisCandidatesRef.current;
      if (!configuredCandidates || configuredCandidates.length === 0) {
        return getDefaultAxisCandidatesAtPosition(origin, axisTitle);
      }

      const normalizedCandidates = configuredCandidates
        .map((candidate): CesiumMoveGizmoAxisCandidate | null => {
          if (
            !candidate.direction ||
            Cartesian3.magnitudeSquared(candidate.direction) <=
              AXIS_NUMERIC_EPSILON
          ) {
            return null;
          }
          return {
            ...candidate,
            direction: Cartesian3.normalize(
              candidate.direction,
              new Cartesian3()
            ),
            color: candidate.color ?? SECONDARY_AXIS_COLOR,
          };
        })
        .filter(
          (candidate): candidate is CesiumMoveGizmoAxisCandidate =>
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
            direction: Cartesian3.normalize(
              rotationState.normal,
              new Cartesian3()
            ),
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
    [axisTitle]
  );

  const getActiveAxisAtPosition = useCallback(
    (origin: Cartesian3): CesiumMoveGizmoAxisCandidate => {
      const candidates = getAxisCandidatesAtPosition(origin);
      if (candidates.length === 0) {
        return {
          id: "vertical",
          direction: getUpVectorAtPosition(origin),
          color: ENU_UP_AXIS_COLOR,
          title: axisTitle ?? DEFAULT_VERTICAL_AXIS_TITLE,
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
        Cartesian3.magnitudeSquared(overrideDirection) > AXIS_NUMERIC_EPSILON
      ) {
        const normalizedOverride = Cartesian3.normalize(
          overrideDirection,
          new Cartesian3()
        );
        const byDirection = candidates.find(
          (candidate) =>
            Math.abs(Cartesian3.dot(candidate.direction, normalizedOverride)) >
            0.999
        );
        if (byDirection) {
          activeAxisIdRef.current = byDirection.id;
          return byDirection;
        }
      }

      activeAxisIdRef.current = candidates[0].id;
      return candidates[0];
    },
    [axisTitle, getAxisCandidatesAtPosition]
  );

  const getDiscPlaneNormalAtPosition = useCallback(
    (origin: Cartesian3) => {
      const configuredDiscPlaneNormal = discPlaneNormalRef.current;
      if (
        configuredDiscPlaneNormal &&
        Cartesian3.magnitudeSquared(configuredDiscPlaneNormal) >
          AXIS_NUMERIC_EPSILON
      ) {
        return Cartesian3.normalize(
          configuredDiscPlaneNormal,
          new Cartesian3()
        );
      }

      return Cartesian3.clone(getActiveAxisAtPosition(origin).direction);
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
      axisCandidateOverride?: CesiumMoveGizmoAxisCandidate
    ) => {
      if (
        !scene ||
        scene.isDestroyed() ||
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
      const axisOrigin = Cartesian3.clone(activePoint.geometryECEF);
      const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(axisOrigin);
      const activeAxisCandidate = axisCandidateOverride
        ? axisCandidatesAtOrigin.find(
            (candidate) => candidate.id === axisCandidateOverride.id
          ) ?? axisCandidateOverride
        : getActiveAxisAtPosition(axisOrigin);
      const axisDirection = Cartesian3.clone(activeAxisCandidate.direction);
      activeAxisIdRef.current = activeAxisCandidate.id;
      if (axisVisualizerRef.current && !scene.isDestroyed()) {
        axisVisualizerRef.current.update(
          axisOrigin,
          axisDirection,
          scene.camera.position
        );
      }
      onAxisDirectionChangeRef.current?.(
        axisDirection,
        activeAxisCandidate.title
      );
      const startAxisParam = getAxisParamFromClientPosition(
        scene,
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
          scene,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragState.axisOrigin,
          dragState.axisDirection
        );
        if (axisParam === null) return;

        const axisDelta = axisParam - dragState.startAxisParam;
        const offsetVector = Cartesian3.multiplyByScalar(
          dragState.axisDirection,
          axisDelta,
          new Cartesian3()
        );
        const nextPosition = Cartesian3.add(
          dragState.axisOrigin,
          offsetVector,
          new Cartesian3()
        );

        onPointPositionChangeRef.current?.(
          dragState.pointId,
          nextPosition,
          getCanvasScreenPosition(
            mouseMoveEvent.clientX,
            mouseMoveEvent.clientY
          )
        );
        scene.requestRender();
      };

      const finishDrag = (suppressSceneClick: boolean) => {
        if (suppressSceneClick) {
          suppressNextSceneClickRef.current = true;
        }
        stopDragging(false);
      };
      const onWindowMouseUp = () => finishDrag(true);
      const onWindowPointerUp = () => finishDrag(true);
      const onWindowBlur = () => finishDrag(false);
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") return;
        finishDrag(false);
      };

      window.addEventListener("mousemove", onWindowMouseMove);
      window.addEventListener("mouseup", onWindowMouseUp);
      window.addEventListener("pointerup", onWindowPointerUp);
      window.addEventListener("blur", onWindowBlur);
      document.addEventListener("visibilitychange", onVisibilityChange);

      dragStateRef.current = {
        mode: "translate",
        pointId: activePoint.id,
        axisOrigin,
        axisDirection,
        startAxisParam,
        cleanupWindowListeners: () => {
          window.removeEventListener("mousemove", onWindowMouseMove);
          window.removeEventListener("mouseup", onWindowMouseUp);
          window.removeEventListener("pointerup", onWindowPointerUp);
          window.removeEventListener("blur", onWindowBlur);
          document.removeEventListener("visibilitychange", onVisibilityChange);
        },
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      scene.requestRender();
    },
    [getActiveAxisAtPosition, scene, stopDragging, getAxisCandidatesAtPosition]
  );

  const startRotating = useCallback(
    (clientX: number, clientY: number) => {
      if (!scene || scene.isDestroyed() || !movePointRef.current) {
        return;
      }

      if (dragStateRef.current || isDraggingRef.current) {
        stopDragging(false);
      }

      axisAnchorDistanceRef.current = {};

      const activePoint = movePointRef.current;
      const axisOrigin = Cartesian3.clone(activePoint.geometryECEF);
      const activeAxisCandidate = getActiveAxisAtPosition(axisOrigin);
      const rotationNormal = Cartesian3.clone(activeAxisCandidate.direction);
      activeAxisIdRef.current = activeAxisCandidate.id;

      const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(axisOrigin);
      const baseDirections: Record<string, Cartesian3> = {};
      axisCandidatesAtOrigin.forEach((candidate) => {
        baseDirections[candidate.id] = Cartesian3.normalize(
          candidate.direction,
          new Cartesian3()
        );
      });
      rotationFrameRef.current = {
        pointId: activePoint.id,
        activeAxisId: activeAxisCandidate.id,
        normal: Cartesian3.normalize(rotationNormal, new Cartesian3()),
        baseDirections,
      };

      const planeBasis = createPlaneBasis(rotationNormal);

      const startPlaneAngleRad = getPlaneAngleFromClientPosition(
        scene,
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
          scene,
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

        // Global rotation direction inversion (requested):
        // keep interaction symmetric and flip output for all camera sides.
        dragStateRef.current.accumulatedDeltaRad -= incrementalDelta;
        const deltaAngleRad = -incrementalDelta;
        const nextAngle =
          dragStateRef.current.baseRotationAngleRad +
          dragStateRef.current.accumulatedDeltaRad;

        rotationStateRef.current = {
          pointId: dragStateRef.current.pointId,
          normal: Cartesian3.clone(dragStateRef.current.rotationNormal),
          angleRad: nextAngle,
        };

        onRotationDeltaRef.current?.({
          pointId: dragStateRef.current.pointId,
          axisOrigin: Cartesian3.clone(dragStateRef.current.axisOrigin),
          rotationNormal: Cartesian3.clone(dragStateRef.current.rotationNormal),
          deltaAngleRad,
          accumulatedAngleRad: dragStateRef.current.accumulatedDeltaRad,
        });

        scene.requestRender();
      };

      const finishRotation = (suppressSceneClick: boolean) => {
        if (suppressSceneClick) {
          suppressNextSceneClickRef.current = true;
        }
        stopDragging(false);
      };

      const onWindowMouseUp = () => finishRotation(true);
      const onWindowPointerUp = () => finishRotation(true);
      const onWindowBlur = () => finishRotation(false);
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") return;
        finishRotation(false);
      };

      window.addEventListener("mousemove", onWindowMouseMove);
      window.addEventListener("mouseup", onWindowMouseUp);
      window.addEventListener("pointerup", onWindowPointerUp);
      window.addEventListener("blur", onWindowBlur);
      document.addEventListener("visibilitychange", onVisibilityChange);

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
        cleanupWindowListeners: () => {
          window.removeEventListener("mousemove", onWindowMouseMove);
          window.removeEventListener("mouseup", onWindowMouseUp);
          window.removeEventListener("pointerup", onWindowPointerUp);
          window.removeEventListener("blur", onWindowBlur);
          document.removeEventListener("visibilitychange", onVisibilityChange);
        },
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      scene.requestRender();
    },
    [getActiveAxisAtPosition, getAxisCandidatesAtPosition, scene, stopDragging]
  );

  const startPlaneDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      options?: { snapToGround?: boolean }
    ) => {
      if (
        !scene ||
        scene.isDestroyed() ||
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
      const planeOrigin = Cartesian3.clone(activePoint.geometryECEF);
      const planeNormal = getDiscPlaneNormalAtPosition(planeOrigin);
      const configuredDiscPlaneNormal = discPlaneNormalRef.current;

      let planeBasisX: Cartesian3;
      let planeBasisY: Cartesian3;
      if (
        configuredDiscPlaneNormal &&
        Cartesian3.magnitudeSquared(configuredDiscPlaneNormal) >
          AXIS_NUMERIC_EPSILON
      ) {
        const planeBasis = createPlaneBasis(planeNormal);
        planeBasisX = planeBasis.xAxis;
        planeBasisY = planeBasis.yAxis;
      } else {
        const activeAxisCandidate = getActiveAxisAtPosition(planeOrigin);
        const axisCandidatesAtOrigin = getAxisCandidatesAtPosition(planeOrigin);
        const nonActiveAxes = axisCandidatesAtOrigin
          .filter((candidate) => candidate.id !== activeAxisCandidate.id)
          .map((candidate) =>
            Cartesian3.normalize(candidate.direction, new Cartesian3())
          );

        if (
          nonActiveAxes.length >= 2 &&
          Cartesian3.magnitudeSquared(
            Cartesian3.cross(
              nonActiveAxes[0],
              nonActiveAxes[1],
              new Cartesian3()
            )
          ) > AXIS_NUMERIC_EPSILON
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
          scene,
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
        startPlanePoint = Cartesian3.clone(planeOrigin);
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
            onPointPositionChangeRef.current?.(
              dragState.pointId,
              nextGroundPoint,
              getCanvasScreenPosition(
                mouseMoveEvent.clientX,
                mouseMoveEvent.clientY
              )
            );
            scene.requestRender();
            return;
          }
        }

        const nextPlanePoint = getPlanePointFromClientPosition(
          scene,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragState.planeOrigin,
          dragState.planeNormal
        );
        if (!nextPlanePoint) return;

        const delta = Cartesian3.subtract(
          nextPlanePoint,
          dragState.startPlanePoint,
          new Cartesian3()
        );
        const deltaX = Cartesian3.dot(delta, dragState.planeBasisX);
        const deltaY = Cartesian3.dot(delta, dragState.planeBasisY);

        const nextPosition = Cartesian3.add(
          dragState.planeOrigin,
          Cartesian3.add(
            Cartesian3.multiplyByScalar(
              dragState.planeBasisX,
              deltaX,
              new Cartesian3()
            ),
            Cartesian3.multiplyByScalar(
              dragState.planeBasisY,
              deltaY,
              new Cartesian3()
            ),
            new Cartesian3()
          ),
          new Cartesian3()
        );

        onPointPositionChangeRef.current?.(
          dragState.pointId,
          nextPosition,
          getCanvasScreenPosition(
            mouseMoveEvent.clientX,
            mouseMoveEvent.clientY
          )
        );
        scene.requestRender();
      };

      const finishDrag = (suppressSceneClick: boolean) => {
        if (suppressSceneClick) {
          suppressNextSceneClickRef.current = true;
        }
        stopDragging(false);
      };
      const onWindowMouseUp = () => finishDrag(true);
      const onWindowPointerUp = () => finishDrag(true);
      const onWindowBlur = () => finishDrag(false);
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") return;
        finishDrag(false);
      };

      window.addEventListener("mousemove", onWindowMouseMove);
      window.addEventListener("mouseup", onWindowMouseUp);
      window.addEventListener("pointerup", onWindowPointerUp);
      window.addEventListener("blur", onWindowBlur);
      document.addEventListener("visibilitychange", onVisibilityChange);

      dragStateRef.current = {
        mode: "plane-translate",
        pointId: activePoint.id,
        planeOrigin,
        planeNormal,
        planeBasisX,
        planeBasisY,
        startPlanePoint,
        cleanupWindowListeners: () => {
          window.removeEventListener("mousemove", onWindowMouseMove);
          window.removeEventListener("mouseup", onWindowMouseUp);
          window.removeEventListener("pointerup", onWindowPointerUp);
          window.removeEventListener("blur", onWindowBlur);
          document.removeEventListener("visibilitychange", onVisibilityChange);
        },
      };

      isDraggingRef.current = true;
      setGlobalDragCursor(restoreGlobalCursorRef, "grabbing");
      onDragStateChangeRef.current?.(true);
      scene.requestRender();
    },
    [
      getActiveAxisAtPosition,
      getAxisCandidatesAtPosition,
      getCanvasScreenPosition,
      getDiscPlaneNormalAtPosition,
      getGroundPointWithoutGizmoVisuals,
      scene,
      stopDragging,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) {
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeRemovePrimitive(scene, discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (removePostRenderListenerRef.current) {
        safeCall(removePostRenderListenerRef.current);
        removePostRenderListenerRef.current = null;
      }
      return;
    }

    // Defensive reset before (re)attach to guarantee at most one axis/disc visualizer pair.
    if (removePostRenderListenerRef.current) {
      safeCall(removePostRenderListenerRef.current);
      removePostRenderListenerRef.current = null;
    }
    if (axisVisualizerRef.current) {
      safeDestroy(axisVisualizerRef.current);
      axisVisualizerRef.current = null;
    }
    if (discVisualizerRef.current) {
      safeRemovePrimitive(scene, discVisualizerRef.current);
      discVisualizerRef.current = null;
    }

    const initialAxisDirection = getActiveAxisAtPosition(
      movePoint.geometryECEF
    ).direction;
    const initialDiscPlaneNormal = getDiscPlaneNormalAtPosition(
      movePoint.geometryECEF
    );
    const visualizer = createRotationAxisVisualizer(
      `point-move-axis-${movePoint.id}`,
      {
        origin: movePoint.geometryECEF,
        upVector: initialAxisDirection,
        cameraPosition: scene.camera.position,
        lengthMultiplier: 2,
        dashPixelLength: 5,
        gapPixelLength: 3,
        color: Color.WHITE,
        width: resolvedAxisWidthPx,
      }
    );
    visualizer.attach(scene, () => scene.requestRender());
    axisVisualizerRef.current = visualizer;

    if (showDisc) {
      const initialDiscRadius = getDiscWorldRadius(
        movePoint.geometryECEF,
        initialDiscPlaneNormal,
        radiusRef.current
      );
      const disc = createRing(`point-move-disc-${movePoint.id}`, {
        radius: 1,
        innerRadius: 0.5,
        color: DISC_FILL_COLOR,
        segments: 24,
        modelMatrix: createOrientedDiscModelMatrix(
          movePoint.geometryECEF,
          initialDiscPlaneNormal,
          initialDiscRadius
        ),
      });
      scene.primitives.add(disc);
      discVisualizerRef.current = disc;
    }

    const removePostRenderListener = scene.postRender.addEventListener(() => {
      try {
        const currentPoint = movePointRef.current;
        const axisVisualizer = axisVisualizerRef.current;
        if (!currentPoint || !axisVisualizer || scene.isDestroyed()) {
          return;
        }

        const axisDirection = getActiveAxisAtPosition(
          currentPoint.geometryECEF
        ).direction;
        const discPlaneNormal = getDiscPlaneNormalAtPosition(
          currentPoint.geometryECEF
        );
        axisVisualizer.update(
          currentPoint.geometryECEF,
          axisDirection,
          scene.camera.position
        );

        const discVisualizer = discVisualizerRef.current;
        if (discVisualizer) {
          const discWorldRadius = getDiscWorldRadius(
            currentPoint.geometryECEF,
            discPlaneNormal,
            radiusRef.current
          );
          discVisualizer.modelMatrix = createOrientedDiscModelMatrix(
            currentPoint.geometryECEF,
            discPlaneNormal,
            discWorldRadius,
            discVisualizer.modelMatrix
          );
        }
      } catch {
        // Ignore postRender races during teardown.
      }
    });
    removePostRenderListenerRef.current = removePostRenderListener;

    scene.requestRender();

    return () => {
      if (removePostRenderListenerRef.current) {
        safeCall(removePostRenderListenerRef.current);
        removePostRenderListenerRef.current = null;
      }
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeRemovePrimitive(scene, discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    getDiscPlaneNormalAtPosition,
    resolvedAxisWidthPx,
    getActiveAxisAtPosition,
    getDiscWorldRadius,
    movePoint?.id,
    scene,
    showDisc,
  ]);

  const handleAxisMouseDown = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      axisCandidate?: CesiumMoveGizmoAxisCandidate
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
    const unitDirectionsByAxisId: Record<DefaultAxisId, Cartesian3> = {
      vertical: Cartesian3.UNIT_Z,
      "horizontal-east": Cartesian3.UNIT_X,
      "horizontal-north": Cartesian3.UNIT_Y,
    };

    return getDefaultAxisPresentation(axisTitle).map((axisDefinition) => ({
      id: axisDefinition.id,
      direction: unitDirectionsByAxisId[axisDefinition.id],
      color: axisDefinition.color,
      title: axisDefinition.title,
    })) as CesiumMoveGizmoAxisCandidate[];
  }, [axisCandidates, axisTitle]);

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
              title:
                axisCandidate.title ?? "Punkt entlang der Achse verschieben",
            },
            createElement("path", {
              d: getEquilateralTrianglePathD(arrowActiveEdgePx),
              fill: "currentColor",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              paintOrder: "stroke",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
            })
          ),
          createElement(
            "svg",
            {
              key: `${axisCandidate.id}-arrow-down`,
              "data-point-move-axis-arrow-down": axisCandidate.id,
              onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
                handleAxisMouseDown(event, axisCandidate),
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
              title:
                axisCandidate.title ?? "Punkt entlang der Achse verschieben",
            },
            createElement("path", {
              d: getEquilateralTrianglePathD(arrowActiveEdgePx),
              fill: "currentColor",
              stroke: "rgba(255, 255, 255, 0.95)",
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              paintOrder: "stroke",
              vectorEffect: "non-scaling-stroke",
              shapeRendering: "geometricPrecision",
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
          createElement("path", {
            key: "disc-interaction-path",
            "data-point-move-disc-interaction-path": "true",
            d: "",
            onMouseDown: handleDiscPlaneMouseDown,
            fill: "rgba(255,255,255,0.001)",
            stroke: "none",
            style: {
              display: "none",
              pointerEvents: "auto",
              cursor: PLANE_DRAG_DISC_CURSOR,
            },
          }),
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
          title: snapPlaneDragToGround
            ? "Punkt auf Bodenhöhe verschieben"
            : "Punkt in der Ebene verschieben",
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
      overlayAxisCandidates,
      centerPlaneDragCursor,
      showRotationHandle,
      snapPlaneDragToGround,
      startPlaneDragging,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      return;
    }

    // Ensure a hard replace when this effect reruns so stale duplicate DOM cannot accumulate.
    removeLabelOverlayElement(OVERLAY_HANDLE_ID);

    addLabelOverlayElement({
      id: OVERLAY_HANDLE_ID,
      zIndex: MOVE_GIZMO_OVERLAY_Z_INDEX,
      content: handleContent,
      updatePosition: (elementDiv) => {
        try {
          const activePoint = movePointRef.current;
          if (!activePoint || scene.isDestroyed()) return false;

          const anchorCanvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            activePoint.geometryECEF
          );
          if (!defined(anchorCanvasPosition)) return false;

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
              planeBasisX?: Cartesian3;
              planeBasisY?: Cartesian3;
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
                DISC_OUTLINE_SEGMENTS
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

            const planeBasis = createPlaneBasis(
              configuredDiscPlaneNormal &&
                Cartesian3.magnitudeSquared(configuredDiscPlaneNormal) >
                  AXIS_NUMERIC_EPSILON
                ? activeDiscPlaneNormal
                : planeCandidate.direction
            );
            let discWorldRadius = Math.max(radius, AXIS_NUMERIC_EPSILON);

            if (discOutlineFixedScreenSize) {
              const pixelPerWorldMax = getPlanePixelsPerWorldMax(
                scene,
                activePoint.geometryECEF,
                planeBasis,
                anchorCanvasPosition,
                DISC_PROJECTION_SCALE_SAMPLE_COUNT
              );

              if (pixelPerWorldMax > AXIS_NUMERIC_EPSILON) {
                discWorldRadius = Math.max(
                  discOutlineScreenPixelRadius / pixelPerWorldMax,
                  AXIS_NUMERIC_EPSILON
                );
              }
            }

            if (!Number.isFinite(discWorldRadius) || discWorldRadius <= 0) {
              showFallbackCenteredCircle();
              return;
            }

            const projectedOutlinePoints = projectPlaneOutlinePoints(
              scene,
              activePoint.geometryECEF,
              planeBasis,
              discWorldRadius,
              DISC_OUTLINE_SEGMENTS,
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
                  const projectedX = Cartesian3.dot(
                    primaryInPlaneAxis,
                    activeOutline.planeBasisX
                  );
                  const projectedY = Cartesian3.dot(
                    primaryInPlaneAxis,
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
                const worldHandlePoint = Cartesian3.add(
                  activePoint.geometryECEF,
                  Cartesian3.add(
                    Cartesian3.multiplyByScalar(
                      activeOutline.planeBasisX,
                      handleDirX * activeOutline.worldRadius,
                      new Cartesian3()
                    ),
                    Cartesian3.multiplyByScalar(
                      activeOutline.planeBasisY,
                      handleDirY * activeOutline.worldRadius,
                      new Cartesian3()
                    ),
                    new Cartesian3()
                  ),
                  new Cartesian3()
                );
                const projectedHandlePoint =
                  SceneTransforms.worldToWindowCoordinates(
                    scene,
                    worldHandlePoint
                  );
                if (defined(projectedHandlePoint)) {
                  handleX = projectedHandlePoint.x - anchorCanvasPosition.x;
                  handleY = projectedHandlePoint.y - anchorCanvasPosition.y;
                }
              }

              const activeNormal = Cartesian3.normalize(
                configuredDiscPlaneNormal &&
                  Cartesian3.magnitudeSquared(configuredDiscPlaneNormal) >
                    AXIS_NUMERIC_EPSILON
                  ? activeDiscPlaneNormal
                  : activeAxisCandidateAtPoint?.direction ??
                      getUpVectorAtPosition(activePoint.geometryECEF),
                new Cartesian3()
              );
              const toCamera = Cartesian3.normalize(
                Cartesian3.subtract(
                  scene.camera.position,
                  activePoint.geometryECEF,
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              const facingFactor = Math.abs(
                Cartesian3.dot(activeNormal, toCamera)
              );
              const minorRadius = Math.max(
                ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
                ROTATION_HANDLE_RADIUS_PX * facingFactor
              );

              const normalTipWorld = Cartesian3.add(
                activePoint.geometryECEF,
                Cartesian3.multiplyByScalar(
                  activeNormal,
                  ROTATION_NORMAL_SCREEN_SAMPLE_WORLD,
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              const normalTipCanvas = SceneTransforms.worldToWindowCoordinates(
                scene,
                normalTipWorld
              );
              let ellipseRotationDeg = 0;
              if (defined(normalTipCanvas)) {
                const normalDx = normalTipCanvas.x - anchorCanvasPosition.x;
                const normalDy = normalTipCanvas.y - anchorCanvasPosition.y;
                if (Math.hypot(normalDx, normalDy) > AXIS_NUMERIC_EPSILON) {
                  const normalAngleRad = Math.atan2(normalDy, normalDx);
                  ellipseRotationDeg =
                    ((normalAngleRad - Math.PI / 2) * 180) / Math.PI;
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

            const unitAxisSampleWorld = Cartesian3.add(
              activePoint.geometryECEF,
              axisCandidate.direction,
              new Cartesian3()
            );
            const unitAxisSampleCanvas =
              SceneTransforms.worldToWindowCoordinates(
                scene,
                unitAxisSampleWorld
              );

            const unitSamplePixels = defined(unitAxisSampleCanvas)
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
              const plusWorld = Cartesian3.add(
                activePoint.geometryECEF,
                Cartesian3.multiplyByScalar(
                  axisCandidate.direction,
                  sampleWorldStep,
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              const minusWorld = Cartesian3.add(
                activePoint.geometryECEF,
                Cartesian3.multiplyByScalar(
                  axisCandidate.direction,
                  -sampleWorldStep,
                  new Cartesian3()
                ),
                new Cartesian3()
              );

              const plusCanvas = SceneTransforms.worldToWindowCoordinates(
                scene,
                plusWorld
              );
              const minusCanvas = SceneTransforms.worldToWindowCoordinates(
                scene,
                minusWorld
              );

              let dx = 0;
              let dy = 0;
              if (defined(plusCanvas) && defined(minusCanvas)) {
                dx = plusCanvas.x - minusCanvas.x;
                dy = plusCanvas.y - minusCanvas.y;
              } else if (defined(plusCanvas)) {
                dx = plusCanvas.x - anchorCanvasPosition.x;
                dy = plusCanvas.y - anchorCanvasPosition.y;
              } else if (defined(minusCanvas)) {
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
            const arrowEdgePx = isActiveAxis
              ? Math.max(1, arrowActiveEdgePx)
              : Math.max(1, arrowInactiveEdgePx);
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
              } else {
                const activeOutline =
                  projectedOutlinesByAxisId.get(activeAxisId);
                if (activeOutline) {
                  supportDistance = activeOutline.supportRadius;
                }
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
                axisArrowUp.querySelector("path") as SVGPathElement | null,
                arrowEdgePx
              );
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
                axisArrowDown.querySelector("path") as SVGPathElement | null,
                arrowEdgePx
              );
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

          return true;
        } catch {
          // Overlay refresh can race with scene/widget teardown.
          return false;
        }
      },
      visible: true,
      isHidden: false,
    });

    return () => {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
    };
  }, [
    addLabelOverlayElement,
    handleContent,
    movePoint?.id,
    axisArrowOffsetPx,
    removeLabelOverlayElement,
    scene,
    getAxisCandidatesAtPosition,
    radius,
    discOutlineFixedScreenSize,
    discOutlineScreenPixelRadius,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    showDisc,
  ]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) return;

    const sceneHandler = new ScreenSpaceEventHandler(scene.canvas);
    sceneHandler.setInputAction(() => {
      if (suppressNextSceneClickRef.current) {
        suppressNextSceneClickRef.current = false;
        return;
      }
      if (isDraggingRef.current) return;
      onExitRef.current?.();
    }, ScreenSpaceEventType.LEFT_CLICK);

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      stopDragging(false);
      onExitRef.current?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      sceneHandler.destroy();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [movePoint?.id, scene, stopDragging]);

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
      restoreGlobalDragCursor(restoreGlobalCursorRef);
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      if (axisVisualizerRef.current) {
        safeDestroy(axisVisualizerRef.current);
        axisVisualizerRef.current = null;
      }
      if (discVisualizerRef.current) {
        safeRemovePrimitive(scene, discVisualizerRef.current);
        discVisualizerRef.current = null;
      }
      if (removePostRenderListenerRef.current) {
        safeCall(removePostRenderListenerRef.current);
        removePostRenderListenerRef.current = null;
      }
    },
    [removeLabelOverlayElement, scene, stopDragging]
  );
};

export default useCesiumPointMoveGizmo;
