import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

import { useLabelOverlay } from "@carma-providers/label-overlay";
import {
  DEFAULT_ACTIVE_ARROW_EDGE_PX,
  DEFAULT_INACTIVE_ARROW_EDGE_PX,
  DISC_SCREEN_PIXEL_RADIUS,
  forwardWheelToCanvas,
  getAxisArrowOffsetPx,
  getAxisUiLengthPx,
  getPhysicalHairlinePx,
  OPEN_GIZMO_SCENE_CLICK_GUARD_MS,
  OVERLAY_HANDLE_ID,
  PLANE_DRAG_DISC_CURSOR,
  PLANE_DRAG_GROUND_SNAP_CURSOR,
  restoreGlobalDragCursor,
} from "@carma-mapping/gizmo/core";

import {
  ANNOTATION_GIZMO_DISC_SCALING_MODES,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
  type AnnotationPointMoveGizmoOptions,
} from "@carma-mapping/annotations/core";
import { SCENE_CLICK_PIXEL_TOLERANCE } from "./engine-point-move-gizmo-constants";
import { getOverlayAxisCandidates } from "./engine-point-move-gizmo-default-axes";
import { createPointMoveGizmoOverlayContent } from "./engine-point-move-gizmo-overlay-content";
import {
  createPointMoveGizmoState,
  type PointMoveGizmoState,
} from "./engine-point-move-gizmo-state";
import { usePointMoveGizmoAxes } from "./use-engine-point-move-gizmo-axes";
import { usePointMoveGizmoDiscRadius } from "./use-engine-point-move-gizmo-disc-radius";
import { usePointMoveGizmoDrag } from "./use-engine-point-move-gizmo-drag";
import { usePointMoveGizmoOverlay } from "./use-engine-point-move-gizmo-overlay";
import {
  releaseGizmoScenePrimitives,
  usePointMoveGizmoScene,
} from "./use-engine-point-move-gizmo-scene";

/** Point-move gizmo (axes, disc, rotation handle) on the AnnotationEngine contract. */
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
    showAxes = true,
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
  const overlay = useLabelOverlay();
  const syncedOptions = {
    radius,
    freezeDiscScaleDuringDrag,
    stepFactor: discResizeStepFactor,
    showDiscRadiusLabel,
    axisDirection,
    discPlaneNormal,
    preferredAxisId,
    axisCandidates,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange,
    onRotationDelta,
    onExit,
  };
  const gizmoRef = useRef<PointMoveGizmoState | null>(null);
  if (!gizmoRef.current)
    gizmoRef.current = createPointMoveGizmoState(syncedOptions);
  const gizmo = gizmoRef.current;
  const [radiusLabelText, setRadiusLabelText] = useState("");
  const centerPlaneDragCursor = snapPlaneDragToGround
    ? PLANE_DRAG_GROUND_SNAP_CURSOR
    : PLANE_DRAG_DISC_CURSOR;
  const resolvedAxisWidthPx = useMemo(
    () => axisWidthPx ?? getPhysicalHairlinePx(),
    [axisWidthPx]
  );
  const discRadius = usePointMoveGizmoDiscRadius(engine, gizmo, {
    discScalingMode,
    discOutlineScreenPixelRadius,
    discResizeWorldRadiusToScreenTarget,
    discQuantizeWorldRadius,
  });
  const movePoint = useMemo(
    () =>
      movePointId
        ? points.find((point) => point.id === movePointId) ?? null
        : null,
    [points, movePointId]
  );
  const movePointKey = movePoint?.id ?? null;

  useEffect(() => {
    gizmo.movePoint = movePoint;
    // Keep the live position until React commits it, so mouseup cannot snap back.
    if (!gizmo.isDragging && gizmo.livePointPositions.size > 0) {
      gizmo.livePointPositions.clear();
      if (engine && !engine.isDestroyed()) engine.requestRender();
    }
  });
  useEffect(() => {
    gizmo.axisScreenDirection = {};
    gizmo.axisAnchorDistance = {};
  }, [gizmo, movePointKey]);
  useEffect(() => {
    if (gizmo.clearInitialSceneClickGuardTimeout !== null) {
      window.clearTimeout(gizmo.clearInitialSceneClickGuardTimeout);
      gizmo.clearInitialSceneClickGuardTimeout = null;
    }
    if (!movePoint) {
      gizmo.suppressNextSceneClick = false;
      return;
    }
    // Ignore the trailing scene click of the DOM gesture that opened the gizmo.
    gizmo.suppressNextSceneClick = true;
    gizmo.clearInitialSceneClickGuardTimeout = window.setTimeout(() => {
      gizmo.suppressNextSceneClick = false;
      gizmo.clearInitialSceneClickGuardTimeout = null;
    }, OPEN_GIZMO_SCENE_CLICK_GUARD_MS);
    return () => {
      if (gizmo.clearInitialSceneClickGuardTimeout !== null) {
        window.clearTimeout(gizmo.clearInitialSceneClickGuardTimeout);
        gizmo.clearInitialSceneClickGuardTimeout = null;
      }
    };
  }, [gizmo, movePointKey]);
  useEffect(() => {
    Object.assign(gizmo, syncedOptions);
  });

  const axes = usePointMoveGizmoAxes(gizmo, {
    movePointKey,
    labels,
    axisTitle,
    axisCandidates,
    axisDirection,
    preferredAxisId,
  });
  const drag = usePointMoveGizmoDrag(engine, gizmo, {
    excludeRegisteredDragSampleOccluders,
    ...axes,
  });
  usePointMoveGizmoScene(engine, gizmo, {
    movePointKey,
    showAxes,
    showDisc,
    axisWidthPx: resolvedAxisWidthPx,
    discOutlineScreenPixelRadius,
    getActiveAxisAtPosition: axes.getActiveAxisAtPosition,
    getDiscPlaneNormalAtPosition: axes.getDiscPlaneNormalAtPosition,
    ...discRadius,
  });

  const handleAxisMouseDown = useCallback(
    (
      event: ReactMouseEvent<HTMLDivElement>,
      axisCandidate?: AnnotationGizmoAxisCandidate
    ) => {
      event.preventDefault();
      event.stopPropagation();
      drag.startDragging(event.clientX, event.clientY, axisCandidate);
    },
    [drag.startDragging]
  );
  const handleRotationHandleMouseDown = useCallback(
    (event: ReactMouseEvent<SVGCircleElement>) => {
      event.preventDefault();
      event.stopPropagation();
      drag.startRotating(event.clientX, event.clientY);
    },
    [drag.startRotating]
  );
  const handleDiscPlaneMouseDown = useCallback(
    (event: ReactMouseEvent<SVGPathElement>) => {
      event.preventDefault();
      event.stopPropagation();
      drag.startPlaneDragging(event.clientX, event.clientY, {
        snapToGround: false,
      });
    },
    [drag.startPlaneDragging]
  );
  const handleCenterMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      drag.startPlaneDragging(event.clientX, event.clientY, {
        snapToGround: snapPlaneDragToGround,
      });
    },
    [drag.startPlaneDragging, snapPlaneDragToGround]
  );
  const handleWheel = useCallback(
    (event: ReactWheelEvent) => {
      if (!engine || engine.isDestroyed()) return;
      const canvas = engine.canvas;
      if (canvas) forwardWheelToCanvas(canvas, event);
    },
    [engine]
  );
  const axisUiLengthPx = useMemo(() => getAxisUiLengthPx(radius), [radius]);
  const axisArrowOffsetPx = getAxisArrowOffsetPx(axisUiLengthPx);
  const overlayAxisCandidates = useMemo(
    () => getOverlayAxisCandidates(axisCandidates, labels, axisTitle),
    [axisCandidates, labels, axisTitle]
  );
  const handleContent = useMemo(
    () =>
      createPointMoveGizmoOverlayContent({
        axisCandidates: overlayAxisCandidates,
        labels,
        axisUiLengthPx,
        axisArrowOffsetPx,
        axisWidthPx: resolvedAxisWidthPx,
        arrowActiveEdgePx,
        showAxes,
        showRotationHandle,
        snapPlaneDragToGround,
        centerPlaneDragCursor,
        onAxisMouseDown: handleAxisMouseDown,
        onDiscPlaneMouseDown: handleDiscPlaneMouseDown,
        onRotationHandleMouseDown: handleRotationHandleMouseDown,
        onCenterMouseDown: handleCenterMouseDown,
        onWheel: handleWheel,
      }),
    [
      overlayAxisCandidates,
      labels,
      axisUiLengthPx,
      axisArrowOffsetPx,
      resolvedAxisWidthPx,
      arrowActiveEdgePx,
      showAxes,
      showRotationHandle,
      snapPlaneDragToGround,
      centerPlaneDragCursor,
      handleAxisMouseDown,
      handleDiscPlaneMouseDown,
      handleRotationHandleMouseDown,
      handleCenterMouseDown,
      handleWheel,
    ]
  );

  usePointMoveGizmoOverlay(engine, gizmo, {
    ...overlay,
    movePoint,
    handleContent,
    radius,
    radiusLabelText,
    setRadiusLabelText,
    showDiscRadiusLabel,
    showDisc,
    showRotationHandle,
    centerPlaneDragCursor,
    discScalingMode,
    discOutlineScreenPixelRadius,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    axisArrowOffsetPx,
    ...axes,
    ...discRadius,
  });

  useEffect(() => {
    if (!engine || engine.isDestroyed() || !movePoint) return;
    const canvas = engine.canvas;
    let pressClientPosition: { x: number; y: number } | null = null;
    const handleCanvasMouseDown = (event: MouseEvent) => {
      pressClientPosition =
        event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const handleCanvasClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const pressPosition = pressClientPosition;
      pressClientPosition = null;
      if (
        pressPosition &&
        Math.hypot(
          event.clientX - pressPosition.x,
          event.clientY - pressPosition.y
        ) > SCENE_CLICK_PIXEL_TOLERANCE
      )
        return;
      if (gizmo.suppressNextSceneClick) {
        gizmo.suppressNextSceneClick = false;
        return;
      }
      if (gizmo.isDragging) return;
      gizmo.onExit?.();
    };
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    canvas.addEventListener("click", handleCanvasClick);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      drag.stopDragging(false);
      gizmo.onExit?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
      canvas.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [movePointKey, engine, gizmo, drag.stopDragging]);
  useEffect(() => {
    if (movePoint) return;
    drag.stopDragging(false);
    overlay.removeLabelOverlayElement(OVERLAY_HANDLE_ID);
  }, [movePoint, overlay.removeLabelOverlayElement, drag.stopDragging]);
  useEffect(
    () => () => {
      if (gizmo.clearInitialSceneClickGuardTimeout !== null) {
        window.clearTimeout(gizmo.clearInitialSceneClickGuardTimeout);
        gizmo.clearInitialSceneClickGuardTimeout = null;
      }
      drag.stopDragging(false);
      gizmo.livePointPositions.clear();
      restoreGlobalDragCursor(gizmo);
      overlay.removeLabelOverlayElement(OVERLAY_HANDLE_ID);
      releaseGizmoScenePrimitives(gizmo);
    },
    [overlay.removeLabelOverlayElement, engine, gizmo, drag.stopDragging]
  );
};
