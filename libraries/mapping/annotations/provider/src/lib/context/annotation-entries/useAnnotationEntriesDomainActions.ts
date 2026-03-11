import type { Dispatch, SetStateAction } from "react";

import {
  applyLabelAppearance,
  isPointMeasurementEntry,
  normalizeLabelAppearance,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationLabelAppearance,
  type AnnotationMode,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import { useAnnotationEntryMutations } from "./useAnnotationEntryMutations";
import { useAnnotationPresentationActions } from "./useAnnotationPresentationActions";
import { useAnnotationResetActions } from "./useAnnotationResetActions";
import { useAnnotationDeleteAndCleanupActions } from "./useAnnotationDeleteAndCleanupActions";

type Params = {
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  selectablePointIds: ReadonlySet<string>;
  lockedMeasurementIdSet: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  hideMeasurementsOfType: Set<AnnotationMode>;
  setHideMeasurementsOfType: Dispatch<SetStateAction<Set<AnnotationMode>>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setDoubleClickChainSourcePointId: Dispatch<SetStateAction<string | null>>;
  clearAnnotationSelection: () => void;
  clearPointSelection: () => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  getOwnerGroupIdsForPointId: (pointId: string) => readonly string[];
  computePolygonGroupDerivedDataWithCamera: (
    group: NodeChainAnnotation,
    pointById: Map<string, import("@carma/cesium").Cartesian3>
  ) => NodeChainAnnotation;
  pruneMeasurementDraftSession: (
    removedPointIds: ReadonlySet<string>,
    removedRelationIds?: ReadonlySet<string>
  ) => void;
  pruneSelectionByRemovedIds: (removedIds: ReadonlySet<string>) => void;
  updateAnnotationEntryNameById: (id: string, name: string) => void;
};

export const useAnnotationEntriesDomainActions = ({
  annotations,
  distanceRelations,
  nodeChainAnnotations,
  selectedAnnotationId,
  selectedAnnotationIds,
  selectablePointIds,
  lockedMeasurementIdSet,
  moveGizmoPointId,
  hideMeasurementsOfType,
  setHideMeasurementsOfType,
  setAnnotations,
  setDistanceRelations,
  setNodeChainAnnotations,
  setActiveNodeChainAnnotationId,
  setDoubleClickChainSourcePointId,
  clearAnnotationSelection,
  clearPointSelection,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  getOwnerGroupIdsForPointId,
  computePolygonGroupDerivedDataWithCamera,
  pruneMeasurementDraftSession,
  pruneSelectionByRemovedIds,
  updateAnnotationEntryNameById,
}: Params) => {
  const { updateLabelAppearanceById: updatePointLabelAppearanceById } =
    useAnnotationEntryMutations<AnnotationEntry, AnnotationLabelAppearance>({
      setAnnotations,
      isLabelAppearanceTarget: isPointMeasurementEntry,
      getLabelAppearance: (measurement) =>
        isPointMeasurementEntry(measurement)
          ? measurement.labelAppearance
          : undefined,
      applyLabelAppearance: (measurement, appearance) => {
        if (!isPointMeasurementEntry(measurement)) {
          return measurement;
        }
        return applyLabelAppearance(measurement, appearance);
      },
      normalizeLabelAppearance,
    });

  const presentation = useAnnotationPresentationActions({
    annotations,
    nodeChainAnnotations,
    setAnnotations,
    setNodeChainAnnotations,
    updateAnnotationEntryNameById,
  });

  const reset = useAnnotationResetActions({
    hideAnnotationsOfType: hideMeasurementsOfType,
    setHideAnnotationsOfType: setHideMeasurementsOfType,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    clearAnnotationSelection,
    clearNodeSelection: clearPointSelection,
    clearActiveNodeChainDrawingState: clearActiveNodeChainDrawingState,
    clearMoveGizmo,
  });

  const cleanup = useAnnotationDeleteAndCleanupActions({
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    selectableAnnotationIds: selectablePointIds,
    lockedAnnotationIdSet: lockedMeasurementIdSet,
    moveGizmoPointId,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setActiveNodeChainAnnotationId,
    setDoubleClickChainSourcePointId,
    clearMoveGizmo,
    getOwnerGroupIdsForPointId,
    computePolygonGroupDerivedDataWithCamera,
    pruneMeasurementDraftSession,
    pruneSelectionByRemovedIds,
  });

  return {
    updatePointLabelAppearanceById,
    ...presentation,
    ...reset,
    ...cleanup,
  };
};
