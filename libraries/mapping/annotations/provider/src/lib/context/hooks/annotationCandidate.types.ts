export const ANNOTATION_CANDIDATE_KIND_NONE = "none";
export const ANNOTATION_CANDIDATE_KIND_POINT = "point";
export const ANNOTATION_CANDIDATE_KIND_DISTANCE = "distance";
export const ANNOTATION_CANDIDATE_KIND_POLYLINE = "polyline";
export const ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND = "polygon-ground";
export const ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR = "polygon-planar";
export const ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL = "polygon-vertical";

export type AnnotationCandidateKind =
  | typeof ANNOTATION_CANDIDATE_KIND_NONE
  | typeof ANNOTATION_CANDIDATE_KIND_POINT
  | typeof ANNOTATION_CANDIDATE_KIND_DISTANCE
  | typeof ANNOTATION_CANDIDATE_KIND_POLYLINE
  | typeof ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND
  | typeof ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR
  | typeof ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL;

export type AnnotationCandidateDescriptor = {
  kind: AnnotationCandidateKind;
  verticalOffsetMeters: number;
  verticalPolygonContext?: {
    groupId: string;
    firstNodeId: string;
  };
};
