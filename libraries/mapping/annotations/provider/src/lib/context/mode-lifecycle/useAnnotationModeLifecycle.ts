import { useCallback } from "react";

import type { AnnotationToolType } from "@carma-mapping/annotations/core";

import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "./annotationModeSession.types";

const getModeSession = (
  sessionsByToolType: AnnotationModeSessionMap,
  toolType: AnnotationToolType
): AnnotationModeSession | null => sessionsByToolType[toolType] ?? null;

export const useAnnotationModeLifecycle = (
  activeToolType: AnnotationToolType,
  sessionsByToolType: AnnotationModeSessionMap,
  clearSharedModeExitState: () => void
) => {
  const requestCloseActiveMeasurement = useCallback(() => {
    const activeSession = getModeSession(sessionsByToolType, activeToolType);
    if (!activeSession || !activeSession.hasActiveDraft()) {
      return;
    }

    activeSession.requestClose();
  }, [activeToolType, sessionsByToolType]);

  const requestModeChange = useCallback(
    (nextToolType: AnnotationToolType) => {
      if (nextToolType === activeToolType) {
        return;
      }

      const activeSession = getModeSession(sessionsByToolType, activeToolType);
      if (activeSession?.hasActiveDraft()) {
        activeSession.requestClose();
      }

      clearSharedModeExitState();
      const nextSession = getModeSession(sessionsByToolType, nextToolType);
      nextSession?.requestStart();
    },
    [activeToolType, clearSharedModeExitState, sessionsByToolType]
  );

  const requestStartMeasurement = useCallback(
    (toolType: AnnotationToolType = activeToolType) => {
      if (toolType !== activeToolType) {
        requestModeChange(toolType);
        return;
      }

      const activeSession = getModeSession(sessionsByToolType, activeToolType);
      activeSession?.discardDraft();
      clearSharedModeExitState();
      activeSession?.requestStart();
    },
    [
      activeToolType,
      clearSharedModeExitState,
      requestModeChange,
      sessionsByToolType,
    ]
  );

  return {
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
  };
};
