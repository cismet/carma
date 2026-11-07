import type { Vector3 } from "three";
import {
  createPlaneBasisFromNormal,
  normalizeVector3Direction,
} from "@carma-commons/math";

import type { AnnotationGizmoAxisCandidate } from "@carma-mapping/annotations/core";
import { POINT_EDITING_GIZMO_DEFAULTS } from "./point-editing-gizmo-defaults";

export type MoveGizmoAxisOverride = {
  axisDirection: Vector3;
  axisTitle: string;
  preferredAxisId: string;
  axisCandidates: AnnotationGizmoAxisCandidate[];
};

/** The gizmo axes of a clicked reference edge: along it, and the two orthogonal to it. */
export const createReferenceLineAxisOverride = (
  lineDirection: Vector3
): MoveGizmoAxisOverride | null => {
  const normalizedLineDirection = normalizeVector3Direction(lineDirection);
  if (!normalizedLineDirection) {
    return null;
  }

  const planeBasis = createPlaneBasisFromNormal(normalizedLineDirection);
  const { primary, secondary, tertiary } =
    POINT_EDITING_GIZMO_DEFAULTS.referenceLineAxis;

  return {
    axisDirection: normalizedLineDirection,
    axisTitle: primary.title,
    preferredAxisId: primary.id,
    axisCandidates: [
      {
        id: primary.id,
        direction: normalizedLineDirection,
        color: primary.color,
        title: primary.title,
      },
      {
        id: secondary.id,
        direction: planeBasis.xAxis,
        color: secondary.color,
        title: secondary.title,
      },
      {
        id: tertiary.id,
        direction: planeBasis.yAxis,
        color: tertiary.color,
        title: tertiary.title,
      },
    ],
  };
};
