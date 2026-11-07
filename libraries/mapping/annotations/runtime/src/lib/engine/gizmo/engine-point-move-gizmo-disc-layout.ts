import { Vector3 } from "three";

import {
  buildCirclePoints,
  computeCircleSegments,
  createPlaneBasisFromNormal,
  getSupportRadius2d,
  resolveWorldSizeForScreenTarget,
  type Point2,
} from "@carma-commons/math";
import {
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  AXIS_NUMERIC_EPSILON,
  DISC_OUTLINE_BASE_OPACITY,
  DISC_OUTLINE_COLOR,
  DISC_PROJECTION_SCALE_SAMPLE_COUNT,
  PLANE_DRAG_DISC_CURSOR,
  ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
  ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD,
  ROTATION_HANDLE_RADIUS_PX,
  ROTATION_NORMAL_SCREEN_SAMPLE_WORLD,
  toSvgPathD,
} from "@carma-mapping/gizmo/core";
import { PI_OVER_TWO, radToDegNumeric } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";
import {
  getPlanePixelsPerWorldMax,
  projectPlaneOutlinePoints,
} from "./engine-point-move-gizmo-math";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

const MIN_PROJECTED_OUTLINE_POINTS = 12;

export type ProjectedDiscOutline = {
  supportRadius: number;
  pathD: string;
  projectedPoints?: Point2[];
  worldRadius?: number;
  planeBasisX?: Vector3;
  planeBasisY?: Vector3;
  /** Tessellation of the projected outline. */
  segments?: number;
};

/**
 * The disc outline of every axis candidate, projected with the exact world
 * radius of the scene disc; a screen circle when the disc does not project.
 */
export const computeDiscOutlines = ({
  engine,
  origin,
  anchorCanvasPosition,
  axisCandidates,
  fixedDiscPlaneNormal,
  discOutlineScreenPixelRadius,
  resolveDiscWorldRadiusForFrame,
}: {
  engine: AnnotationEngine;
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidates: AnnotationGizmoAxisCandidate[];
  /** The configured disc plane; each candidate's own plane without one. */
  fixedDiscPlaneNormal: Vector3 | null;
  discOutlineScreenPixelRadius: number;
  resolveDiscWorldRadiusForFrame: (
    origin: Vector3,
    planeNormal: Vector3
  ) => number;
}): Map<string, ProjectedDiscOutline> => {
  const outlinesByAxisId = new Map<string, ProjectedDiscOutline>();
  const screenCircle = (): ProjectedDiscOutline => {
    const points = buildCirclePoints(
      discOutlineScreenPixelRadius,
      computeCircleSegments(discOutlineScreenPixelRadius)
    );
    return {
      supportRadius: Math.max(discOutlineScreenPixelRadius, 1),
      pathD: toSvgPathD(points, { close: true, digits: 2 }),
      projectedPoints: points,
    };
  };

  axisCandidates.forEach((planeCandidate) => {
    const planeNormal = fixedDiscPlaneNormal ?? planeCandidate.direction;
    const planeBasis = createPlaneBasisFromNormal(planeNormal);
    const discWorldRadius = resolveDiscWorldRadiusForFrame(origin, planeNormal);
    if (!Number.isFinite(discWorldRadius) || discWorldRadius <= 0) {
      outlinesByAxisId.set(planeCandidate.id, screenCircle());
      return;
    }

    // Tessellated from the apparent screen radius so the outline stays round.
    const pixelPerWorldMax = getPlanePixelsPerWorldMax(
      engine,
      origin,
      planeBasis,
      anchorCanvasPosition,
      DISC_PROJECTION_SCALE_SAMPLE_COUNT
    );
    const outlineScreenRadiusPx =
      pixelPerWorldMax > AXIS_NUMERIC_EPSILON
        ? discWorldRadius * pixelPerWorldMax
        : discOutlineScreenPixelRadius;
    const outlineSegments = computeCircleSegments(outlineScreenRadiusPx);
    const projectedOutlinePoints = projectPlaneOutlinePoints(
      engine,
      origin,
      planeBasis,
      discWorldRadius,
      outlineSegments,
      anchorCanvasPosition
    );
    if (projectedOutlinePoints.length < MIN_PROJECTED_OUTLINE_POINTS) {
      outlinesByAxisId.set(planeCandidate.id, screenCircle());
      return;
    }

    const maxProjectedRadius = getSupportRadius2d(projectedOutlinePoints);
    outlinesByAxisId.set(planeCandidate.id, {
      supportRadius:
        maxProjectedRadius > AXIS_NUMERIC_EPSILON
          ? maxProjectedRadius
          : Math.max(discOutlineScreenPixelRadius, 1),
      pathD: toSvgPathD(projectedOutlinePoints, { close: true, digits: 2 }),
      projectedPoints: projectedOutlinePoints,
      worldRadius: discWorldRadius,
      planeBasisX: planeBasis.xAxis,
      planeBasisY: planeBasis.yAxis,
      segments: outlineSegments,
    });
  });

  return outlinesByAxisId;
};

/** The svg outline of the active disc; the others stay hidden. */
export const applyDiscOutlinePaths = (
  elementDiv: HTMLElement,
  outlinesByAxisId: Map<string, ProjectedDiscOutline>,
  activeAxisId: string | null,
  showDisc: boolean
) => {
  outlinesByAxisId.forEach((outline, axisId) => {
    const discOutlinePath = elementDiv.querySelector(
      `[data-point-move-disc-outline-path="${axisId}"]`
    ) as SVGPathElement | null;
    if (!discOutlinePath) return;
    discOutlinePath.setAttribute("d", outline.pathD);
    discOutlinePath.style.display =
      showDisc && axisId === activeAxisId ? "block" : "none";
    discOutlinePath.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
    discOutlinePath.style.stroke = DISC_OUTLINE_COLOR;
  });
};

/** The transparent hit path over the active disc that starts plane drags. */
export const layoutDiscInteractionPath = (
  discInteractionPath: SVGPathElement | null,
  activeOutline: ProjectedDiscOutline | undefined,
  showDisc: boolean,
  gizmo: PointMoveGizmoState
) => {
  if (!discInteractionPath) return;
  if (showDisc && activeOutline) {
    discInteractionPath.setAttribute("d", activeOutline.pathD);
    discInteractionPath.style.display = "block";
  } else {
    discInteractionPath.style.display = "none";
    discInteractionPath.setAttribute("d", "");
  }
  discInteractionPath.style.cursor =
    gizmo.isDragging && gizmo.dragState?.mode === "plane-translate"
      ? "grabbing"
      : PLANE_DRAG_DISC_CURSOR;
};

export type RotationHandleFrame = {
  /** Centre relative to the anchor and the flat handle ellipse, in pixels. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotationDeg: number;
  color: string;
  /** Centre on the disc rim and the radius of `rx` there; null while the disc has no world radius. */
  centerECEF: Vector3 | null;
  worldRadius: number | null;
  /** Normal of the disc plane the handle lies in, normalized. */
  normal: Vector3;
};

/**
 * The rotation handle on the disc rim, 45° past the first in-plane axis, as
 * an ellipse flattened by how obliquely the disc faces the camera.
 */
export const computeRotationHandle = ({
  engine,
  origin,
  anchorCanvasPosition,
  axisCandidates,
  activeAxisId,
  activeOutline,
  activeNormal,
  activeAxisColor,
}: {
  engine: AnnotationEngine;
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidates: AnnotationGizmoAxisCandidate[];
  activeAxisId: string | null;
  activeOutline: ProjectedDiscOutline;
  /** Normal of the active disc plane, normalized. */
  activeNormal: Vector3;
  activeAxisColor: string;
}): RotationHandleFrame => {
  let handleTargetAngleRad: number = ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD;
  if (activeAxisId && activeOutline.planeBasisX && activeOutline.planeBasisY) {
    const primaryInPlaneAxis = axisCandidates.filter(
      (candidate) => candidate.id !== activeAxisId
    )[0]?.direction;
    if (primaryInPlaneAxis) {
      const projectedX = primaryInPlaneAxis.dot(activeOutline.planeBasisX);
      const projectedY = primaryInPlaneAxis.dot(activeOutline.planeBasisY);
      if (Math.hypot(projectedX, projectedY) > AXIS_NUMERIC_EPSILON) {
        handleTargetAngleRad =
          Math.atan2(projectedY, projectedX) +
          ROTATION_HANDLE_OFFSET_FROM_DISC_ZERO_RAD;
      }
    }
  }

  const handleDirX = Math.cos(handleTargetAngleRad);
  const handleDirY = Math.sin(handleTargetAngleRad);
  let x = handleDirX * activeOutline.supportRadius;
  let y = handleDirY * activeOutline.supportRadius;
  let centerECEF: Vector3 | null = null;
  if (
    activeOutline.worldRadius !== undefined &&
    activeOutline.planeBasisX &&
    activeOutline.planeBasisY
  ) {
    centerECEF = origin
      .clone()
      .addScaledVector(
        activeOutline.planeBasisX,
        handleDirX * activeOutline.worldRadius
      )
      .addScaledVector(
        activeOutline.planeBasisY,
        handleDirY * activeOutline.worldRadius
      );
    const projectedHandlePoint = engine.worldToScreen(centerECEF);
    if (projectedHandlePoint) {
      x = projectedHandlePoint.x - anchorCanvasPosition.x;
      y = projectedHandlePoint.y - anchorCanvasPosition.y;
    }
  }

  const cameraPositionECEF = engine.getCameraPositionECEF();
  const facingFactor = cameraPositionECEF
    ? Math.abs(
        activeNormal.dot(
          new Vector3().subVectors(cameraPositionECEF, origin).normalize()
        )
      )
    : 1;

  const normalTipCanvas = engine.worldToScreen(
    origin
      .clone()
      .addScaledVector(activeNormal, ROTATION_NORMAL_SCREEN_SAMPLE_WORLD)
  );
  let rotationDeg = 0;
  if (normalTipCanvas) {
    const normalDx = normalTipCanvas.x - anchorCanvasPosition.x;
    const normalDy = normalTipCanvas.y - anchorCanvasPosition.y;
    if (Math.hypot(normalDx, normalDy) > AXIS_NUMERIC_EPSILON) {
      rotationDeg = radToDegNumeric(
        Math.atan2(normalDy, normalDx) - PI_OVER_TWO
      );
    }
  }

  const pixelsPerMeter = centerECEF
    ? engine.getScreenPixelsPerMeterAt(centerECEF)
    : 0;
  return {
    x,
    y,
    rx: ROTATION_HANDLE_RADIUS_PX,
    ry: Math.max(
      ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
      ROTATION_HANDLE_RADIUS_PX * facingFactor
    ),
    rotationDeg,
    color: activeAxisColor,
    centerECEF,
    worldRadius:
      pixelsPerMeter > AXIS_NUMERIC_EPSILON
        ? resolveWorldSizeForScreenTarget({
            targetScreenPx: ROTATION_HANDLE_RADIUS_PX,
            pixelPerWorld: pixelsPerMeter,
            quantize: false,
          })
        : null,
    normal: activeNormal,
  };
};

/** The svg ellipse of the rotation handle: drawn without scene primitives, else only the hit area. */
export const applyRotationHandle = (
  rotationHandle: SVGEllipseElement,
  handle: RotationHandleFrame | null,
  gizmo: PointMoveGizmoState
) => {
  if (!handle) {
    rotationHandle.style.display = "none";
    rotationHandle.removeAttribute("transform");
    return;
  }
  const { x, y } = handle;
  rotationHandle.setAttribute("cx", `${x}`);
  rotationHandle.setAttribute("cy", `${y}`);
  rotationHandle.setAttribute("rx", `${handle.rx}`);
  rotationHandle.setAttribute("ry", `${handle.ry}`);
  rotationHandle.setAttribute("fill", handle.color);
  rotationHandle.setAttribute("stroke", DISC_OUTLINE_COLOR);
  rotationHandle.setAttribute(
    "stroke-width",
    `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`
  );
  rotationHandle.setAttribute(
    "transform",
    `rotate(${handle.rotationDeg} ${x} ${y})`
  );
  rotationHandle.style.cursor =
    gizmo.isDragging && gizmo.dragState?.mode === "rotate"
      ? "grabbing"
      : "grab";
  rotationHandle.style.display = "block";
};
