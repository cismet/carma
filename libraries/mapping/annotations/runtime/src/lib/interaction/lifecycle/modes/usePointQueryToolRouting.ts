import { useCallback } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSessionMap } from "../annotationModeSession.types";

type UsePointQueryToolRoutingParams = {
  activeToolType: AnnotationToolType;
  toolSessions: AnnotationModeSessionMap;
  handlePointAnnotationCreated: (newPointId: string) => void;
  handleLabelAnnotationCreated: (newPointId: string) => void;
  handleNodeChainPointCreated: (
    newPointId: string,
    newPointPositionECEF: Cartesian3
  ) => void;
  setLabelInputPromptPointId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
};

export const usePointQueryToolRouting = ({
  activeToolType,
  toolSessions,
  handlePointAnnotationCreated,
  handleLabelAnnotationCreated,
  handleNodeChainPointCreated,
  setLabelInputPromptPointId,
}: UsePointQueryToolRoutingParams) => {
  const activeToolSession = toolSessions[activeToolType] ?? null;

  const handlePointQueryPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const nodeCreatedHandler = activeToolSession?.onNodeCreated;
      if (nodeCreatedHandler) {
        nodeCreatedHandler(newPointId, newPointPositionECEF);
        return;
      }

      if (activeToolType === ANNOTATION_TYPE_LABEL) {
        handleLabelAnnotationCreated(newPointId);
        return;
      }

      if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
        handleNodeChainPointCreated(newPointId, newPointPositionECEF);
        return;
      }

      if (
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        activeToolType === ANNOTATION_TYPE_AREA_GROUND ||
        activeToolType === ANNOTATION_TYPE_AREA_PLANAR ||
        activeToolType === ANNOTATION_TYPE_AREA_VERTICAL
      ) {
        handleNodeChainPointCreated(newPointId, newPointPositionECEF);
        return;
      }

      if (activeToolType === ANNOTATION_TYPE_POINT) {
        handlePointAnnotationCreated(newPointId);
        return;
      }

      handlePointAnnotationCreated(newPointId);
    },
    [
      activeToolSession,
      activeToolType,
      handleLabelAnnotationCreated,
      handleNodeChainPointCreated,
      handlePointAnnotationCreated,
    ]
  );

  const confirmLabelPlacementById = useCallback(
    (id: string) => {
      if (!id) {
        return;
      }

      setLabelInputPromptPointId((previousPromptPointId) =>
        previousPromptPointId === id ? null : previousPromptPointId
      );
    },
    [setLabelInputPromptPointId]
  );

  return {
    handlePointQueryPointCreated,
    confirmLabelPlacementById,
  };
};
