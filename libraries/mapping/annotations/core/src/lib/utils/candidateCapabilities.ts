import {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  type AnnotationCandidateKind,
} from "../types/annotationCandidate";

export type AnnotationCandidateCapabilities = {
  isPolylineCandidateMode: boolean;
  hasCandidateNode: boolean;
  candidateSupportsEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  candidateForcesDirectEdgeLine: boolean;
  isVerticalPolygonCandidate: boolean;
};

export const resolveCandidateCapabilities = (
  kind: AnnotationCandidateKind
): AnnotationCandidateCapabilities => {
  const isPolylineCandidateMode = kind === ANNOTATION_CANDIDATE_KIND_POLYLINE;
  const isVerticalPolygonCandidate =
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL;
  const hasCandidateNode = kind !== ANNOTATION_CANDIDATE_KIND_NONE;
  const candidateSupportsEdgeLine =
    kind === ANNOTATION_CANDIDATE_KIND_DISTANCE ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYLINE ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL;
  const candidateUsesPolylineEdgeRules =
    kind === ANNOTATION_CANDIDATE_KIND_POLYLINE ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR;
  const candidateForcesDirectEdgeLine =
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR ||
    kind === ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL;

  return {
    isPolylineCandidateMode,
    hasCandidateNode,
    candidateSupportsEdgeLine,
    candidateUsesPolylineEdgeRules,
    candidateForcesDirectEdgeLine,
    isVerticalPolygonCandidate,
  };
};

export const hasPointCandidateOffsetStem = (
  kind: AnnotationCandidateKind,
  verticalOffsetMeters: number
): boolean =>
  kind === ANNOTATION_CANDIDATE_KIND_POINT &&
  Math.abs(verticalOffsetMeters) > 1e-9;
