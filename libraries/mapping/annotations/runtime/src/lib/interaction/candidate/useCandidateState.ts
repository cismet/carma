import { type Dispatch, type SetStateAction } from "react";

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
import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

import { useVerticalPolygonCandidate } from "../candidate/useVerticalPolygonCandidate";
import type { PreviewRuntimeController } from "./previewRuntime";
import { useCursorState } from "../cursor/useCursorState";
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
  previewRuntimeController: PreviewRuntimeController;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
};

type UseAnnotationCandidateStateResult = {
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

export const useCandidateState = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  {
    pointQueryEnabled,
    moveGizmoPointId,
    isMoveGizmoDragging,
    previewRuntimeController,
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
    clearMeasurementCursor,
    handleAnnotationCursorMove,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    syncAnnotationCursorToExistingPoint,
  } = useCursorState(scene, annotations, candidate, {
    enabled: annotationCursorEnabled,
    snappedPointReleaseDelayMs: SNAPPED_NODE_CURSOR_RELEASE_DELAY_MS,
    previewRuntimeController,
    getPositionWithVerticalOffsetFromAnchor,
    onCandidateNodePositionChange: updateVerticalPolygonCandidate,
  });

  return {
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
