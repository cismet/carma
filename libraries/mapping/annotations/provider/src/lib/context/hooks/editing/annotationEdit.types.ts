import type { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";

export type AnnotationEditTarget =
  | { kind: "point"; pointId: string }
  | { kind: "point-label"; pointId: string }
  | { kind: "point-vertical-offset-stem"; pointId: string };

export type AnnotationEditUpdateTarget = {
  kind: "point-elevation-reference";
  pointId: string;
};

export type MoveGizmoAxisCandidate = {
  id: string;
  direction: Cartesian3;
  color?: string;
  title?: string | null;
};

export type MoveGizmoVerticalOffsetEditMode =
  | typeof ANNOTATION_TYPE_POINT
  | typeof ANNOTATION_TYPE_POLYLINE
  | null;

export type MoveGizmoStartOptions = {
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: MoveGizmoAxisCandidate[] | null;
  verticalOffsetEditMode?: MoveGizmoVerticalOffsetEditMode;
  verticalOffsetPlanarMeasurementId?: string | null;
};
