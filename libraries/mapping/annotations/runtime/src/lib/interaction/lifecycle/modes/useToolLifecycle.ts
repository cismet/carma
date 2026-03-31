import { useMemo, type Dispatch, type SetStateAction } from "react";

import {
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { type Cartesian3 } from "@carma/cesium";

import { useModeLifecycle } from "../useModeLifecycle";
import type { AnnotationToolsContextType } from "../../../context/annotationsContext.types";
import { useLabelPlacementModeSession } from "./useLabelPlacementModeSession";
import { usePointMeasureModeSession } from "./usePointMeasureModeSession";
import { usePointQueryToolRouting } from "./usePointQueryToolRouting";
import { useToolSessions } from "./useToolSessions";
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
  nodeChainAnnotations: NodeChainAnnotation[];
  discardActiveMeasurementDraft: (
    activeNodeChainAnnotationId: string | null
  ) => void;
  finishActivePolylineMeasurement: () => void;
  finishActivePolygonMeasurement: () => void;
  handleNodeChainPointCreated: (id: string, positionECEF: Cartesian3) => void;
  clearSharedModeExitState: () => void;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
};

export const useToolLifecycle = ({
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
  nodeChainAnnotations,
  discardActiveMeasurementDraft,
  finishActivePolylineMeasurement,
  finishActivePolygonMeasurement,
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

  const toolSessions = useToolSessions(
    pointMeasureModeSession,
    labelPlacementModeSession,
    {
      activeNodeChainAnnotationId,
      nodeChainMeasurements: nodeChainAnnotations,
    },
    {
      requestEnterToolType,
      discardActiveMeasurementDraft,
      finishActivePolylineMeasurement,
      finishActivePolygonMeasurement,
      handleNodeChainPointCreated,
    }
  );
  const activeToolSession = toolSessions[activeToolType] ?? null;

  const { confirmLabelPlacementById, handlePointQueryPointCreated } =
    usePointQueryToolRouting({
      activeToolType,
      toolSessions,
      handlePointAnnotationCreated,
      handleLabelAnnotationCreated,
      handleNodeChainPointCreated,
      setLabelInputPromptPointId,
    });

  const {
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
  } = useModeLifecycle(activeToolType, toolSessions, clearSharedModeExitState);
  const requestCancelActiveMeasurementAndEnterSelection = () => {
    if (activeToolType === SELECT_TOOL_TYPE) {
      return false;
    }

    activeToolSession?.discardDraft();
    clearSharedModeExitState();
    requestEnterToolType(SELECT_TOOL_TYPE);
    return true;
  };

  const contextValue = useMemo<AnnotationToolsContextType>(
    () => ({
      activeToolType,
      requestModeChange,
      requestStartMeasurement,
      requestFinishMeasurement,
    }),
    [
      activeToolType,
      requestFinishMeasurement,
      requestModeChange,
      requestStartMeasurement,
    ]
  );

  return {
    activeToolSession,
    contextValue,
    confirmLabelPlacementById,
    handlePointQueryPointCreated,
    requestCancelActiveMeasurementAndEnterSelection,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
  };
};
