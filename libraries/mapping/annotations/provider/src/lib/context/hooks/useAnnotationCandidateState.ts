import { type Dispatch, type SetStateAction } from "react";

import { Cartesian2, Cartesian3, type Scene } from "@carma/cesium";

import type {
  AnnotationCollection,
  PlanarPolygonGroup,
} from "@carma-mapping/annotations/core";

import { useAnnotationCursorState } from "./input/useAnnotationCursorState";
import { resolveCandidateCapabilities } from "./candidate/candidateCapabilities";
import { useVerticalPolygonCandidate } from "./candidate/useVerticalPolygonCandidate";
import {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  type AnnotationCandidateDescriptor,
} from "./annotationCandidate.types";

export {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  type AnnotationCandidateDescriptor,
} from "./annotationCandidate.types";

type UseAnnotationCandidateStateParams = {
  scene: Scene | null;
  candidate: AnnotationCandidateDescriptor;
  pointQueryEnabled: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  annotations: AnnotationCollection;
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  getFacadeRectanglePreviewAreaSquareMeters: (
    firstVertexECEF: Cartesian3,
    oppositeVertexECEF: Cartesian3
  ) => number;
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
  scheduleAnnotationCursorSnapRelease: (pointId: string) => void;
  isPolylineCandidateMode: boolean;
  hasCandidateNode: boolean;
  candidateSupportsEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  candidateForcesDirectEdgeLine: boolean;
  annotationCursorEnabled: boolean;
};

const SNAPPED_NODE_CURSOR_RELEASE_DELAY_MS = 80;

export const useAnnotationCandidateState = ({
  scene,
  candidate,
  pointQueryEnabled,
  moveGizmoPointId,
  isMoveGizmoDragging,
  annotations,
  setPlanarPolygonGroups,
  getPositionWithVerticalOffsetFromAnchor,
  getFacadeRectanglePreviewAreaSquareMeters,
}: UseAnnotationCandidateStateParams): UseAnnotationCandidateStateResult => {
  const capabilities = resolveCandidateCapabilities(candidate.kind);
  const {
    isPolylineCandidateMode,
    hasCandidateNode,
    candidateSupportsEdgeLine,
    candidateUsesPolylineEdgeRules,
    candidateForcesDirectEdgeLine,
    isVerticalPolygonCandidate,
  } = capabilities;
  const annotationCursorEnabled =
    hasCandidateNode &&
    pointQueryEnabled &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  const updateVerticalPolygonCandidate = useVerticalPolygonCandidate({
    scene,
    isVerticalPolygonCandidate,
    candidate,
    annotations,
    setPlanarPolygonGroups,
    getFacadeRectanglePreviewAreaSquareMeters,
  });

  const {
    candidateNodePositionECEF: activeCandidateNodeECEF,
    cursorScreenPosition,
    candidateNodeSurfaceNormalECEF: activeCandidateNodeSurfaceNormalECEF,
    candidateNodeVerticalOffsetAnchorECEF:
      activeCandidateNodeVerticalOffsetAnchorECEF,
    clearMeasurementCursor,
    handleAnnotationCursorMove,
    scheduleAnnotationCursorSnapRelease,
    syncAnnotationCursorToExistingPoint,
  } = useAnnotationCursorState({
    scene,
    annotations,
    enabled: annotationCursorEnabled,
    candidateKind: candidate.kind,
    verticalOffsetMeters: candidate.verticalOffsetMeters,
    hasCandidateNode,
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
