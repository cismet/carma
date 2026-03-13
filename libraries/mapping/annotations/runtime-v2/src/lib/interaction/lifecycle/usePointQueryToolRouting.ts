import { useCallback } from "react";

import type { RuntimeCoordinate } from "../../store";
import type { AnnotationModeSessionMap } from "./annotationModeSession.types";
import type {
  AnnotationToolPlugin,
  AnnotationToolSessionContext,
} from "../../tools/annotationToolPlugin.types";
import type { RuntimeToolId } from "../../types/runtimeTool.types";

type UsePointQueryToolRoutingParams = {
  activeToolType: RuntimeToolId;
  toolSessions: AnnotationModeSessionMap;
  getToolPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin | null;
  sessionContext: AnnotationToolSessionContext;
};

export const usePointQueryToolRouting = ({
  activeToolType,
  toolSessions,
  getToolPlugin,
  sessionContext,
}: UsePointQueryToolRoutingParams) => {
  const activeToolSession = toolSessions[activeToolType] ?? null;
  const activePlugin = getToolPlugin(activeToolType);

  const handlePointQueryPointCreated = useCallback(
    (coordinate: RuntimeCoordinate) => {
      const nodeCreatedHandler = activeToolSession?.onNodeCreated;
      if (nodeCreatedHandler) {
        nodeCreatedHandler(coordinate);
        return;
      }

      activePlugin?.pointQuery?.onPointCreated({
        coordinate,
        activeToolType,
        activeToolSession,
        toolSessions,
        sessionContext,
      });
    },
    [
      activePlugin,
      activeToolSession,
      activeToolType,
      sessionContext,
      toolSessions,
    ]
  );

  return {
    handlePointQueryPointCreated,
    activeToolSession,
  };
};
