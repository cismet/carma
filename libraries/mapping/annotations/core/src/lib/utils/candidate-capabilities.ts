import {
  ANNOTATION_CANDIDATE_KINDS,
  type AnnotationCandidateKind,
} from "../types/annotation-candidate";
import { hasSignificantVerticalOffsetMeters } from "./annotation-geometry-defaults";

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
  const isPolylineCandidateMode = kind === ANNOTATION_CANDIDATE_KINDS.POLYLINE;
  const isVerticalPolygonCandidate =
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_VERTICAL;
  const hasCandidateNode = kind !== ANNOTATION_CANDIDATE_KINDS.NONE;
  const candidateSupportsEdgeLine =
    kind === ANNOTATION_CANDIDATE_KINDS.DISTANCE ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYLINE ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_PLANAR ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_VERTICAL;
  const candidateUsesPolylineEdgeRules =
    kind === ANNOTATION_CANDIDATE_KINDS.POLYLINE ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_PLANAR;
  const candidateForcesDirectEdgeLine =
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_GROUND ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_PLANAR ||
    kind === ANNOTATION_CANDIDATE_KINDS.POLYGON_VERTICAL;

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
  kind === ANNOTATION_CANDIDATE_KINDS.POINT &&
  hasSignificantVerticalOffsetMeters(verticalOffsetMeters);
