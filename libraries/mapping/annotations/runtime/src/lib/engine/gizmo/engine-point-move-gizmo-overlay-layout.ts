import {
  AXIS_NUMERIC_EPSILON,
  MOVE_GIZMO_OVERLAY_Z_INDEX,
} from "@carma-mapping/gizmo/core";
import { formatLengthMeters } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import { applyAxisElements } from "./engine-point-move-gizmo-axis-layout";
import {
  applyDiscOutlinePaths,
  applyRotationHandle,
  layoutDiscInteractionPath,
} from "./engine-point-move-gizmo-disc-layout";
import {
  layoutPointMoveGizmoFrame,
  type PointMoveGizmoFrame,
  type PointMoveGizmoFrameOptions,
} from "./engine-point-move-gizmo-frame";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

export type PointMoveGizmoOverlayLayoutOptions = PointMoveGizmoFrameOptions & {
  centerPlaneDragCursor: string;
  /** The scene draws the gizmo; the overlay keeps the hit areas and the label. */
  hitOnly: boolean;
  setRadiusLabelText: (text: string) => void;
};

const updateRadiusLabel = (
  gizmo: PointMoveGizmoState,
  frame: PointMoveGizmoFrame,
  options: PointMoveGizmoOverlayLayoutOptions
) => {
  const { anchorCanvasPosition, activeOutline } = frame;
  const horizontalRadiusPx = activeOutline?.supportRadius ?? 0;
  const radiusWorldValue = activeOutline?.worldRadius;
  if (
    gizmo.showDiscRadiusLabel &&
    options.showDisc &&
    horizontalRadiusPx > AXIS_NUMERIC_EPSILON &&
    radiusWorldValue !== undefined &&
    Number.isFinite(radiusWorldValue)
  ) {
    gizmo.radiusHairlineGeometry = {
      startX: anchorCanvasPosition.x,
      startY: anchorCanvasPosition.y,
      endX: anchorCanvasPosition.x + horizontalRadiusPx,
      endY: anchorCanvasPosition.y,
    };
    const text = formatLengthMeters(radiusWorldValue, {
      maximumFractionDigitsMeters: 0,
    });
    if (text !== gizmo.radiusLabelText) {
      gizmo.radiusLabelText = text;
      options.setRadiusLabelText(text);
    }
  } else if (gizmo.radiusHairlineGeometry !== null)
    gizmo.radiusHairlineGeometry = null;
};

/** Positions the overlay on the frame layout the scene primitives are placed with. */
export const layoutPointMoveGizmoOverlay = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  elementDiv: HTMLElement,
  options: PointMoveGizmoOverlayLayoutOptions
): boolean => {
  const frame = layoutPointMoveGizmoFrame(engine, gizmo, options);
  if (!frame) return false;
  const { anchorCanvasPosition, activeAxis, activeOutline } = frame;

  elementDiv.style.position = "absolute";
  elementDiv.style.left = `${anchorCanvasPosition.x}px`;
  elementDiv.style.top = `${anchorCanvasPosition.y}px`;
  elementDiv.style.transform = "translate(-50%, -50%)";
  elementDiv.style.zIndex = `${MOVE_GIZMO_OVERLAY_Z_INDEX}`;
  elementDiv.style.pointerEvents = "none";
  elementDiv.style.display = "block";

  applyDiscOutlinePaths(
    elementDiv,
    frame.outlinesByAxisId,
    activeAxis?.id ?? null,
    options.showDisc
  );
  layoutDiscInteractionPath(
    elementDiv.querySelector<SVGPathElement>(
      '[data-point-move-disc-interaction-path="true"]'
    ),
    activeOutline,
    options.showDisc,
    gizmo
  );
  const rotationHandle = elementDiv.querySelector<SVGEllipseElement>(
    '[data-point-move-disc-rotation-handle="true"]'
  );
  if (rotationHandle) {
    applyRotationHandle(rotationHandle, frame.rotationHandle, gizmo);
  }
  frame.axes.forEach((axis) =>
    applyAxisElements({
      engine,
      gizmo,
      elementDiv,
      anchorCanvasPosition,
      axis,
      hitOnly: options.hitOnly,
    })
  );
  const centerHit = elementDiv.querySelector<HTMLElement>(
    '[data-point-move-axis-center-hit="true"]'
  );
  if (centerHit)
    centerHit.style.cursor =
      gizmo.isDragging && gizmo.dragState?.mode === "plane-translate"
        ? "grabbing"
        : options.centerPlaneDragCursor;

  updateRadiusLabel(gizmo, frame, options);
  return true;
};
