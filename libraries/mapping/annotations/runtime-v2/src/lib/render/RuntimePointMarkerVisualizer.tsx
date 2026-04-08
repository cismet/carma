import { useCallback, useEffect, useRef } from "react";

import { useLabelOverlay } from "@carma-providers/label-overlay";

import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimePointMarkerRenderModel } from "./measurementRenderModels";
import {
  areRuntimeOverlayVisibilitySceneSnapshotsEqual,
  captureRuntimeOverlayVisibilitySceneSnapshot,
  computeRuntimeOverlayVisibilityState,
  getSceneFrameKey,
  type RuntimeOverlayVisibilitySceneSnapshot,
  type RuntimeOverlayVisibilityState,
} from "./runtimeOverlayVisibility.shared";

type RuntimePointMarkerVisualizerProps = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
};

const POINT_MARKER_OVERLAY_Z_INDEX = 16;

const createEmptyPointVisibilityState = (): RuntimeOverlayVisibilityState => ({
  canvasPosition: null,
  screenPosition: null,
  isHidden: true,
  isOccluded: false,
});

const getPointMarkerOverlayId = (pointId: string) =>
  `runtime-point-marker-${pointId}`;

const RuntimePointMarkerOverlayShell = () => (
  <div
    data-runtime-point-marker-shell="true"
    style={{
      position: "relative",
      width: "0px",
      height: "0px",
      overflow: "visible",
      pointerEvents: "none",
    }}
  >
    <div
      data-runtime-point-marker-circle="true"
      style={{
        position: "absolute",
        left: "0px",
        top: "0px",
        transform: "translate(-50%, -50%)",
        borderRadius: "999px",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    />
  </div>
);

export const useRuntimePointMarkerVisualizer = ({
  scene,
  points,
}: RuntimePointMarkerVisualizerProps) => {
  const { addLabelOverlayElement, removeLabelOverlayElement, updatePositions } =
    useLabelOverlay();
  const pointsRef = useRef(points);
  const stateCacheRef = useRef<{
    frameKey: number | null;
    sceneSnapshot: RuntimeOverlayVisibilitySceneSnapshot | null;
    statesById: Map<string, RuntimeOverlayVisibilityState>;
  }>({
    frameKey: null,
    sceneSnapshot: null,
    statesById: new Map(),
  });
  const isCameraMovingRef = useRef(false);

  useEffect(() => {
    pointsRef.current = points;
    stateCacheRef.current = {
      frameKey: null,
      sceneSnapshot: null,
      statesById: new Map(),
    };
    updatePositions();
    scene?.requestRender();
  }, [points, scene, updatePositions]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      isCameraMovingRef.current = false;
      return;
    }

    const invalidateVisibilityCache = () => {
      stateCacheRef.current = {
        frameKey: null,
        sceneSnapshot: null,
        statesById: stateCacheRef.current.statesById,
      };
    };

    const handleCameraMoveStart = () => {
      isCameraMovingRef.current = true;
      invalidateVisibilityCache();
    };

    const handleCameraMoveEnd = () => {
      isCameraMovingRef.current = false;
      invalidateVisibilityCache();
      updatePositions();
      scene.requestRender();
    };

    const removeMoveStartListener =
      scene.camera.moveStart.addEventListener(handleCameraMoveStart);
    const removeMoveEndListener =
      scene.camera.moveEnd.addEventListener(handleCameraMoveEnd);

    return () => {
      isCameraMovingRef.current = false;
      removeMoveStartListener?.();
      removeMoveEndListener?.();
    };
  }, [scene, updatePositions]);

  const computeStatesById = useCallback(() => {
    const nextStatesById = new Map<string, RuntimeOverlayVisibilityState>();
    const previousStatesById = stateCacheRef.current.statesById;
    const preserveOcclusionDuringCameraMove = isCameraMovingRef.current;

    pointsRef.current.forEach((point) => {
      const computedState = computeRuntimeOverlayVisibilityState({
        scene,
        coordinate: point.coordinate,
        shouldTestOcclusion: !preserveOcclusionDuringCameraMove,
      });
      nextStatesById.set(
        point.id,
        preserveOcclusionDuringCameraMove
          ? {
              ...computedState,
              isOccluded:
                previousStatesById.get(point.id)?.isOccluded ?? false,
            }
          : computedState
      );
    });

    return nextStatesById;
  }, [scene]);

  const resolvePointVisibilityState = useCallback(
    (pointId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot = captureRuntimeOverlayVisibilitySceneSnapshot(scene);
        const shouldRecomputeStates =
          !areRuntimeOverlayVisibilitySceneSnapshotsEqual(
            stateCacheRef.current.sceneSnapshot,
            sceneSnapshot
          );

        stateCacheRef.current = shouldRecomputeStates
          ? {
              frameKey,
              sceneSnapshot,
              statesById: computeStatesById(),
            }
          : {
              frameKey,
              sceneSnapshot,
              statesById: stateCacheRef.current.statesById,
            };
      }

      return (
        stateCacheRef.current.statesById.get(pointId) ??
        createEmptyPointVisibilityState()
      );
    },
    [computeStatesById, scene]
  );

  useEffect(() => {
    const overlayIds = points.map((point) => getPointMarkerOverlayId(point.id));

    points.forEach((point) => {
      addLabelOverlayElement({
        id: getPointMarkerOverlayId(point.id),
        zIndex: POINT_MARKER_OVERLAY_Z_INDEX,
        contentKey: [
          point.id,
          point.pixelSize,
          point.fill,
          point.outline,
          point.outlineWidth,
        ].join(":"),
        content: <RuntimePointMarkerOverlayShell />,
        updatePosition: (elementDiv) => {
          const visibilityState = resolvePointVisibilityState(point.id);
          if (!visibilityState.screenPosition || visibilityState.isHidden) {
            return false;
          }

          elementDiv.style.left = `${visibilityState.screenPosition.x}px`;
          elementDiv.style.top = `${visibilityState.screenPosition.y}px`;
          elementDiv.style.transform = "none";

          const circle = elementDiv.querySelector(
            '[data-runtime-point-marker-circle="true"]'
          ) as HTMLDivElement | null;
          if (!circle) {
            return false;
          }

          circle.style.width = `${point.pixelSize}px`;
          circle.style.height = `${point.pixelSize}px`;
          circle.style.background = point.fill;
          circle.style.border = `${point.outlineWidth}px ${
            visibilityState.isOccluded ? "dotted" : "solid"
          } ${point.outline}`;

          return true;
        },
      });
    });

    updatePositions();
    scene?.requestRender();

    return () => {
      overlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
    };
  }, [
    addLabelOverlayElement,
    points,
    removeLabelOverlayElement,
    resolvePointVisibilityState,
    scene,
    updatePositions,
  ]);
};

export const RuntimePointMarkerVisualizer = (
  props: RuntimePointMarkerVisualizerProps
) => {
  useRuntimePointMarkerVisualizer(props);

  return null;
};
