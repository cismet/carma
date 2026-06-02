import { useCallback } from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "./annotation-mode-session.types";
const getModeSession = (
  sessionsByToolType: AnnotationModeSessionMap,
  toolType: AnnotationToolId
): AnnotationModeSession | null => sessionsByToolType[toolType] ?? null;

export const useModeLifecycle = (
  activeToolType: AnnotationToolId,
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
    (nextToolType: AnnotationToolId) => {
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

  const requestActivateTool = useCallback(
    (toolType: AnnotationToolId = activeToolType) => {
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
    requestActivateTool,
    requestFinishMeasurement,
  };
};
