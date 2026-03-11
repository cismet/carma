import { type Dispatch, type SetStateAction } from "react";
import { type Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import { useAnnotationModeLifecycle } from "./useAnnotationModeLifecycle";
import { useAnnotationToolSessions } from "./useAnnotationToolSessions";
import { usePointMeasureModeSession } from "./modes/usePointMeasureModeSession";
import { useLabelPlacementModeSession } from "./modes/useLabelPlacementModeSession";
import { usePointQueryToolRouting } from "./usePointQueryToolRouting";

type UseAnnotationToolLifecycleParams = {
  activeToolType: AnnotationToolType;
  annotations: AnnotationCollection;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  clearAnnotationsByIds: (ids: string[]) => void;
  labelInputPromptPointId: string | null;
  requestEnterToolType: (toolType: AnnotationToolType) => void;
  requestFinishLabelPlacementDraft: () => void;
  requestCancelLabelPlacementDraft: () => void;
  handlePointAnnotationCreated: (pointId: string) => void;
  handleLabelAnnotationCreated: (pointId: string) => void;
  activeNodeChainAnnotationId: string | null;
  doubleClickChainSourcePointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  selectedAnnotationId: string | null;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  discardActiveMeasurementDraft: (
    activeNodeChainAnnotationId: string | null
  ) => void;
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void;
  finishActivePolylineAnnotation: () => void;
  closeActivePolygonAnnotation: () => void;
  handleDistancePointCreated: (id: string, positionECEF: Cartesian3) => void;
  handleNodeChainPointCreated: (id: string, positionECEF: Cartesian3) => void;
  clearSharedModeExitState: () => void;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
};

export const useAnnotationToolLifecycle = ({
  activeToolType,
  annotations,
  setAnnotations,
  clearAnnotationsByIds,
  labelInputPromptPointId,
  requestEnterToolType,
  requestFinishLabelPlacementDraft,
  requestCancelLabelPlacementDraft,
  handlePointAnnotationCreated,
  handleLabelAnnotationCreated,
  activeNodeChainAnnotationId,
  doubleClickChainSourcePointId,
  selectablePointIds,
  selectedAnnotationId,
  distanceRelations,
  nodeChainAnnotations,
  discardActiveMeasurementDraft,
  finishDistanceMeasurementSession,
  finishActivePolylineAnnotation,
  closeActivePolygonAnnotation,
  handleDistancePointCreated,
  handleNodeChainPointCreated,
  clearSharedModeExitState,
  setLabelInputPromptPointId,
}: UseAnnotationToolLifecycleParams) => {
  const pointMeasureModeSession = usePointMeasureModeSession(
    annotations,
    setAnnotations,
    clearAnnotationsByIds,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_POINT);
    },
    handlePointAnnotationCreated
  );

  const labelPlacementModeSession = useLabelPlacementModeSession(
    labelInputPromptPointId,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_LABEL);
    },
    requestFinishLabelPlacementDraft,
    requestCancelLabelPlacementDraft,
    handleLabelAnnotationCreated
  );

  const toolSessions = useAnnotationToolSessions(
    pointMeasureModeSession,
    labelPlacementModeSession,
    {
      activeNodeChainAnnotationId,
      openChainPointId: doubleClickChainSourcePointId,
      selectablePointIds,
      selectedAnnotationId,
      distanceRelations,
      nodeChainMeasurements: nodeChainAnnotations,
    },
    {
      requestEnterToolType,
      discardActiveMeasurementDraft,
      finishDistanceMeasurementSession,
      finishActivePolylineAnnotation,
      closeActivePolygonAnnotation,
      handlePointMeasurePointCreated: handlePointAnnotationCreated,
      handleDistancePointCreated,
      handleNodeChainPointCreated,
    }
  );

  const { confirmLabelPlacementById, handlePointQueryPointCreated } =
    usePointQueryToolRouting({
      activeToolType,
      toolSessions,
      handlePointAnnotationCreated,
      setLabelInputPromptPointId,
    });

  const {
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
  } = useAnnotationModeLifecycle(
    activeToolType,
    toolSessions,
    clearSharedModeExitState
  );

  return {
    confirmLabelPlacementById,
    handlePointQueryPointCreated,
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
  };
};
