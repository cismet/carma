import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma-cesium";
const { POINT: ANNOTATION_TYPE_POINT, POLYLINE: ANNOTATION_TYPE_POLYLINE } =
  ANNOTATION_TYPES;

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

export type MoveGizmoSession = {
  pointId: string | null;
  axisDirection: Cartesian3 | null;
  axisTitle: string | null;
  axisCandidates: MoveGizmoAxisCandidate[] | null;
  preferredAxisId: string | null;
  verticalOffsetEditMode: MoveGizmoVerticalOffsetEditMode;
  verticalOffsetNodeChainAnnotationId: string | null;
  isDragging: boolean;
};

export type MoveGizmoStartOptions = {
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: MoveGizmoAxisCandidate[] | null;
  verticalOffsetEditMode?: MoveGizmoVerticalOffsetEditMode;
  verticalOffsetNodeChainAnnotationId?: string | null;
};
