import { Matrix4, Vector3 } from "three";

import { ecefToEnuMatrix } from "@carma-geo/proj";

import type {
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoLabels,
} from "../annotation-engine.types";
import {
  ENU_EAST_AXIS_COLOR,
  ENU_NORTH_AXIS_COLOR,
  ENU_UP_AXIS_COLOR,
  SECONDARY_AXIS_COLOR,
} from "./engine-point-move-gizmo-constants";

const DEFAULT_AXIS_PRESENTATION = [
  { id: "vertical", color: ENU_UP_AXIS_COLOR, labelKey: "verticalAxis" },
  { id: "horizontal-east", color: ENU_EAST_AXIS_COLOR, labelKey: "eastAxis" },
  {
    id: "horizontal-north",
    color: ENU_NORTH_AXIS_COLOR,
    labelKey: "northAxis",
  },
] as const;

type DefaultAxisId = (typeof DEFAULT_AXIS_PRESENTATION)[number]["id"];

// Keep the full ENU presentation available while tools expose height only.
const DEFAULT_ENABLED_AXIS_IDS: readonly string[] = ["vertical"];

const isDefaultAxisEnabled = (axisId: string): boolean =>
  DEFAULT_ENABLED_AXIS_IDS.includes(axisId);

const DEFAULT_AXIS_ENU_MATRIX_SCRATCH = new Matrix4();

const getDefaultAxisPresentation = (
  labels: AnnotationGizmoLabels,
  axisTitle?: string | null
) =>
  DEFAULT_AXIS_PRESENTATION.map((axisDefinition) => ({
    id: axisDefinition.id,
    color: axisDefinition.color,
    title:
      axisDefinition.id === "vertical" && axisTitle
        ? axisTitle
        : labels[axisDefinition.labelKey],
  }));

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
  const directionsByAxisId: Record<DefaultAxisId, Vector3> = {
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

const OVERLAY_UNIT_DIRECTIONS: Record<DefaultAxisId, Vector3> = {
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
    : getDefaultAxisPresentation(labels, axisTitle)
        .filter((axisDefinition) => isDefaultAxisEnabled(axisDefinition.id))
        .map((axisDefinition) => ({
          ...axisDefinition,
          direction: OVERLAY_UNIT_DIRECTIONS[axisDefinition.id],
        }));
