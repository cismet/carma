import { useEffect, useMemo, type ReactNode } from "react";
import {
  useLineVisualizers,
  type LineVisualizerData,
  type useLabelOverlay,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";
import {
  DISC_OUTLINE_COLOR,
  MOVE_GIZMO_OVERLAY_Z_INDEX,
  OVERLAY_HANDLE_ID,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationGizmoPoint,
  AnnotationGizmoDiscScalingMode,
} from "@carma-mapping/annotations/core";
import {
  layoutPointMoveGizmoOverlay,
  type PointMoveGizmoOverlayLayoutOptions,
} from "./engine-point-move-gizmo-overlay-layout";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

type OverlayOptions = PointMoveGizmoOverlayLayoutOptions &
  Pick<
    ReturnType<typeof useLabelOverlay>,
    "setLabelOverlayElement" | "removeLabelOverlayElement"
  > & {
    movePoint: AnnotationGizmoPoint | null;
    handleContent: ReactNode;
    radius: number;
    radiusLabelText: string;
    showDiscRadiusLabel: boolean;
    discScalingMode: AnnotationGizmoDiscScalingMode;
    computeDiscWorldRadius: PointMoveGizmoOverlayLayoutOptions["resolveDiscWorldRadiusForFrame"];
  };

/**
 * The overlay part of the gizmo on the label-overlay host: the hit areas and
 * the disc-radius label, and the visuals themselves while the engine cannot
 * draw them in its scene.
 */
export const usePointMoveGizmoOverlay = (
  engine: AnnotationEngine | null,
  gizmo: PointMoveGizmoState,
  options: OverlayOptions
) => {
  const {
    movePoint,
    handleContent,
    radius,
    radiusLabelText,
    showDiscRadiusLabel,
    showDisc,
    showRotationHandle,
    hitOnly,
    discScalingMode,
    discOutlineScreenPixelRadius,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    axisArrowOffsetPx,
    getAxisCandidatesAtPosition,
    getDiscPlaneNormalAtPosition,
    computeDiscWorldRadius,
    resolveDiscWorldRadiusForFrame,
    setLabelOverlayElement,
    removeLabelOverlayElement,
  } = options;
  const radiusHairlineLineVisualizers = useMemo<LineVisualizerData[]>(() => {
    if (!showDiscRadiusLabel || !showDisc || !movePoint) return [];
    return [
      {
        id: `${OVERLAY_HANDLE_ID}-radius-hairline`,
        getSvgLine: () => {
          const geometry = gizmo.radiusHairlineGeometry;
          if (!geometry) return null;
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
  }, [gizmo, movePoint, radiusLabelText, showDisc, showDiscRadiusLabel]);
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
          return layoutPointMoveGizmoOverlay(
            engine,
            gizmo,
            elementDiv,
            options
          );
        } catch {
          return false;
        } // Overlay refresh may race with engine teardown.
      },
      visible: true,
    });
    return () => removeLabelOverlayElement(OVERLAY_HANDLE_ID);
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
    showRotationHandle,
    hitOnly,
    getDiscPlaneNormalAtPosition,
    gizmo,
  ]);
};
