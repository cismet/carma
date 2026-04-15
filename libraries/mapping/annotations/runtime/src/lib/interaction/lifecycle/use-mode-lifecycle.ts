import { useCallback } from "react";

import type { RuntimeToolId } from "../../types/runtime-tool.types";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "./annotation-mode-session.types";
const getModeSession = (
  sessionsByToolType: AnnotationModeSessionMap,
  toolType: RuntimeToolId
): AnnotationModeSession | null => sessionsByToolType[toolType] ?? null;

export const useModeLifecycle = (
  activeToolType: RuntimeToolId,
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
    (nextToolType: RuntimeToolId) => {
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
    (toolType: RuntimeToolId = activeToolType) => {
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
