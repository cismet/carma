import { useCallback, useEffect, useRef } from "react";

import {
  getOverlayReferenceSignature,
  useLabelOverlay,
} from "@carma-providers/label-overlay";

import type { RuntimeScene } from "../types/runtime-scene.types";
import type { RuntimePointMarkerRenderModel } from "./measurement-render-models";
import {
  areRuntimeOverlayVisibilitySceneSnapshotsEqual,
  captureRuntimeOverlayVisibilitySceneSnapshot,
  computeRuntimeOverlayVisibilityState,
  getSceneFrameKey,
  type RuntimeOverlayVisibilitySceneSnapshot,
  type RuntimeOverlayVisibilityState,
} from "./runtime-overlay-visibility.shared";

const runtimePointMarkerVisualizerDefaults = Object.freeze({
  overlayZIndex: 16,
});

const createEmptyPointVisibilityState = (): RuntimeOverlayVisibilityState => ({
  canvasPosition: null,
  screenPosition: null,
  isHidden: true,
  isOccluded: false,
});

const getPointMarkerOverlayId = (overlayIdPrefix: string, pointId: string) =>
  `${overlayIdPrefix}-${pointId}`;

const getPointMarkerContentSignature = (
  point: RuntimePointMarkerRenderModel
): string =>
  [
    point.id,
    point.pixelSize,
    point.fill,
    point.outline,
    point.outlineWidth,
    getOverlayReferenceSignature(point.onClick),
  ].join(":");

const RuntimePointMarkerOverlayShell = ({
  interactive,
  onClick,
}: {
  interactive: boolean;
  onClick?: () => void;
}) => (
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
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "pointer" : "default",
      }}
      onClick={interactive ? onClick : undefined}
    />
  </div>
);

export const usePointMarkerVisualizer = (
  scene: RuntimeScene | null,
  points: readonly RuntimePointMarkerRenderModel[],
  overlayIdPrefix: string = "runtime-point-marker"
) => {
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

    const removeMoveStartListener = scene.camera.moveStart.addEventListener(
      handleCameraMoveStart
    );
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
              isOccluded: previousStatesById.get(point.id)?.isOccluded ?? false,
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
        const sceneSnapshot =
          captureRuntimeOverlayVisibilitySceneSnapshot(scene);
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
    const overlayIds = points.map((point) =>
      getPointMarkerOverlayId(overlayIdPrefix, point.id)
    );

    points.forEach((point) => {
      addLabelOverlayElement({
        id: getPointMarkerOverlayId(overlayIdPrefix, point.id),
        zIndex: runtimePointMarkerVisualizerDefaults.overlayZIndex,
        contentKey: getPointMarkerContentSignature(point),
        content: (
          <RuntimePointMarkerOverlayShell
            interactive={Boolean(point.onClick)}
            onClick={point.onClick}
          />
        ),
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
    overlayIdPrefix,
    points,
    removeLabelOverlayElement,
    resolvePointVisibilityState,
    scene,
    updatePositions,
  ]);
};
