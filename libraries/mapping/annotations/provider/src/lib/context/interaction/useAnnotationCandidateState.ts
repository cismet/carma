import { type Dispatch, type SetStateAction } from "react";

import { Cartesian2, Cartesian3, type Scene } from "@carma/cesium";

import {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  resolveCandidateCapabilities,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationCollection,
  AnnotationCandidateDescriptor,
  NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import { useAnnotationCursorState } from "./useAnnotationCursorState";
import { useVerticalPolygonCandidate } from "./candidate/useVerticalPolygonCandidate";

export {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  type AnnotationCandidateDescriptor,
} from "@carma-mapping/annotations/core";

type UseAnnotationCandidateStateParams = {
  pointQueryEnabled: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
};

type UseAnnotationCandidateStateResult = {
  activeCandidateNodeECEF: Cartesian3 | null;
  cursorScreenPosition: { x: number; y: number } | null;
  activeCandidateNodeSurfaceNormalECEF: Cartesian3 | null;
  activeCandidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  handleAnnotationCursorMove: (
    positionECEF: Cartesian3 | null,
    screenPosition?: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
  clearAnnotationCursor: () => void;
  syncAnnotationCursorToExistingPoint: (
    pointId: string,
    anchorPosition?: { x: number; y: number } | null
  ) => boolean;
  releaseAnnotationCursorSnap: () => void;
  scheduleAnnotationCursorSnapRelease: (pointId: string) => void;
  isPolylineCandidateMode: boolean;
  hasCandidateNode: boolean;
  candidateSupportsEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  candidateForcesDirectEdgeLine: boolean;
  annotationCursorEnabled: boolean;
};

const SNAPPED_NODE_CURSOR_RELEASE_DELAY_MS = 80;

export const useAnnotationCandidateState = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  {
    pointQueryEnabled,
    moveGizmoPointId,
    isMoveGizmoDragging,
    setNodeChainAnnotations,
    getPositionWithVerticalOffsetFromAnchor,
  }: UseAnnotationCandidateStateParams
): UseAnnotationCandidateStateResult => {
  const capabilities = resolveCandidateCapabilities(candidate.kind);
  const {
    isPolylineCandidateMode,
    hasCandidateNode,
    candidateSupportsEdgeLine,
    candidateUsesPolylineEdgeRules,
    candidateForcesDirectEdgeLine,
  } = capabilities;
  const annotationCursorEnabled =
    hasCandidateNode &&
    pointQueryEnabled &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  const updateVerticalPolygonCandidate = useVerticalPolygonCandidate(
    scene,
    annotations,
    candidate,
    setNodeChainAnnotations
  );

  const {
    candidateNodePositionECEF: activeCandidateNodeECEF,
    cursorScreenPosition,
    candidateNodeSurfaceNormalECEF: activeCandidateNodeSurfaceNormalECEF,
    candidateNodeVerticalOffsetAnchorECEF:
      activeCandidateNodeVerticalOffsetAnchorECEF,
    clearMeasurementCursor,
    handleAnnotationCursorMove,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    syncAnnotationCursorToExistingPoint,
  } = useAnnotationCursorState(scene, annotations, candidate, {
    enabled: annotationCursorEnabled,
    snappedPointReleaseDelayMs: SNAPPED_NODE_CURSOR_RELEASE_DELAY_MS,
    getPositionWithVerticalOffsetFromAnchor,
    onCandidateNodePositionChange: updateVerticalPolygonCandidate,
  });

  return {
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    clearAnnotationCursor: clearMeasurementCursor,
    handleAnnotationCursorMove,
    releaseAnnotationCursorSnap,
    syncAnnotationCursorToExistingPoint,
    scheduleAnnotationCursorSnapRelease,
    isPolylineCandidateMode,
    hasCandidateNode,
    candidateSupportsEdgeLine,
    candidateUsesPolylineEdgeRules,
    candidateForcesDirectEdgeLine,
    annotationCursorEnabled,
  };
};
