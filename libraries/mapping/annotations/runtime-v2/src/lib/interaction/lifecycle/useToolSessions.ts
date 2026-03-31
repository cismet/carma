import { useMemo } from "react";

import type {
  AnnotationToolRegistry,
  AnnotationToolSessionContext,
} from "../../tools/annotationToolPlugin.types";
import type { AnnotationModeSessionMap } from "./annotationModeSession.types";
export const useToolSessions = (
  registry: AnnotationToolRegistry,
  sessionContext: AnnotationToolSessionContext
): AnnotationModeSessionMap =>
  useMemo(
    () =>
      registry.plugins.reduce<AnnotationModeSessionMap>((sessions, plugin) => {
        const session = plugin.session?.createSession(sessionContext);
        if (!session) {
          return sessions;
        }

        return {
          ...sessions,
          [plugin.id]: session,
        };
      }, {}),
    [registry.plugins, sessionContext]
  );
