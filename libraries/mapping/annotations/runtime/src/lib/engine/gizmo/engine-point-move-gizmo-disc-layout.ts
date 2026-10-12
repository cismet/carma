import { Vector3 } from "three";

import {
  buildCirclePoints,
  computeCircleSegments,
  createPlaneBasisFromNormal,
  getSupportRadius2d,
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
};

const showDiscOutlinePath = (
  discOutlinePath: SVGPathElement,
  pathD: string,
  visible: boolean
) => {
  discOutlinePath.setAttribute("d", pathD);
  discOutlinePath.style.display = visible ? "block" : "none";
  discOutlinePath.style.opacity = `${DISC_OUTLINE_BASE_OPACITY}`;
  discOutlinePath.style.stroke = DISC_OUTLINE_COLOR;
};

/**
 * Projects the disc outline of every axis candidate into its svg path, with
 * the exact world radius of the scene disc; only the active axis shows. Falls
 * back to a screen circle when the disc does not project.
 */
export const layoutDiscOutlines = ({
  engine,
  elementDiv,
  origin,
  anchorCanvasPosition,
  axisCandidates,
  activeAxisId,
  fixedDiscPlaneNormal,
  showDisc,
  discOutlineScreenPixelRadius,
  resolveDiscWorldRadiusForFrame,
}: {
  engine: AnnotationEngine;
  elementDiv: HTMLElement;
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidates: AnnotationGizmoAxisCandidate[];
  activeAxisId: string | null;
  /** The configured disc plane; each candidate's own plane without one. */
  fixedDiscPlaneNormal: Vector3 | null;
  showDisc: boolean;
  discOutlineScreenPixelRadius: number;
  resolveDiscWorldRadiusForFrame: (
    origin: Vector3,
    planeNormal: Vector3
  ) => number;
}): Map<string, ProjectedDiscOutline> => {
  const outlinesByAxisId = new Map<string, ProjectedDiscOutline>();

  axisCandidates.forEach((planeCandidate) => {
    const discOutlinePath = elementDiv.querySelector(
      `[data-point-move-disc-outline-path="${planeCandidate.id}"]`
    ) as SVGPathElement | null;
    if (!discOutlinePath) return;

    const isVisible =
      showDisc && activeAxisId !== null && planeCandidate.id === activeAxisId;
    const showFallbackCenteredCircle = () => {
      const fallbackPoints = buildCirclePoints(
        discOutlineScreenPixelRadius,
        computeCircleSegments(discOutlineScreenPixelRadius)
      );
      const fallbackPathD = toSvgPathD(fallbackPoints, {
        close: true,
        digits: 2,
      });
      outlinesByAxisId.set(planeCandidate.id, {
        supportRadius: Math.max(discOutlineScreenPixelRadius, 1),
        pathD: fallbackPathD,
        projectedPoints: fallbackPoints,
      });
      showDiscOutlinePath(discOutlinePath, fallbackPathD, isVisible);
    };

    const planeNormal = fixedDiscPlaneNormal ?? planeCandidate.direction;
    const planeBasis = createPlaneBasisFromNormal(planeNormal);
    const discWorldRadius = resolveDiscWorldRadiusForFrame(origin, planeNormal);
    if (!Number.isFinite(discWorldRadius) || discWorldRadius <= 0) {
      showFallbackCenteredCircle();
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
    const projectedOutlinePoints = projectPlaneOutlinePoints(
      engine,
      origin,
      planeBasis,
      discWorldRadius,
      computeCircleSegments(outlineScreenRadiusPx),
      anchorCanvasPosition
    );
    if (projectedOutlinePoints.length < MIN_PROJECTED_OUTLINE_POINTS) {
      showFallbackCenteredCircle();
      return;
    }

    const maxProjectedRadius = getSupportRadius2d(projectedOutlinePoints);
    const pathD = toSvgPathD(projectedOutlinePoints, {
      close: true,
      digits: 2,
    });
    outlinesByAxisId.set(planeCandidate.id, {
      supportRadius:
        maxProjectedRadius > AXIS_NUMERIC_EPSILON
          ? maxProjectedRadius
          : Math.max(discOutlineScreenPixelRadius, 1),
      pathD,
      projectedPoints: projectedOutlinePoints,
      worldRadius: discWorldRadius,
      planeBasisX: planeBasis.xAxis,
      planeBasisY: planeBasis.yAxis,
    });
    showDiscOutlinePath(discOutlinePath, pathD, isVisible);
  });

  return outlinesByAxisId;
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

/**
 * The rotation handle on the disc rim, 45° past the first in-plane axis, as
 * an ellipse flattened by how obliquely the disc faces the camera.
 */
export const layoutRotationHandle = ({
  engine,
  gizmo,
  rotationHandle,
  origin,
  anchorCanvasPosition,
  axisCandidates,
  activeAxisId,
  activeOutline,
  activeNormal,
  activeAxisColor,
}: {
  engine: AnnotationEngine;
  gizmo: PointMoveGizmoState;
  rotationHandle: SVGEllipseElement;
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidates: AnnotationGizmoAxisCandidate[];
  activeAxisId: string | null;
  activeOutline: ProjectedDiscOutline;
  /** Normal of the active disc plane, normalized. */
  activeNormal: Vector3;
  activeAxisColor: string;
}) => {
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
  let handleX = handleDirX * activeOutline.supportRadius;
  let handleY = handleDirY * activeOutline.supportRadius;
  if (
    activeOutline.worldRadius !== undefined &&
    activeOutline.planeBasisX &&
    activeOutline.planeBasisY
  ) {
    const projectedHandlePoint = engine.worldToScreen(
      origin
        .clone()
        .addScaledVector(
          activeOutline.planeBasisX,
          handleDirX * activeOutline.worldRadius
        )
        .addScaledVector(
          activeOutline.planeBasisY,
          handleDirY * activeOutline.worldRadius
        )
    );
    if (projectedHandlePoint) {
      handleX = projectedHandlePoint.x - anchorCanvasPosition.x;
      handleY = projectedHandlePoint.y - anchorCanvasPosition.y;
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
  const minorRadius = Math.max(
    ROTATION_HANDLE_MIN_MINOR_RADIUS_PX,
    ROTATION_HANDLE_RADIUS_PX * facingFactor
  );

  const normalTipCanvas = engine.worldToScreen(
    origin
      .clone()
      .addScaledVector(activeNormal, ROTATION_NORMAL_SCREEN_SAMPLE_WORLD)
  );
  let ellipseRotationDeg = 0;
  if (normalTipCanvas) {
    const normalDx = normalTipCanvas.x - anchorCanvasPosition.x;
    const normalDy = normalTipCanvas.y - anchorCanvasPosition.y;
    if (Math.hypot(normalDx, normalDy) > AXIS_NUMERIC_EPSILON) {
      ellipseRotationDeg = radToDegNumeric(
        Math.atan2(normalDy, normalDx) - PI_OVER_TWO
      );
    }
  }

  rotationHandle.setAttribute("cx", `${handleX}`);
  rotationHandle.setAttribute("cy", `${handleY}`);
  rotationHandle.setAttribute("rx", `${ROTATION_HANDLE_RADIUS_PX}`);
  rotationHandle.setAttribute("ry", `${minorRadius}`);
  rotationHandle.setAttribute("fill", activeAxisColor);
  rotationHandle.setAttribute("stroke", DISC_OUTLINE_COLOR);
  rotationHandle.setAttribute(
    "stroke-width",
    `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`
  );
  rotationHandle.setAttribute(
    "transform",
    `rotate(${ellipseRotationDeg} ${handleX} ${handleY})`
  );
  rotationHandle.style.cursor =
    gizmo.isDragging && gizmo.dragState?.mode === "rotate"
      ? "grabbing"
      : "grab";
  rotationHandle.style.display = "block";
};
