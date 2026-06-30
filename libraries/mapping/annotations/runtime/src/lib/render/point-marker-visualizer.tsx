import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  buildOverlayHoverFilterCss,
  buildOverlayHoverTransitionCss,
  buildOverlayRingBoxShadowCss,
  getOverlayReferenceSignature,
  labelOverlayAffordanceDefaults,
  labelOverlayLayerDefaults,
  useLabelOverlay,
} from "@carma-providers/label-overlay";

import type { Cartesian3, Scene } from "@carma-cesium";
import { geographicCoordinateFromCartesian3 } from "@carma-mapping/engines/cesium/core";
import type { RuntimePointMarkerRenderModel } from "./annotation-render-models";
import {
  areOverlayVisibilitySceneSnapshotsEqual,
  captureOverlayVisibilitySceneSnapshot,
  computeOverlayVisibilityState,
  getSceneFrameKey,
  type OverlayVisibilitySceneSnapshot,
  type OverlayVisibilityState,
} from "./overlay-visibility.shared";

const createEmptyPointVisibilityState = (): OverlayVisibilityState => ({
  canvasPosition: null,
  screenPosition: null,
  isHidden: true,
  isOccluded: false,
});

const pointMarkerVisualizerDefaults = Object.freeze({
  longPressDurationMs: 320,
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
    `${point.longPressDurationMs ?? ""}`,
    getOverlayReferenceSignature(point.onClick),
    getOverlayReferenceSignature(point.onHoverChange),
    getOverlayReferenceSignature(point.onLongPress),
  ].join(":");

export const PointMarkerOverlayShell = ({
  interactive,
  onClick,
  onHoverChange,
  onLongPress,
  longPressDurationMs = pointMarkerVisualizerDefaults.longPressDurationMs,
  markerStyle,
}: {
  interactive: boolean;
  onClick?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
  markerStyle?: CSSProperties;
}) => {
  const [hovered, setHovered] = useState(false);
  const longPressTimeoutRef = useRef<number | undefined>(undefined);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimeout = useCallback(() => {
    if (longPressTimeoutRef.current === undefined) {
      return;
    }

    window.clearTimeout(longPressTimeoutRef.current);
    longPressTimeoutRef.current = undefined;
  }, []);

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.button !== 0 || !onLongPress) {
        clearLongPressTimeout();
        return;
      }

      longPressTriggeredRef.current = false;
      clearLongPressTimeout();
      longPressTimeoutRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress();
      }, longPressDurationMs);
    },
    [clearLongPressTimeout, longPressDurationMs, onLongPress]
  );

  const handleMouseUp = useCallback(() => {
    clearLongPressTimeout();
  }, [clearLongPressTimeout]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }

      onClick?.();
    },
    [onClick]
  );

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    onHoverChange?.(true);
  }, [onHoverChange]);

  const handleMouseLeave = useCallback(() => {
    clearLongPressTimeout();
    setHovered(false);
    onHoverChange?.(false);
  }, [clearLongPressTimeout, onHoverChange]);

  useEffect(() => clearLongPressTimeout, [clearLongPressTimeout]);

  return (
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
          transform: hovered
            ? `translate(-50%, -50%) scale(${labelOverlayAffordanceDefaults.hover.scale})`
            : "translate(-50%, -50%)",
          borderRadius: "999px",
          boxSizing: "border-box",
          pointerEvents: interactive ? "auto" : "none",
          cursor: interactive ? "pointer" : "default",
          transition: buildOverlayHoverTransitionCss(),
          boxShadow: hovered ? buildOverlayRingBoxShadowCss() : "none",
          filter: hovered ? buildOverlayHoverFilterCss() : "none",
          ...markerStyle,
        }}
        onClick={interactive ? handleClick : undefined}
        onMouseDown={interactive ? handleMouseDown : undefined}
        onMouseUp={interactive ? handleMouseUp : undefined}
        onMouseEnter={interactive ? handleMouseEnter : undefined}
        onMouseLeave={interactive ? handleMouseLeave : undefined}
      />
    </div>
  );
};

export const usePointMarkerVisualizer = (
  scene: Scene | null,
  points: readonly RuntimePointMarkerRenderModel[],
  overlayIdPrefix: string = "runtime-point-marker"
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updatePositions,
    liveAnchors,
  } = useLabelOverlay();
  const pointsRef = useRef(points);
  const stateCacheRef = useRef<{
    frameKey: number | null;
    sceneSnapshot: OverlayVisibilitySceneSnapshot | null;
    statesById: Map<string, OverlayVisibilityState>;
  }>({
    frameKey: null,
    sceneSnapshot: null,
    statesById: new Map(),
  });
  const isCameraMovingRef = useRef(false);
  const hadLiveAnchorsRef = useRef(false);

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
    const nextStatesById = new Map<string, OverlayVisibilityState>();
    const previousStatesById = stateCacheRef.current.statesById;
    const preserveOcclusionDuringCameraMove = isCameraMovingRef.current;

    pointsRef.current.forEach((point) => {
      // During a drag the node moves while the camera is static, so anchor to its
      // live position when present — otherwise the marker lags the gizmo/lines.
      const liveAnchor = point.nodeId
        ? (liveAnchors.get(point.nodeId) as Cartesian3 | undefined)
        : undefined;
      const computedState = computeOverlayVisibilityState({
        scene,
        coordinate: liveAnchor
          ? geographicCoordinateFromCartesian3(liveAnchor)
          : point.coordinate,
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
  }, [liveAnchors, scene]);

  const resolvePointVisibilityState = useCallback(
    (pointId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot = captureOverlayVisibilitySceneSnapshot(scene);
        // Live drag anchors move the node while the camera is static (equal
        // snapshot), so force a recompute then or the marker freezes. Also force
        // it on the settle frame (anchors just cleared) so the committed position
        // replaces the last live one without needing a camera move. (cismet/wupp#4078)
        const liveAnchorsActive = liveAnchors.size > 0;
        const justSettled = hadLiveAnchorsRef.current && !liveAnchorsActive;
        hadLiveAnchorsRef.current = liveAnchorsActive;
        const shouldRecomputeStates =
          liveAnchorsActive ||
          justSettled ||
          !areOverlayVisibilitySceneSnapshotsEqual(
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
    [computeStatesById, liveAnchors, scene]
  );

  useEffect(() => {
    const overlayIds = points.map((point) =>
      getPointMarkerOverlayId(overlayIdPrefix, point.id)
    );

    points.forEach((point) => {
      addLabelOverlayElement({
        id: getPointMarkerOverlayId(overlayIdPrefix, point.id),
        zIndex: labelOverlayLayerDefaults.zIndex.pointMarker,
        contentKey: getPointMarkerContentSignature(point),
        content: (
          <PointMarkerOverlayShell
            interactive={Boolean(
              point.onClick || point.onHoverChange || point.onLongPress
            )}
            onClick={point.onClick}
            onHoverChange={point.onHoverChange}
            onLongPress={point.onLongPress}
            longPressDurationMs={point.longPressDurationMs}
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
