import { useMemo } from "react";

import type {
  AnnotationCollection,
  LinearSegmentLineMode,
  NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma/cesium";

import { useStoreSelector, type AnnotationsStore } from "../../store";
import { useCandidatePreviewState } from "./useCandidatePreviewState";
type UseToolCandidatePreviewParams = {
  annotationsStore: AnnotationsStore;
  referencePointMeasurementId: string | null;
  selectablePointIds: ReadonlySet<string>;
  activeNodeChainAnnotationId: string | null;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  activeCandidateNodeECEF: Cartesian3 | null;
  annotations: AnnotationCollection;
  focusedPolylineDistanceToStartByPointId: Readonly<Record<string, number>>;
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

export const useToolCandidatePreview = ({
  annotationsStore,
  referencePointMeasurementId,
  selectablePointIds,
  activeNodeChainAnnotationId,
  nodeChainAnnotations,
  activeCandidateNodeECEF,
  annotations,
  focusedPolylineDistanceToStartByPointId,
  candidateSupportsEdgeLine,
  candidateForcesDirectEdgeLine,
  candidateUsesPolylineEdgeRules,
  polylineSegmentLineMode,
  distanceCreationLineVisibility,
  isPolylineCandidateMode,
}: UseToolCandidatePreviewParams) => {
  const activeToolType = useStoreSelector(
    annotationsStore,
    (state) => state.annotationToolType
  );
  const distanceModeStickyToFirstPoint = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.distance.stickyToFirstPoint
  );
  const selectedAnnotationId = useStoreSelector(
    annotationsStore,
    (state) =>
      state.selectionState.selectedAnnotationIds[
        state.selectionState.selectedAnnotationIds.length - 1
      ] ?? null
  );
  const moveGizmoPointId = useStoreSelector(
    annotationsStore,
    (state) => state.editState.moveGizmo.pointId
  );
  const openChainPointId = useMemo(() => {
    if (!activeNodeChainAnnotationId) {
      return null;
    }

    const activeOpenAnnotation =
      nodeChainAnnotations.find(
        (annotation) =>
          annotation.id === activeNodeChainAnnotationId && !annotation.closed
      ) ?? null;

    return (
      activeOpenAnnotation?.nodeIds[activeOpenAnnotation.nodeIds.length - 1] ??
      null
    );
  }, [activeNodeChainAnnotationId, nodeChainAnnotations]);

  const {
    currentAnnotationId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  } = useCandidatePreviewState({
    session: {
      activeToolType,
      distanceModeStickyToFirstPoint,
      referencePointMeasurementId,
      openChainPointId,
      selectablePointIds,
      moveGizmoPointId,
      selectedAnnotationId,
    },
    geometry: {
      activeCandidateNodeECEF,
      annotations,
      focusedPolylineDistanceToStartByPointId,
    },
    style: {
      candidateSupportsEdgeLine,
      candidateForcesDirectEdgeLine,
      candidateUsesPolylineEdgeRules,
      polylineSegmentLineMode,
      distanceCreationLineVisibility,
      isPolylineCandidateMode,
    },
  });

  return {
    currentAnnotationId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  };
};
