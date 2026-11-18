import { Matrix4, Vector3 } from "three";

import { ecefToEnuMatrix } from "@carma-geo/proj";
import {
  getDefaultAxisPresentation,
  getEnabledDefaultAxisPresentation,
  isDefaultAxisEnabled,
  SECONDARY_AXIS_COLOR,
  type PointMoveGizmoDefaultAxisId,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoLabels,
} from "@carma-mapping/annotations/core";

const DEFAULT_AXIS_ENU_MATRIX_SCRATCH = new Matrix4();

const getDefaultAxisCandidatesAtPosition = (
  origin: Vector3,
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
): AnnotationGizmoAxisCandidate[] => {
  // The columns of the inverted ECEF → ENU frame are east, north and up.
  const eastDirection = new Vector3();
  const northDirection = new Vector3();
  const upDirection = new Vector3();
  ecefToEnuMatrix(origin, DEFAULT_AXIS_ENU_MATRIX_SCRATCH)
    .invert()
    .extractBasis(eastDirection, northDirection, upDirection);
  const directionsByAxisId: Record<PointMoveGizmoDefaultAxisId, Vector3> = {
    vertical: upDirection.normalize(),
    "horizontal-east": eastDirection.normalize(),
    "horizontal-north": northDirection.normalize(),
  };

  return getDefaultAxisPresentation(labels, axisTitle).map(
    (axisDefinition) => ({
      ...axisDefinition,
      direction: directionsByAxisId[axisDefinition.id],
    })
  );
};

/** The ENU axes at the origin that tools currently enable. */
export const getEnabledDefaultAxisCandidatesAtPosition = (
  origin: Vector3,
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
): AnnotationGizmoAxisCandidate[] =>
  getDefaultAxisCandidatesAtPosition(origin, labels, axisTitle).filter(
    (candidate) => isDefaultAxisEnabled(candidate.id)
  );

const OVERLAY_UNIT_DIRECTIONS: Record<PointMoveGizmoDefaultAxisId, Vector3> = {
  vertical: new Vector3(0, 0, 1),
  "horizontal-east": new Vector3(1, 0, 0),
  "horizontal-north": new Vector3(0, 1, 0),
};

/** The candidates the overlay markup is built for; directions are placeholders. */
export const getOverlayAxisCandidates = (
  axisCandidates: AnnotationGizmoAxisCandidate[] | null,
  labels: AnnotationGizmoLabels,
  axisTitle: string | null
): AnnotationGizmoAxisCandidate[] =>
  axisCandidates && axisCandidates.length > 0
    ? axisCandidates.map((candidate) => ({
        ...candidate,
        color: candidate.color ?? SECONDARY_AXIS_COLOR,
      }))
    : getEnabledDefaultAxisPresentation(labels, axisTitle).map(
        (axisDefinition) => ({
          ...axisDefinition,
          direction: OVERLAY_UNIT_DIRECTIONS[axisDefinition.id],
        })
      );
