import type { Vector3 } from "three";

import {
  getAxisSampleWorldStep,
  getEquilateralTriangleHeight,
  getEquilateralTriangleViewBox,
  negativePiToPi,
  type Point2,
} from "@carma-commons/math";
import {
  ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER,
  AXIS_NUMERIC_EPSILON,
  AXIS_SCREEN_SAMPLE_MAX_WORLD,
  AXIS_SCREEN_SAMPLE_MIN_WORLD,
  AXIS_SCREEN_SAMPLE_TARGET_PX,
  INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER,
  INACTIVE_AXIS_OPACITY,
  updateTrianglePathAppearance,
} from "@carma-mapping/gizmo/core";
import { MINUS_PI_OVER_TWO, PI, PI_OVER_TWO } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";
import type { ProjectedDiscOutline } from "./engine-point-move-gizmo-disc-layout";
import {
  applyConeArrowSilhouette,
  placeArrowTipDot,
} from "./engine-point-move-gizmo-dom";
import {
  projectConeArrowGeometry,
  resolveConeArrowGeometry,
  type ConeArrowGeometry,
} from "./engine-point-move-gizmo-cone";
import type {
  AxisScreenDirection,
  PointMoveGizmoState,
} from "./engine-point-move-gizmo-state";

const MIN_AXIS_SCREEN_VECTOR_PX = 0.001;
/** Shorter projected axes keep their previous screen direction. */
const STABLE_AXIS_SCREEN_VECTOR_PX = 6;
const MIN_ARROW_ANCHOR_DISTANCE_PX = 20;

/**
 * Screen direction of the axis through the anchor, kept on the side of its
 * previous direction so the arrows never flip while the camera moves.
 */
const resolveAxisScreenDirection = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  origin: Vector3,
  anchorCanvasPosition: Point2,
  axisCandidate: AnnotationGizmoAxisCandidate,
  unitAxisSampleCanvas: Point2 | null
): AxisScreenDirection => {
  const previous = gizmo.axisScreenDirection[axisCandidate.id] ?? null;
  const resolved: AxisScreenDirection = {
    angleRad: previous?.angleRad ?? MINUS_PI_OVER_TWO,
    x: previous?.x ?? 0,
    y: previous?.y ?? -1,
  };

  const sampleWorldStep = getAxisSampleWorldStep(
    unitAxisSampleCanvas
      ? Math.hypot(
          unitAxisSampleCanvas.x - anchorCanvasPosition.x,
          unitAxisSampleCanvas.y - anchorCanvasPosition.y
        )
      : 0,
    AXIS_SCREEN_SAMPLE_TARGET_PX,
    AXIS_SCREEN_SAMPLE_MIN_WORLD,
    AXIS_SCREEN_SAMPLE_MAX_WORLD
  );
  if (sampleWorldStep <= 0) return resolved;

  const plusCanvas = engine.worldToScreen(
    origin.clone().addScaledVector(axisCandidate.direction, sampleWorldStep)
  );
  const minusCanvas = engine.worldToScreen(
    origin.clone().addScaledVector(axisCandidate.direction, -sampleWorldStep)
  );
  let dx = 0;
  let dy = 0;
  if (plusCanvas && minusCanvas) {
    dx = plusCanvas.x - minusCanvas.x;
    dy = plusCanvas.y - minusCanvas.y;
  } else if (plusCanvas) {
    dx = plusCanvas.x - anchorCanvasPosition.x;
    dy = plusCanvas.y - anchorCanvasPosition.y;
  } else if (minusCanvas) {
    dx = anchorCanvasPosition.x - minusCanvas.x;
    dy = anchorCanvasPosition.y - minusCanvas.y;
  }

  const vectorLength = Math.hypot(dx, dy);
  if (vectorLength <= MIN_AXIS_SCREEN_VECTOR_PX) return resolved;
  if (vectorLength < STABLE_AXIS_SCREEN_VECTOR_PX && previous) {
    return { x: previous.x, y: previous.y, angleRad: previous.angleRad };
  }

  let next: AxisScreenDirection = {
    x: dx / vectorLength,
    y: dy / vectorLength,
    angleRad: Math.atan2(dy, dx),
  };
  if (previous && next.x * previous.x + next.y * previous.y < 0) {
    next = {
      x: next.x * -1,
      y: next.y * -1,
      angleRad: negativePiToPi(next.angleRad + PI),
    };
  }
  gizmo.axisScreenDirection[axisCandidate.id] = next;
  return next;
};

/** Distance of the arrow bases from the anchor: just outside the discs, frozen while rotating. */
const resolveArrowAnchorDistancePx = (
  gizmo: PointMoveGizmoState,
  axisCandidateId: string,
  activeAxisId: string | null,
  activeOutline: ProjectedDiscOutline | undefined,
  outlinesByAxisId: Map<string, ProjectedDiscOutline>,
  axisArrowOffsetPx: number
): number => {
  let distancePx = axisArrowOffsetPx;
  if (outlinesByAxisId.size > 0 && activeAxisId) {
    let supportDistance = 0;
    if (axisCandidateId === activeAxisId) {
      outlinesByAxisId.forEach((outline, outlineAxisId) => {
        if (outlineAxisId === activeAxisId) return;
        if (outline.supportRadius > supportDistance) {
          supportDistance = outline.supportRadius;
        }
      });
      // No other in-plane disc to clear: sit just outside our own disc.
      if (supportDistance <= AXIS_NUMERIC_EPSILON) {
        supportDistance = activeOutline?.supportRadius ?? 0;
      }
    } else if (activeOutline) {
      supportDistance = activeOutline.supportRadius;
    }

    if (supportDistance > AXIS_NUMERIC_EPSILON) {
      const multiplier =
        axisCandidateId === activeAxisId
          ? ACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER
          : INACTIVE_AXIS_ANCHOR_RADIUS_MULTIPLIER;
      distancePx = Math.max(
        supportDistance * multiplier,
        MIN_ARROW_ANCHOR_DISTANCE_PX
      );
    }
  }

  if (gizmo.dragState?.mode === "rotate") {
    const cachedDistance = gizmo.axisAnchorDistance[axisCandidateId];
    if (Number.isFinite(cachedDistance) && cachedDistance > 0) {
      return cachedDistance;
    }
  }
  gizmo.axisAnchorDistance[axisCandidateId] = distancePx;
  return distancePx;
};

export type PointMoveGizmoAxisFrame = {
  candidate: AnnotationGizmoAxisCandidate;
  opacity: number;
  /** Screen direction of the "up" arrow, kept from flipping. */
  screenDirection: AxisScreenDirection;
  /** Distance of the arrow bases from the anchor on screen. */
  offsetPx: number;
  edgePx: number;
  heightPx: number;
  /** World cones of the arrows along and against `screenDirection`. */
  arrows: { up: ConeArrowGeometry | null; down: ConeArrowGeometry | null };
};

/** Screen layout and world cones of one axis candidate's line and arrows. */
export const computeAxisFrame = ({
  engine,
  gizmo,
  origin,
  anchorCanvasPosition,
  axisCandidate,
  activeAxisId,
  activeOutline,
  outlinesByAxisId,
  arrowPerspectiveScale,
  arrowActiveEdgePx,
  arrowInactiveEdgePx,
  axisArrowOffsetPx,
  cameraPosition,
}: {
  engine: AnnotationEngine;
  gizmo: PointMoveGizmoState;
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidate: AnnotationGizmoAxisCandidate;
  activeAxisId: string | null;
  activeOutline: ProjectedDiscOutline | undefined;
  outlinesByAxisId: Map<string, ProjectedDiscOutline>;
  arrowPerspectiveScale: number;
  arrowActiveEdgePx: number;
  arrowInactiveEdgePx: number;
  axisArrowOffsetPx: number;
  cameraPosition: Vector3 | null;
}): PointMoveGizmoAxisFrame => {
  const unitAxisSampleCanvas = engine.worldToScreen(
    origin.clone().add(axisCandidate.direction)
  );
  const screenDirection = resolveAxisScreenDirection(
    engine,
    gizmo,
    origin,
    anchorCanvasPosition,
    axisCandidate,
    unitAxisSampleCanvas
  );
  const isActiveAxis = gizmo.activeAxisId === axisCandidate.id;
  const edgePx = Math.max(
    1,
    (isActiveAxis ? arrowActiveEdgePx : arrowInactiveEdgePx) *
      arrowPerspectiveScale
  );
  const heightPx = getEquilateralTriangleHeight(edgePx);
  const offsetPx = resolveArrowAnchorDistancePx(
    gizmo,
    axisCandidate.id,
    activeAxisId,
    activeOutline,
    outlinesByAxisId,
    axisArrowOffsetPx
  );

  // The cones sit on the world axis whose screen direction the flat layout
  // uses, which may be flipped to keep that direction stable.
  const worldAxisSign =
    unitAxisSampleCanvas &&
    (unitAxisSampleCanvas.x - anchorCanvasPosition.x) * screenDirection.x +
      (unitAxisSampleCanvas.y - anchorCanvasPosition.y) * screenDirection.y <
      0
      ? -1
      : 1;
  const arrow = (sign: 1 | -1) =>
    cameraPosition
      ? resolveConeArrowGeometry({
          project: (world) => engine.worldToScreen(world),
          origin,
          direction: axisCandidate.direction
            .clone()
            .multiplyScalar(worldAxisSign * sign),
          offsetPx,
          edgePx,
          heightPx,
          anchorCanvasPosition,
          cameraPosition,
        })
      : null;

  return {
    candidate: axisCandidate,
    opacity: isActiveAxis ? 1 : INACTIVE_AXIS_OPACITY,
    screenDirection,
    offsetPx,
    edgePx,
    heightPx,
    arrows: { up: arrow(1), down: arrow(-1) },
  };
};

/**
 * The overlay elements of one axis: the line and the flat arrows swapped for
 * their cone silhouettes. With `hitOnly` the scene draws them; the arrows
 * stay as transparent hit areas.
 */
export const applyAxisElements = ({
  engine,
  gizmo,
  elementDiv,
  anchorCanvasPosition,
  axis,
  hitOnly,
}: {
  engine: AnnotationEngine;
  gizmo: PointMoveGizmoState;
  elementDiv: HTMLElement;
  anchorCanvasPosition: Point2;
  axis: PointMoveGizmoAxisFrame;
  hitOnly: boolean;
}) => {
  const { candidate, screenDirection, offsetPx, edgePx, heightPx } = axis;
  const opacity = hitOnly ? 0 : axis.opacity;
  const axisLine = elementDiv.querySelector(
    `[data-point-move-axis-line="${candidate.id}"]`
  ) as HTMLElement | null;
  if (axisLine) {
    axisLine.style.width = `${offsetPx * 2}px`;
    axisLine.style.transform = `translate(-50%, -50%) rotate(${screenDirection.angleRad}rad)`;
    axisLine.style.opacity = `${opacity}`;
  }

  const layoutArrow = (side: "up" | "down", sign: 1 | -1) => {
    const arrow = elementDiv.querySelector(
      `[data-point-move-axis-arrow-${side}="${candidate.id}"]`
    ) as HTMLElement | null;
    if (!arrow) return;
    arrow.setAttribute("viewBox", getEquilateralTriangleViewBox(edgePx));
    arrow.style.width = `${edgePx}px`;
    arrow.style.height = `${heightPx}px`;
    arrow.style.left = `calc(50% + ${sign * screenDirection.x * offsetPx}px)`;
    arrow.style.top = `calc(50% + ${sign * screenDirection.y * offsetPx}px)`;
    arrow.style.transformOrigin = "50% 100%";
    const rotationRad =
      screenDirection.angleRad + PI_OVER_TWO + (sign > 0 ? 0 : PI);
    arrow.style.transform = `translate(-50%, -100%) rotate(${rotationRad}rad)`;
    arrow.style.opacity = `${opacity}`;
    arrow.style.cursor = gizmo.isDragging ? "grabbing" : "move";
    updateTrianglePathAppearance(
      arrow.querySelector(
        "[data-point-move-axis-arrow-outline]"
      ) as SVGPathElement | null,
      edgePx
    );
    placeArrowTipDot(arrow, { x: edgePx / 2, y: 0 });
    const geometry = axis.arrows[side];
    applyConeArrowSilhouette(
      arrow,
      geometry
        ? projectConeArrowGeometry(
            geometry,
            (world) => engine.worldToScreen(world),
            anchorCanvasPosition
          )
        : null
    );
  };
  layoutArrow("up", 1);
  layoutArrow("down", -1);
};
