import type {
  AnnotationToolRegistry,
  AnnotationToolSessionContext,
} from "../../tools/annotation-tool-plugin.types";
import type { AnnotationModeSessionMap } from "./annotation-mode-session.types";
export const buildToolSessions = (
  registry: AnnotationToolRegistry,
  sessionContext: AnnotationToolSessionContext
): AnnotationModeSessionMap =>
  registry.plugins.reduce<AnnotationModeSessionMap>((sessions, plugin) => {
    const session = plugin.session?.createSession(sessionContext);
    if (!session) {
      return sessions;
    }

    return {
      ...sessions,
      [plugin.id]: session,
    };
  }, {});
