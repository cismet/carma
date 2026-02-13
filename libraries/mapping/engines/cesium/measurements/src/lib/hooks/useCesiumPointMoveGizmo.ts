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
  startAxisParam: number;
  cleanupWindowListeners: () => void;
};

export type UseCesiumPointMoveGizmoOptions = {
  points: PointMeasurementEntry[];
  movePointId?: string | null;
  radius: number;
  onPointPositionChange?: (pointId: string, nextPosition: Cartesian3) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onExit?: () => void;
};

const OVERLAY_HANDLE_ID = "point-move-u-handle";
const AXIS_NUMERIC_EPSILON = 1e-6;
const NOOP = () => undefined;
const ENU_UP_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
const LABEL_LINE_WIDTH_PX = 1;

const getUpVectorAtPosition = (origin: Cartesian3): Cartesian3 => {
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(origin);
  const upAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());
  return Cartesian3.normalize(
    new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
    new Cartesian3()
  );
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
    radius,
    onPointPositionChange,
    onDragStateChange,
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
  const previousCameraInputStateRef = useRef<boolean | null>(null);

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

  const restoreCameraInputs = useCallback(() => {
    if (!scene || scene.isDestroyed()) return;
    if (previousCameraInputStateRef.current === null) return;
    scene.screenSpaceCameraController.enableInputs =
      previousCameraInputStateRef.current;
    previousCameraInputStateRef.current = null;
  }, [scene]);

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

      restoreCameraInputs();

      if (exitMoveMode) {
        onExit?.();
      }
    },
    [onDragStateChange, onExit, restoreCameraInputs]
  );

  const startDragging = useCallback(
    (clientX: number, clientY: number) => {
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
      const axisDirection = getUpVectorAtPosition(axisOrigin);
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
      previousCameraInputStateRef.current =
        scene.screenSpaceCameraController.enableInputs;
      scene.screenSpaceCameraController.enableInputs = false;
      scene.requestRender();
    },
    [onDragStateChange, onPointPositionChange, scene, stopDragging]
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

    const initialUpVector = getUpVectorAtPosition(movePoint.geometryECEF);
    const visualizer = createRotationAxisVisualizer(
      `point-move-axis-${movePoint.id}`,
      {
        origin: movePoint.geometryECEF,
        upVector: initialUpVector,
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

      const upVector = getUpVectorAtPosition(currentPoint.geometryECEF);
      axisVisualizerRef.current.update(
        currentPoint.geometryECEF,
        upVector,
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
  }, [movePoint?.id, scene]);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      startDragging(event.clientX, event.clientY);
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
        createElement("div", {
          "data-point-move-axis-line": "true",
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
          "data-point-move-axis-stem-up": "true",
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${axisArrowStemLengthPx}px`,
            height: "2px",
            borderRadius: "2px",
            background: ENU_UP_AXIS_COLOR,
            transform: "translate(-50%, -50%)",
            zIndex: 1,
            pointerEvents: "none",
          },
        }),
        createElement("div", {
          "data-point-move-axis-stem-down": "true",
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${axisArrowStemLengthPx}px`,
            height: "2px",
            borderRadius: "2px",
            background: ENU_UP_AXIS_COLOR,
            transform: "translate(-50%, -50%)",
            zIndex: 1,
            pointerEvents: "none",
          },
        }),
        createElement("div", {
          "data-point-move-axis-center-hit": "true",
          onMouseDown: handleMouseDown,
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
            cursor: "ns-resize",
            userSelect: "none",
          },
          title: "Punkt entlang der U-Achse verschieben",
        }),
        createElement(
          "div",
          {
            "data-point-move-axis-arrow-up": "true",
            onMouseDown: handleMouseDown,
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
              color: ENU_UP_AXIS_COLOR,
              fontSize: "18px",
              fontWeight: 700,
              lineHeight: 1,
              WebkitTextStroke: `${LABEL_LINE_WIDTH_PX}px rgba(255, 255, 255, 0.95)`,
              textShadow: "none",
              zIndex: 2,
              pointerEvents: "auto",
              cursor: "ns-resize",
              userSelect: "none",
            },
          },
          "▲"
        ),
        createElement(
          "div",
          {
            "data-point-move-axis-arrow-down": "true",
            onMouseDown: handleMouseDown,
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
              color: ENU_UP_AXIS_COLOR,
              fontSize: "18px",
              fontWeight: 700,
              lineHeight: 1,
              WebkitTextStroke: `${LABEL_LINE_WIDTH_PX}px rgba(255, 255, 255, 0.95)`,
              textShadow: "none",
              zIndex: 2,
              pointerEvents: "auto",
              cursor: "ns-resize",
              userSelect: "none",
            },
          },
          "▼"
        )
      ),
    [
      axisUiLengthPx,
      axisUiLineLengthPx,
      axisArrowOffsetPx,
      axisArrowStemLengthPx,
      axisArrowStemOffsetPx,
      centerDragHitAreaPx,
      handleMouseDown,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !movePoint) {
      removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      return;
    }

    addLabelOverlayElement({
      id: OVERLAY_HANDLE_ID,
      content: handleContent,
      onClick: NOOP,
      updatePosition: (elementDiv) => {
        const activePoint = movePointRef.current;
        if (!activePoint || scene.isDestroyed()) return false;

        const anchorCanvasPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          activePoint.geometryECEF
        );
        if (!defined(anchorCanvasPosition)) return false;

        const upVector = getUpVectorAtPosition(activePoint.geometryECEF);
        const axisTipOffset = Math.max(radius * 4, 2);
        const axisTipPosition = Cartesian3.add(
          activePoint.geometryECEF,
          Cartesian3.multiplyByScalar(
            upVector,
            axisTipOffset,
            new Cartesian3()
          ),
          new Cartesian3()
        );
        const axisTipCanvasPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          axisTipPosition
        );

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

        elementDiv.style.position = "absolute";
        elementDiv.style.left = `${anchorCanvasPosition.x}px`;
        elementDiv.style.top = `${anchorCanvasPosition.y}px`;
        elementDiv.style.transform = "translate(-50%, -50%)";
        elementDiv.style.display = "block";

        const axisLine = elementDiv.querySelector(
          '[data-point-move-axis-line="true"]'
        ) as HTMLElement | null;
        if (axisLine) {
          axisLine.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad)`;
        }

        const axisArrowUp = elementDiv.querySelector(
          '[data-point-move-axis-arrow-up="true"]'
        ) as HTMLElement | null;
        if (axisArrowUp) {
          axisArrowUp.style.left = `calc(50% + ${
            axisDirX * axisArrowOffsetPx
          }px)`;
          axisArrowUp.style.top = `calc(50% + ${
            axisDirY * axisArrowOffsetPx
          }px)`;
          axisArrowUp.style.transform = `translate(-50%, -50%) rotate(${
            axisAngleRad + Math.PI / 2
          }rad)`;
        }

        const axisStemUp = elementDiv.querySelector(
          '[data-point-move-axis-stem-up="true"]'
        ) as HTMLElement | null;
        if (axisStemUp) {
          axisStemUp.style.left = `calc(50% + ${
            axisDirX * axisArrowStemOffsetPx
          }px)`;
          axisStemUp.style.top = `calc(50% + ${
            axisDirY * axisArrowStemOffsetPx
          }px)`;
          axisStemUp.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad)`;
        }

        const axisArrowDown = elementDiv.querySelector(
          '[data-point-move-axis-arrow-down="true"]'
        ) as HTMLElement | null;
        if (axisArrowDown) {
          axisArrowDown.style.left = `calc(50% + ${
            -axisDirX * axisArrowOffsetPx
          }px)`;
          axisArrowDown.style.top = `calc(50% + ${
            -axisDirY * axisArrowOffsetPx
          }px)`;
          axisArrowDown.style.transform = `translate(-50%, -50%) rotate(${
            axisAngleRad + Math.PI / 2
          }rad)`;
        }

        const axisStemDown = elementDiv.querySelector(
          '[data-point-move-axis-stem-down="true"]'
        ) as HTMLElement | null;
        if (axisStemDown) {
          axisStemDown.style.left = `calc(50% + ${
            -axisDirX * axisArrowStemOffsetPx
          }px)`;
          axisStemDown.style.top = `calc(50% + ${
            -axisDirY * axisArrowStemOffsetPx
          }px)`;
          axisStemDown.style.transform = `translate(-50%, -50%) rotate(${axisAngleRad}rad)`;
        }

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
