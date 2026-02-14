import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  defined,
  type Scene,
} from "@carma/cesium";
import {
  createRotationAxisVisualizer,
  type RotationAxisVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import { type PointMeasurementEntry } from "../types/MeasurementTypes";

type CesiumRayLike = {
  origin: Cartesian3;
  direction: Cartesian3;
};

type AxisDragState = {
  pointId: string;
  axisOrigin: Cartesian3;
  axisDirection: Cartesian3;
  axisId: string;
  startAxisParam: number;
  cleanupWindowListeners: () => void;
};

type MoveGizmoAxisCandidate = {
  id: string;
  direction: Cartesian3;
  color?: string;
  title?: string | null;
};

export type UseCesiumPointMoveGizmoOptions = {
  points: PointMeasurementEntry[];
  movePointId?: string | null;
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  axisCandidates?: MoveGizmoAxisCandidate[] | null;
  radius: number;
  onPointPositionChange?: (pointId: string, nextPosition: Cartesian3) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisDirectionChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  onExit?: () => void;
};

const OVERLAY_HANDLE_ID = "point-move-u-handle";
const MOVE_GIZMO_OVERLAY_Z_INDEX = 30;
const AXIS_NUMERIC_EPSILON = 1e-6;
const ENU_UP_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
const ENU_EAST_AXIS_COLOR = "rgba(239, 68, 68, 0.98)";
const ENU_NORTH_AXIS_COLOR = "rgba(34, 197, 94, 0.98)";
const SECONDARY_AXIS_COLOR = "rgba(148, 163, 184, 0.98)";
const LABEL_LINE_WIDTH_PX = 1;
const INACTIVE_AXIS_OPACITY = 0.75;
const INACTIVE_AXIS_LINE_SCALE = 0.9;
const INACTIVE_AXIS_ARROW_SCALE = 0.74;
const INACTIVE_AXIS_STEM_SCALE = 0.86;
const INACTIVE_AXIS_ARROW_OFFSET_SCALE = 1.28;

const getUpVectorAtPosition = (origin: Cartesian3): Cartesian3 => {
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(origin);
  const upAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());
  return Cartesian3.normalize(
    new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
    new Cartesian3()
  );
};

const getDefaultAxisCandidatesAtPosition = (
  origin: Cartesian3,
  axisTitle?: string | null
): MoveGizmoAxisCandidate[] => {
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(origin);
  const eastAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 0, new Cartesian4());
  const northAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 1, new Cartesian4());
  const upAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());

  const eastDirection = Cartesian3.normalize(
    new Cartesian3(eastAxis4.x, eastAxis4.y, eastAxis4.z),
    new Cartesian3()
  );
  const northDirection = Cartesian3.normalize(
    new Cartesian3(northAxis4.x, northAxis4.y, northAxis4.z),
    new Cartesian3()
  );
  const upDirection = Cartesian3.normalize(
    new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
    new Cartesian3()
  );

  return [
    {
      id: "vertical",
      direction: upDirection,
      color: ENU_UP_AXIS_COLOR,
      title: axisTitle ?? "Punkt entlang der U-Achse verschieben",
    },
    {
      id: "horizontal-east",
      direction: eastDirection,
      color: ENU_EAST_AXIS_COLOR,
      title: "Punkt entlang der E-Achse verschieben",
    },
    {
      id: "horizontal-north",
      direction: northDirection,
      color: ENU_NORTH_AXIS_COLOR,
      title: "Punkt entlang der N-Achse verschieben",
    },
  ];
};

const getClosestAxisParamToRay = (
  ray: CesiumRayLike,
  axisOrigin: Cartesian3,
  axisDirection: Cartesian3
): number => {
  const rayDirection = Cartesian3.normalize(ray.direction, new Cartesian3());
  const normalizedAxisDirection = Cartesian3.normalize(
    axisDirection,
    new Cartesian3()
  );
  const originDelta = Cartesian3.subtract(
    ray.origin,
    axisOrigin,
    new Cartesian3()
  );

  const a = Cartesian3.dot(rayDirection, rayDirection);
  const b = Cartesian3.dot(rayDirection, normalizedAxisDirection);
  const c = Cartesian3.dot(normalizedAxisDirection, normalizedAxisDirection);
  const d = Cartesian3.dot(rayDirection, originDelta);
  const e = Cartesian3.dot(normalizedAxisDirection, originDelta);
  const denominator = a * c - b * b;

  if (Math.abs(denominator) < AXIS_NUMERIC_EPSILON) {
    return e;
  }

  return (a * e - b * d) / denominator;
};

const getAxisParamFromClientPosition = (
  scene: Scene,
  clientX: number,
  clientY: number,
  axisOrigin: Cartesian3,
  axisDirection: Cartesian3
): number | null => {
  if (scene.isDestroyed()) return null;
  const canvasRect = scene.canvas.getBoundingClientRect();
  const windowPosition = new Cartesian2(
    clientX - canvasRect.left,
    clientY - canvasRect.top
  );
  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return null;
  return getClosestAxisParamToRay(ray, axisOrigin, axisDirection);
};

export const useCesiumPointMoveGizmo = (
  scene: Scene | null,
  {
    points,
    movePointId = null,
    axisDirection = null,
    axisTitle = null,
    axisCandidates = null,
    radius,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange,
    onExit,
  }: UseCesiumPointMoveGizmoOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const axisVisualizerRef = useRef<RotationAxisVisualizer | null>(null);
  const removePostRenderListenerRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<AxisDragState | null>(null);
  const isDraggingRef = useRef(false);
  const suppressNextSceneClickRef = useRef(false);
  const movePointRef = useRef<PointMeasurementEntry | null>(null);
  const axisDirectionRef = useRef<Cartesian3 | null>(axisDirection);
  const axisCandidatesRef = useRef<MoveGizmoAxisCandidate[] | null>(
    axisCandidates
  );
  const activeAxisIdRef = useRef<string>("vertical");

  const movePoint = useMemo(
    () =>
      movePointId
        ? points.find((point) => point.id === movePointId) ?? null
        : null,
    [points, movePointId]
  );

  useEffect(() => {
    movePointRef.current = movePoint;
  }, [movePoint]);

  useEffect(() => {
    axisDirectionRef.current = axisDirection;
  }, [axisDirection]);

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

    activeAxisIdRef.current = candidates[0].id;
  }, [axisCandidates, axisDirection, axisTitle, movePoint]);

  const getAxisCandidatesAtPosition = useCallback(
    (origin: Cartesian3): MoveGizmoAxisCandidate[] => {
      const configuredCandidates = axisCandidatesRef.current;
      if (!configuredCandidates || configuredCandidates.length === 0) {
        return getDefaultAxisCandidatesAtPosition(origin, axisTitle);
      }

      return configuredCandidates
        .map((candidate): MoveGizmoAxisCandidate | null => {
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
          (candidate): candidate is MoveGizmoAxisCandidate => candidate !== null
        );
    },
    [axisTitle]
  );

  const getActiveAxisAtPosition = useCallback(
    (origin: Cartesian3): MoveGizmoAxisCandidate => {
      const candidates = getAxisCandidatesAtPosition(origin);
      if (candidates.length === 0) {
        return {
          id: "vertical",
          direction: getUpVectorAtPosition(origin),
          color: ENU_UP_AXIS_COLOR,
          title: axisTitle ?? "Punkt entlang der U-Achse verschieben",
        };
      }

      const byId = candidates.find(
        (candidate) => candidate.id === activeAxisIdRef.current
      );
      if (byId) return byId;

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

  const stopDragging = useCallback(
    (exitMoveMode: boolean) => {
      if (dragStateRef.current) {
        dragStateRef.current.cleanupWindowListeners();
        dragStateRef.current = null;
      }

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragStateChange?.(false);
      }

      if (exitMoveMode) {
        onExit?.();
      }
    },
    [onDragStateChange, onExit]
  );

  const startDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      axisCandidateOverride?: MoveGizmoAxisCandidate
    ) => {
      if (
        !scene ||
        scene.isDestroyed() ||
        !movePointRef.current ||
        !onPointPositionChange
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
      onAxisDirectionChange?.(axisDirection, activeAxisCandidate.title);
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
        if (!dragStateRef.current || !movePointRef.current) return;

        const axisParam = getAxisParamFromClientPosition(
          scene,
          mouseMoveEvent.clientX,
          mouseMoveEvent.clientY,
          dragStateRef.current.axisOrigin,
          dragStateRef.current.axisDirection
        );
        if (axisParam === null) return;

        const axisDelta = axisParam - dragStateRef.current.startAxisParam;
        const offsetVector = Cartesian3.multiplyByScalar(
          dragStateRef.current.axisDirection,
          axisDelta,
          new Cartesian3()
        );
        const nextPosition = Cartesian3.add(
          dragStateRef.current.axisOrigin,
          offsetVector,
          new Cartesian3()
        );

        onPointPositionChange(dragStateRef.current.pointId, nextPosition);
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
        pointId: activePoint.id,
        axisOrigin,
        axisDirection,
        axisId: activeAxisCandidate.id,
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
      onDragStateChange?.(true);
      scene.requestRender();
    },
    [
      getActiveAxisAtPosition,
      onAxisDirectionChange,
      onDragStateChange,
      onPointPositionChange,
      scene,
      stopDragging,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) {
      if (axisVisualizerRef.current) {
        axisVisualizerRef.current.destroy();
        axisVisualizerRef.current = null;
      }
      if (removePostRenderListenerRef.current) {
        removePostRenderListenerRef.current();
        removePostRenderListenerRef.current = null;
      }
      return;
    }

    const initialAxisDirection = getActiveAxisAtPosition(
      movePoint.geometryECEF
    ).direction;
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
        width: 1,
      }
    );
    visualizer.attach(scene, () => scene.requestRender());
    axisVisualizerRef.current = visualizer;

    const removePostRenderListener = scene.postRender.addEventListener(() => {
      const currentPoint = movePointRef.current;
      if (!currentPoint || !axisVisualizerRef.current || scene.isDestroyed()) {
        return;
      }

      const axisDirection = getActiveAxisAtPosition(
        currentPoint.geometryECEF
      ).direction;
      axisVisualizerRef.current.update(
        currentPoint.geometryECEF,
        axisDirection,
        scene.camera.position
      );
    });
    removePostRenderListenerRef.current = removePostRenderListener;

    scene.requestRender();

    return () => {
      if (removePostRenderListenerRef.current) {
        removePostRenderListenerRef.current();
        removePostRenderListenerRef.current = null;
      }
      if (axisVisualizerRef.current) {
        axisVisualizerRef.current.destroy();
        axisVisualizerRef.current = null;
      }
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [getActiveAxisAtPosition, movePoint?.id, scene]);

  const handleAxisMouseDown = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      axisCandidate?: MoveGizmoAxisCandidate
    ) => {
      event.preventDefault();
      event.stopPropagation();
      startDragging(event.clientX, event.clientY, axisCandidate);
    },
    [startDragging]
  );
  const axisUiLengthPx = useMemo(
    () => Math.min(108, Math.max(72, radius * 16)),
    [radius]
  );
  const axisArrowOffsetPx = Math.max(26, Math.round(axisUiLengthPx * 0.42));
  const axisUiLineLengthPx = axisArrowOffsetPx * 2;
  const axisArrowStemLengthPx = 10;
  const axisArrowStemOffsetPx = Math.max(
    10,
    axisArrowOffsetPx - axisArrowStemLengthPx / 2
  );
  const centerDragHitAreaPx = 40;
  const overlayAxisCandidates = useMemo(() => {
    if (axisCandidates && axisCandidates.length > 0) {
      return axisCandidates.map((candidate) => ({
        ...candidate,
        color: candidate.color ?? SECONDARY_AXIS_COLOR,
      }));
    }
    return [
      {
        id: "vertical",
        direction: Cartesian3.UNIT_Z,
        color: ENU_UP_AXIS_COLOR,
        title: axisTitle ?? "Punkt entlang der U-Achse verschieben",
      },
      {
        id: "horizontal-east",
        direction: Cartesian3.UNIT_X,
        color: ENU_EAST_AXIS_COLOR,
        title: "Punkt entlang der E-Achse verschieben",
      },
      {
        id: "horizontal-north",
        direction: Cartesian3.UNIT_Y,
        color: ENU_NORTH_AXIS_COLOR,
        title: "Punkt entlang der N-Achse verschieben",
      },
    ] as MoveGizmoAxisCandidate[];
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
              width: `${axisUiLineLengthPx}px`,
              height: "2px",
              background:
                "repeating-linear-gradient(to right, rgba(255,255,255,0.95) 0 8px, rgba(255,255,255,0) 8px 13px)",
              opacity: 0.95,
              zIndex: 0,
              pointerEvents: "none",
            },
          }),
          createElement("div", {
            key: `${axisCandidate.id}-stem-up`,
            "data-point-move-axis-stem-up": axisCandidate.id,
            style: {
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${axisArrowStemLengthPx}px`,
              height: "2px",
              borderRadius: "2px",
              background: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
              transform: "translate(-50%, -50%)",
              zIndex: 1,
              pointerEvents: "none",
            },
          }),
          createElement("div", {
            key: `${axisCandidate.id}-stem-down`,
            "data-point-move-axis-stem-down": axisCandidate.id,
            style: {
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${axisArrowStemLengthPx}px`,
              height: "2px",
              borderRadius: "2px",
              background: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
              transform: "translate(-50%, -50%)",
              zIndex: 1,
              pointerEvents: "none",
            },
          }),
          createElement(
            "div",
            {
              key: `${axisCandidate.id}-arrow-up`,
              "data-point-move-axis-arrow-up": axisCandidate.id,
              onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
                handleAxisMouseDown(event, axisCandidate),
              style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
                fontSize: "18px",
                fontWeight: 700,
                lineHeight: 1,
                WebkitTextStroke: `${LABEL_LINE_WIDTH_PX}px rgba(255, 255, 255, 0.95)`,
                textShadow: "none",
                zIndex: 2,
                pointerEvents: "auto",
                cursor: "move",
                userSelect: "none",
              },
              title:
                axisCandidate.title ?? "Punkt entlang der Achse verschieben",
            },
            "▲"
          ),
          createElement(
            "div",
            {
              key: `${axisCandidate.id}-arrow-down`,
              "data-point-move-axis-arrow-down": axisCandidate.id,
              onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
                handleAxisMouseDown(event, axisCandidate),
              style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
                fontSize: "18px",
                fontWeight: 700,
                lineHeight: 1,
                WebkitTextStroke: `${LABEL_LINE_WIDTH_PX}px rgba(255, 255, 255, 0.95)`,
                textShadow: "none",
                zIndex: 2,
                pointerEvents: "auto",
                cursor: "move",
                userSelect: "none",
              },
              title:
                axisCandidate.title ?? "Punkt entlang der Achse verschieben",
            },
            "▼"
          ),
        ]),
        createElement("div", {
          "data-point-move-axis-center-hit": "true",
          onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
            handleAxisMouseDown(event),
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: `${centerDragHitAreaPx}px`,
            height: `${centerDragHitAreaPx}px`,
            borderRadius: "50%",
            background: "transparent",
            zIndex: 1,
            pointerEvents: "auto",
            cursor: "move",
            userSelect: "none",
          },
          title: axisTitle ?? "Punkt entlang der Achse verschieben",
        })
      ),
    [
      axisCandidates,
      axisUiLengthPx,
      axisUiLineLengthPx,
      axisArrowStemLengthPx,
      axisTitle,
      centerDragHitAreaPx,
      handleAxisMouseDown,
      overlayAxisCandidates,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      return;
    }

    addLabelOverlayElement({
      id: OVERLAY_HANDLE_ID,
      zIndex: MOVE_GIZMO_OVERLAY_Z_INDEX,
      content: handleContent,
      updatePosition: (elementDiv) => {
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
        const axisTipOffset = Math.max(radius * 4, 2);

        elementDiv.style.position = "absolute";
        elementDiv.style.left = `${anchorCanvasPosition.x}px`;
        elementDiv.style.top = `${anchorCanvasPosition.y}px`;
        elementDiv.style.transform = "translate(-50%, -50%)";
        elementDiv.style.zIndex = `${MOVE_GIZMO_OVERLAY_Z_INDEX}`;
        elementDiv.style.pointerEvents = "none";
        elementDiv.style.display = "block";

        axisCandidatesAtPoint.forEach((axisCandidate) => {
          const axisTipPosition = Cartesian3.add(
            activePoint.geometryECEF,
            Cartesian3.multiplyByScalar(
              axisCandidate.direction,
              axisTipOffset,
              new Cartesian3()
            ),
            new Cartesian3()
          );
          const axisTipCanvasPosition =
            SceneTransforms.worldToWindowCoordinates(scene, axisTipPosition);

          let axisAngleRad = -Math.PI / 2;
          let axisDirX = 0;
          let axisDirY = -1;
          if (defined(axisTipCanvasPosition)) {
            const dx = axisTipCanvasPosition.x - anchorCanvasPosition.x;
            const dy = axisTipCanvasPosition.y - anchorCanvasPosition.y;
            const vectorLength = Math.hypot(dx, dy);
            if (vectorLength > 0.001) {
              axisAngleRad = Math.atan2(dy, dx);
              axisDirX = dx / vectorLength;
              axisDirY = dy / vectorLength;
            }
          }

          const isActiveAxis = activeAxisIdRef.current === axisCandidate.id;
          const axisOpacity = isActiveAxis ? 1 : INACTIVE_AXIS_OPACITY;
          const lineScale = isActiveAxis ? 1 : INACTIVE_AXIS_LINE_SCALE;
          const arrowScale = isActiveAxis ? 1 : INACTIVE_AXIS_ARROW_SCALE;
          const stemScale = isActiveAxis ? 1 : INACTIVE_AXIS_STEM_SCALE;
          const arrowOffsetPx = isActiveAxis
            ? axisArrowOffsetPx
            : axisArrowOffsetPx * INACTIVE_AXIS_ARROW_OFFSET_SCALE;
          const stemOffsetPx = Math.max(
            10,
            arrowOffsetPx - axisArrowStemLengthPx / 2
          );

          const axisLine = elementDiv.querySelector(
            `[data-point-move-axis-line="${axisCandidate.id}"]`
          ) as HTMLElement | null;
          if (axisLine) {
            axisLine.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad) scale(${lineScale})`;
            axisLine.style.opacity = `${axisOpacity}`;
          }

          const axisArrowUp = elementDiv.querySelector(
            `[data-point-move-axis-arrow-up="${axisCandidate.id}"]`
          ) as HTMLElement | null;
          if (axisArrowUp) {
            axisArrowUp.style.left = `calc(50% + ${
              axisDirX * arrowOffsetPx
            }px)`;
            axisArrowUp.style.top = `calc(50% + ${axisDirY * arrowOffsetPx}px)`;
            axisArrowUp.style.transform = `translate(-50%, -50%) rotate(${
              axisAngleRad + Math.PI / 2
            }rad) scale(${arrowScale})`;
            axisArrowUp.style.opacity = `${axisOpacity}`;
          }

          const axisStemUp = elementDiv.querySelector(
            `[data-point-move-axis-stem-up="${axisCandidate.id}"]`
          ) as HTMLElement | null;
          if (axisStemUp) {
            axisStemUp.style.left = `calc(50% + ${axisDirX * stemOffsetPx}px)`;
            axisStemUp.style.top = `calc(50% + ${axisDirY * stemOffsetPx}px)`;
            axisStemUp.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad) scale(${stemScale})`;
            axisStemUp.style.opacity = `${axisOpacity}`;
          }

          const axisArrowDown = elementDiv.querySelector(
            `[data-point-move-axis-arrow-down="${axisCandidate.id}"]`
          ) as HTMLElement | null;
          if (axisArrowDown) {
            axisArrowDown.style.left = `calc(50% + ${
              -axisDirX * arrowOffsetPx
            }px)`;
            axisArrowDown.style.top = `calc(50% + ${
              -axisDirY * arrowOffsetPx
            }px)`;
            axisArrowDown.style.transform = `translate(-50%, -50%) rotate(${
              axisAngleRad + Math.PI / 2
            }rad) scale(${arrowScale})`;
            axisArrowDown.style.opacity = `${axisOpacity}`;
          }

          const axisStemDown = elementDiv.querySelector(
            `[data-point-move-axis-stem-down="${axisCandidate.id}"]`
          ) as HTMLElement | null;
          if (axisStemDown) {
            axisStemDown.style.left = `calc(50% + ${
              -axisDirX * stemOffsetPx
            }px)`;
            axisStemDown.style.top = `calc(50% + ${
              -axisDirY * stemOffsetPx
            }px)`;
            axisStemDown.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad) scale(${stemScale})`;
            axisStemDown.style.opacity = `${axisOpacity}`;
          }
        });

        return true;
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
    axisArrowStemOffsetPx,
    removeLabelOverlayElement,
    scene,
    getAxisCandidatesAtPosition,
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
      onExit?.();
    }, ScreenSpaceEventType.LEFT_CLICK);

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      stopDragging(false);
      onExit?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      sceneHandler.destroy();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [movePoint?.id, onExit, scene, stopDragging]);

  useEffect(() => {
    if (movePoint) return;
    stopDragging(false);
    removeLabelOverlayElement(OVERLAY_HANDLE_ID);
  }, [movePoint, removeLabelOverlayElement, stopDragging]);

  useEffect(
    () => () => {
      stopDragging(false);
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      if (axisVisualizerRef.current) {
        axisVisualizerRef.current.destroy();
        axisVisualizerRef.current = null;
      }
      if (removePostRenderListenerRef.current) {
        removePostRenderListenerRef.current();
        removePostRenderListenerRef.current = null;
      }
    },
    [removeLabelOverlayElement, stopDragging]
  );
};

export default useCesiumPointMoveGizmo;
