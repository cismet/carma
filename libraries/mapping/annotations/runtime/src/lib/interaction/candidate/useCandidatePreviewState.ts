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

type CandidatePreviewSessionParams = {
  activeToolType: AnnotationToolType;
  distanceModeStickyToFirstPoint: boolean;
  referencePointMeasurementId: string | null;
  openChainPointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  selectedAnnotationId: string | null;
};

type CandidatePreviewGeometryParams = {
  activeCandidateNodeECEF: Cartesian3 | null;
  annotations: AnnotationCollection;
  focusedPolylineDistanceToStartByPointId: Readonly<Record<string, number>>;
};

type CandidatePreviewStyleParams = {
  candidateSupportsEdgeLine: boolean;
  candidateForcesDirectEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  polylineSegmentLineMode: LinearSegmentLineMode;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  isPolylineCandidateMode: boolean;
};

type UseCandidatePreviewStateParams = {
  session: CandidatePreviewSessionParams;
  geometry: CandidatePreviewGeometryParams;
  style: CandidatePreviewStyleParams;
};

export const useCandidatePreviewState = ({
  session,
  geometry,
  style,
}: UseCandidatePreviewStateParams) => {
  const {
    activeToolType,
    distanceModeStickyToFirstPoint,
    referencePointMeasurementId,
    openChainPointId,
    selectablePointIds,
    moveGizmoPointId,
    selectedAnnotationId,
  } = session;
  const {
    activeCandidateNodeECEF,
    annotations,
    focusedPolylineDistanceToStartByPointId,
  } = geometry;
  const {
    candidateSupportsEdgeLine,
    candidateForcesDirectEdgeLine,
    candidateUsesPolylineEdgeRules,
    polylineSegmentLineMode,
    distanceCreationLineVisibility,
    isPolylineCandidateMode,
  } = style;

  const candidateAnchorPointId = useMemo(() => {
    if (!candidateSupportsEdgeLine) return null;
    if (
      activeToolType === ANNOTATION_TYPE_DISTANCE &&
      distanceModeStickyToFirstPoint &&
      referencePointMeasurementId
    ) {
      return referencePointMeasurementId;
    }

    return openChainPointId && selectablePointIds.has(openChainPointId)
      ? openChainPointId
      : null;
  }, [
    activeToolType,
    candidateSupportsEdgeLine,
    distanceModeStickyToFirstPoint,
    openChainPointId,
    referencePointMeasurementId,
    selectablePointIds,
  ]);

  const hasDistancePreviewAnchor = useMemo(() => {
    if (activeToolType !== ANNOTATION_TYPE_DISTANCE) {
      return false;
    }

    if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
      return true;
    }

    return Boolean(
      openChainPointId && selectablePointIds.has(openChainPointId)
    );
  }, [
    activeToolType,
    distanceModeStickyToFirstPoint,
    openChainPointId,
    selectablePointIds,
    referencePointMeasurementId,
  ]);

  const currentAnnotationId = useMemo(() => {
    if (moveGizmoPointId && selectablePointIds.has(moveGizmoPointId)) {
      return moveGizmoPointId;
    }

    if (candidateAnchorPointId) {
      return candidateAnchorPointId;
    }

    if (openChainPointId && selectablePointIds.has(openChainPointId)) {
      return openChainPointId;
    }

    if (selectedAnnotationId && selectablePointIds.has(selectedAnnotationId)) {
      return selectedAnnotationId;
    }

    return null;
  }, [
    candidateAnchorPointId,
    openChainPointId,
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
    currentAnnotationId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  };
};
