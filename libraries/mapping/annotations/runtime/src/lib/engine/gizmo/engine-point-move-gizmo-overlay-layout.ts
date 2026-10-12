import { getEllipsoidalUpDirectionAtAnchor } from "@carma-geo/proj";
import { AXIS_NUMERIC_EPSILON } from "@carma-mapping/gizmo/core";
import { formatLengthMeters } from "@carma-units";
import type { Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "../annotation-engine.types";
import { layoutAxis } from "./engine-point-move-gizmo-axis-layout";
import {
  ARROW_PERSPECTIVE_SCALE_MAX,
  ARROW_PERSPECTIVE_SCALE_MIN,
  DISC_OUTLINE_COLOR,
  MOVE_GIZMO_OVERLAY_Z_INDEX,
} from "./engine-point-move-gizmo-constants";
import {
  layoutDiscInteractionPath,
  layoutDiscOutlines,
  layoutRotationHandle,
} from "./engine-point-move-gizmo-disc-layout";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

export type PointMoveGizmoOverlayLayoutOptions = {
  showDisc: boolean;
  showRotationHandle: boolean;
  centerPlaneDragCursor: string;
  discOutlineScreenPixelRadius: number;
  arrowActiveEdgePx: number;
  arrowInactiveEdgePx: number;
  axisArrowOffsetPx: number;
  getAxisCandidatesAtPosition: (
    origin: Vector3
  ) => AnnotationGizmoAxisCandidate[];
  getDiscPlaneNormalAtPosition: (origin: Vector3) => Vector3;
  resolveDiscWorldRadiusForFrame: (origin: Vector3, normal: Vector3) => number;
  setRadiusLabelText: (text: string) => void;
};

/** Positions the overlay against the same live anchor used by the scene primitives. */
export const layoutPointMoveGizmoOverlay = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  elementDiv: HTMLElement,
  options: PointMoveGizmoOverlayLayoutOptions
): boolean => {
  const rawPoint = gizmo.movePoint;
  if (!rawPoint || engine.isDestroyed()) return false;
  const origin =
    gizmo.livePointPositions.get(rawPoint.id) ?? rawPoint.geometryECEF;
  const anchorCanvasPosition = engine.worldToScreen(origin);
  if (!anchorCanvasPosition) return false;
  const axisCandidates = options.getAxisCandidatesAtPosition(origin);
  const activeAxis =
    axisCandidates.find((candidate) => candidate.id === gizmo.activeAxisId) ??
    axisCandidates[0] ??
    null;
  const activeAxisId = activeAxis?.id ?? null;
  const configuredPlane = gizmo.discPlaneNormal;
  const activeDiscPlaneNormal = options.getDiscPlaneNormalAtPosition(origin);
  const fixedDiscPlaneNormal =
    configuredPlane && configuredPlane.lengthSq() > AXIS_NUMERIC_EPSILON
      ? activeDiscPlaneNormal
      : null;

  elementDiv.style.position = "absolute";
  elementDiv.style.left = `${anchorCanvasPosition.x}px`;
  elementDiv.style.top = `${anchorCanvasPosition.y}px`;
  elementDiv.style.transform = "translate(-50%, -50%)";
  elementDiv.style.zIndex = `${MOVE_GIZMO_OVERLAY_Z_INDEX}`;
  elementDiv.style.pointerEvents = "none";
  elementDiv.style.display = "block";

  const outlinesByAxisId = layoutDiscOutlines({
    engine,
    elementDiv,
    origin,
    anchorCanvasPosition,
    axisCandidates,
    activeAxisId,
    fixedDiscPlaneNormal,
    showDisc: options.showDisc,
    discOutlineScreenPixelRadius: options.discOutlineScreenPixelRadius,
    resolveDiscWorldRadiusForFrame: options.resolveDiscWorldRadiusForFrame,
  });
  const activeOutline = activeAxisId
    ? outlinesByAxisId.get(activeAxisId)
    : undefined;
  const arrowPerspectiveScale =
    activeOutline && options.discOutlineScreenPixelRadius > AXIS_NUMERIC_EPSILON
      ? Math.min(
          ARROW_PERSPECTIVE_SCALE_MAX,
          Math.max(
            ARROW_PERSPECTIVE_SCALE_MIN,
            activeOutline.supportRadius / options.discOutlineScreenPixelRadius
          )
        )
      : 1;
  layoutDiscInteractionPath(
    elementDiv.querySelector<SVGPathElement>(
      '[data-point-move-disc-interaction-path="true"]'
    ),
    activeOutline,
    options.showDisc,
    gizmo
  );
  const rotationHandle = elementDiv.querySelector(
    '[data-point-move-disc-rotation-handle="true"]'
  ) as SVGEllipseElement | null;
  if (rotationHandle) {
    if (options.showRotationHandle && options.showDisc && activeOutline) {
      layoutRotationHandle({
        engine,
        gizmo,
        rotationHandle,
        origin,
        anchorCanvasPosition,
        axisCandidates,
        activeAxisId,
        activeOutline,
        activeNormal: (
          fixedDiscPlaneNormal ??
          activeAxis?.direction ??
          getEllipsoidalUpDirectionAtAnchor(origin)
        )
          .clone()
          .normalize(),
        activeAxisColor: activeAxis?.color ?? DISC_OUTLINE_COLOR,
      });
    } else {
      rotationHandle.style.display = "none";
      rotationHandle.removeAttribute("transform");
    }
  }
  axisCandidates.forEach((axisCandidate) =>
    layoutAxis({
      engine,
      gizmo,
      elementDiv,
      origin,
      anchorCanvasPosition,
      axisCandidate,
      activeAxisId,
      activeOutline,
      outlinesByAxisId,
      arrowPerspectiveScale,
      arrowActiveEdgePx: options.arrowActiveEdgePx,
      arrowInactiveEdgePx: options.arrowInactiveEdgePx,
      axisArrowOffsetPx: options.axisArrowOffsetPx,
    })
  );
  const centerHit = elementDiv.querySelector(
    '[data-point-move-axis-center-hit="true"]'
  ) as HTMLElement | null;
  if (centerHit)
    centerHit.style.cursor =
      gizmo.isDragging && gizmo.dragState?.mode === "plane-translate"
        ? "grabbing"
        : options.centerPlaneDragCursor;

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
  return true;
};
