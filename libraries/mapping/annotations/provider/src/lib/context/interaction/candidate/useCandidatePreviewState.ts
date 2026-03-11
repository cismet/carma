import { useMemo } from "react";
import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  getPointById,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationToolType,
  type CandidateConnectionPreview,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";

type UseCandidatePreviewStateParams = {
  activeToolType: AnnotationToolType;
  distanceModeStickyToFirstPoint: boolean;
  referencePointMeasurementId: string | null;
  doubleClickChainSourcePointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  selectedAnnotationId: string | null;
  candidateSupportsEdgeLine: boolean;
  resolveDistanceRelationSourcePointId: (
    targetPointId: string
  ) => string | null;
  activeCandidateNodeECEF: Cartesian3 | null;
  annotations: AnnotationCollection;
  candidateForcesDirectEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  polylineSegmentLineMode: LinearSegmentLineMode;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  isPolylineCandidateMode: boolean;
  focusedPolylineDistanceToStartByPointId: Readonly<Record<string, number>>;
};

export const useCandidatePreviewState = ({
  activeToolType,
  distanceModeStickyToFirstPoint,
  referencePointMeasurementId,
  doubleClickChainSourcePointId,
  selectablePointIds,
  moveGizmoPointId,
  selectedAnnotationId,
  candidateSupportsEdgeLine,
  resolveDistanceRelationSourcePointId,
  activeCandidateNodeECEF,
  annotations,
  candidateForcesDirectEdgeLine,
  candidateUsesPolylineEdgeRules,
  polylineSegmentLineMode,
  distanceCreationLineVisibility,
  isPolylineCandidateMode,
  focusedPolylineDistanceToStartByPointId,
}: UseCandidatePreviewStateParams) => {
  const candidateAnchorPointId = useMemo(() => {
    if (!candidateSupportsEdgeLine) return null;
    return resolveDistanceRelationSourcePointId("__candidate-target__");
  }, [candidateSupportsEdgeLine, resolveDistanceRelationSourcePointId]);

  const hasDistancePreviewAnchor = useMemo(() => {
    if (activeToolType !== ANNOTATION_TYPE_DISTANCE) {
      return false;
    }

    if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
      return true;
    }

    return Boolean(
      doubleClickChainSourcePointId &&
        selectablePointIds.has(doubleClickChainSourcePointId)
    );
  }, [
    activeToolType,
    distanceModeStickyToFirstPoint,
    doubleClickChainSourcePointId,
    selectablePointIds,
    referencePointMeasurementId,
  ]);

  const activeMeasurementId = useMemo(() => {
    if (moveGizmoPointId && selectablePointIds.has(moveGizmoPointId)) {
      return moveGizmoPointId;
    }

    if (candidateAnchorPointId) {
      return candidateAnchorPointId;
    }

    if (
      doubleClickChainSourcePointId &&
      selectablePointIds.has(doubleClickChainSourcePointId)
    ) {
      return doubleClickChainSourcePointId;
    }

    if (selectedAnnotationId && selectablePointIds.has(selectedAnnotationId)) {
      return selectedAnnotationId;
    }

    return null;
  }, [
    candidateAnchorPointId,
    doubleClickChainSourcePointId,
    moveGizmoPointId,
    selectablePointIds,
    selectedAnnotationId,
  ]);

  const { candidateConnectionPreview, candidatePreviewDistanceMeters } =
    useMemo<{
      candidateConnectionPreview: CandidateConnectionPreview | null;
      candidatePreviewDistanceMeters: number | undefined;
    }>(() => {
      if (!activeCandidateNodeECEF || !candidateAnchorPointId) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      const sourcePoint = getPointById(annotations, candidateAnchorPointId);
      if (!sourcePoint || !isPointAnnotationEntry(sourcePoint)) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      const showDirectLine = candidateForcesDirectEdgeLine
        ? true
        : candidateUsesPolylineEdgeRules
        ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT
        : distanceCreationLineVisibility.direct;
      const showComponentLines = candidateForcesDirectEdgeLine
        ? false
        : candidateUsesPolylineEdgeRules
        ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS
        : distanceCreationLineVisibility.vertical ||
          distanceCreationLineVisibility.horizontal;
      const showVerticalLine = candidateUsesPolylineEdgeRules
        ? showComponentLines
        : distanceCreationLineVisibility.vertical;
      const showHorizontalLine = candidateUsesPolylineEdgeRules
        ? showComponentLines
        : distanceCreationLineVisibility.horizontal;

      if (!showDirectLine && !showVerticalLine && !showHorizontalLine) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      return {
        candidateConnectionPreview: {
          anchorPointECEF: Cartesian3.clone(sourcePoint.geometryECEF),
          targetPointECEF: Cartesian3.clone(activeCandidateNodeECEF),
          showDirectLine,
          showVerticalLine,
          showHorizontalLine,
        },
        candidatePreviewDistanceMeters: isPolylineCandidateMode
          ? (focusedPolylineDistanceToStartByPointId[candidateAnchorPointId] ??
              0) +
            Cartesian3.distance(
              sourcePoint.geometryECEF,
              activeCandidateNodeECEF
            )
          : undefined,
      };
    }, [
      activeCandidateNodeECEF,
      candidateAnchorPointId,
      candidateForcesDirectEdgeLine,
      candidateUsesPolylineEdgeRules,
      annotations,
      distanceCreationLineVisibility.direct,
      distanceCreationLineVisibility.horizontal,
      distanceCreationLineVisibility.vertical,
      focusedPolylineDistanceToStartByPointId,
      isPolylineCandidateMode,
      polylineSegmentLineMode,
    ]);

  return {
    candidateAnchorPointId,
    hasDistancePreviewAnchor,
    activeMeasurementId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  };
};
