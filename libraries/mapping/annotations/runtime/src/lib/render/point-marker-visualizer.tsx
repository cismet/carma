import { geographicCoordinateFromEcef } from "@carma-geo/proj";
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

import type { CssPixelPosition } from "@carma-units";
import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { RuntimePointMarkerRenderModel } from "./annotation-render-models";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  computeOverlayVisibilityState,
  type OverlayVisibilityState,
} from "./overlay-visibility.shared";
import {
  useOverlayStateCache,
  type OverlayStateComputeContext,
} from "./use-overlay-state-cache";

const createEmptyPointVisibilityState = (): OverlayVisibilityState => ({
  screenPosition: null,
  isInViewport: false,
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
        onMouseUp={interactive ? clearLongPressTimeout : undefined}
        onMouseEnter={interactive ? handleMouseEnter : undefined}
        onMouseLeave={interactive ? handleMouseLeave : undefined}
      />
    </div>
  );
};

export const usePointMarkerVisualizer = (
  engine: AnnotationEngine | null,
  points: readonly RuntimePointMarkerRenderModel[],
  liveAnchors: LiveAnnotationAnchors,
  overlayIdPrefix: string = "runtime-point-marker"
) => {
  const { setLabelOverlayElement, removeLabelOverlayElement, updatePositions } =
    useLabelOverlay();
  const pointsRef = useRef(points);
  const previousPointIdsRef = useRef<Set<string>>(new Set());

  const computeStates = useCallback(
    ({
      previousStatesById,
      isCameraMoving,
    }: OverlayStateComputeContext<OverlayVisibilityState>) => {
      const nextStatesById = new Map<string, OverlayVisibilityState>();
      // Reuse the previous occlusion verdict while the camera moves AND while a
      // live drag is active: recomputing runs an engine occlusion pick (a
      // pick-pass render) per marker per frame, which collapses the frame rate
      // in marker-rich scenes.
      const preserveOcclusion =
        (isCameraMoving && engine?.capabilities.occlusionPerFrame !== true) ||
        liveAnchors.size > 0;

      pointsRef.current.forEach((point) => {
        // During a drag the node moves while the camera is static, so anchor to
        // its live position when present or the marker lags the gizmo/lines.
        const liveAnchor = point.nodeId
          ? liveAnchors.get(point.nodeId)
          : undefined;
        const computedState = computeOverlayVisibilityState({
          engine,
          coordinate: liveAnchor
            ? geographicCoordinateFromEcef(liveAnchor)
            : point.coordinate,
          shouldTestOcclusion: !preserveOcclusion,
        });
        nextStatesById.set(
          point.id,
          preserveOcclusion
            ? {
                ...computedState,
                isOccluded:
                  previousStatesById.get(point.id)?.isOccluded ?? false,
              }
            : computedState
        );
      });

      return nextStatesById;
    },
    [engine, liveAnchors]
  );
  const { resolveState: resolvePointVisibilityState, invalidate } =
    useOverlayStateCache({
      engine,
      liveAnchors,
      updatePositions,
      computeStates,
      createEmptyState: createEmptyPointVisibilityState,
    });

  useEffect(() => {
    pointsRef.current = points;
    invalidate(true);
    updatePositions();
    engine?.requestRender();
  }, [points, engine, invalidate, updatePositions]);

  // Diff by point id and update registered overlays in place (like the label
  // visualizer): a remove+re-add drops the element's DOM registration until the
  // portal re-commits, so the per-frame loop skips the marker for a frame on
  // every draft flush — a marker-only stutter during drags.
  useEffect(() => {
    const nextPointIds = new Set<string>();

    points.forEach((point) => {
      const overlayId = getPointMarkerOverlayId(overlayIdPrefix, point.id);
      nextPointIds.add(point.id);

      const overlayElement = {
        id: overlayId,
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
        updatePosition: (elementDiv: HTMLElement) => {
          const visibilityState = resolvePointVisibilityState(point.id);
          if (!visibilityState.screenPosition || visibilityState.isHidden) {
            return false;
          }

          // The dragged node moves between rendered frames too (forced update
          // passes run outside postRender, where the frame-keyed state cache
          // stays pinned). Project its live anchor directly so the circle stays
          // glued to the gizmo/lines, which read the registry live.
          let screenPosition = visibilityState.screenPosition;
          const liveAnchor = point.nodeId
            ? liveAnchors.get(point.nodeId)
            : undefined;
          if (liveAnchor && isValidAnnotationEngine(engine)) {
            const projected = engine.worldToScreen(liveAnchor);
            if (projected !== null) {
              screenPosition = {
                x: projected.x,
                y: projected.y,
              } as CssPixelPosition;
            }
          }

          elementDiv.style.left = `${screenPosition.x}px`;
          elementDiv.style.top = `${screenPosition.y}px`;
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
      };

      setLabelOverlayElement(overlayElement);
    });

    previousPointIdsRef.current.forEach((pointId) => {
      if (nextPointIds.has(pointId)) {
        return;
      }

      removeLabelOverlayElement(
        getPointMarkerOverlayId(overlayIdPrefix, pointId)
      );
    });

    previousPointIdsRef.current = nextPointIds;

    updatePositions();
    engine?.requestRender();
  }, [
    setLabelOverlayElement,
    engine,
    liveAnchors,
    overlayIdPrefix,
    points,
    removeLabelOverlayElement,
    resolvePointVisibilityState,
    updatePositions,
  ]);

  useEffect(
    () => () => {
      previousPointIdsRef.current.forEach((pointId) => {
        removeLabelOverlayElement(
          getPointMarkerOverlayId(overlayIdPrefix, pointId)
        );
      });
      previousPointIdsRef.current.clear();
    },
    [overlayIdPrefix, removeLabelOverlayElement]
  );
};
