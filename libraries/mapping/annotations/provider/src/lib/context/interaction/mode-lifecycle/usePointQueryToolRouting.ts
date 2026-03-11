import { useCallback } from "react";

import { Cartesian3 } from "@carma/cesium";
import type { AnnotationToolType } from "@carma-mapping/annotations/core";

import type { AnnotationModeSessionMap } from "./annotationModeSession.types";

type UsePointQueryToolRoutingParams = {
  activeToolType: AnnotationToolType;
  toolSessions: AnnotationModeSessionMap;
  handlePointAnnotationCreated: (newPointId: string) => void;
  setLabelInputPromptPointId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
};

export const usePointQueryToolRouting = ({
  activeToolType,
  toolSessions,
  handlePointAnnotationCreated,
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
      handlePointAnnotationCreated(newPointId);
    },
    [activeToolSession, handlePointAnnotationCreated]
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
