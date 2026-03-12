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

export const useModeLifecycle = (
  activeToolType: AnnotationToolType,
  sessionsByToolType: AnnotationModeSessionMap,
  clearSharedModeExitState: () => void
) => {
  const requestFinishMeasurement = useCallback(() => {
    const activeSession = getModeSession(sessionsByToolType, activeToolType);
    if (!activeSession) {
      return false;
    }

    return activeSession.requestFinish();
  }, [activeToolType, sessionsByToolType]);

  const requestModeChange = useCallback(
    (nextToolType: AnnotationToolType) => {
      if (nextToolType === activeToolType) {
        return;
      }

      const activeSession = getModeSession(sessionsByToolType, activeToolType);
      if (activeSession) {
        activeSession.requestFinish();
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
    requestFinishMeasurement,
  };
};
