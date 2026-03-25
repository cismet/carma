import type { AnnotationToolPlugin } from "./annotationToolPlugin.types";

const warnedFallbackKeys = new Set<string>();

const warnFallback = (
  pluginId: AnnotationToolPlugin["id"],
  capability: string,
  event: string
) => {
  const warningKey = `${pluginId}:${capability}`;
  if (!warnedFallbackKeys.has(warningKey)) {
    warnedFallbackKeys.add(warningKey);
    // eslint-disable-next-line no-console
    console.warn(
      `[annotations-runtime] Plugin "${pluginId}" is missing capability implementation "${capability}". Using a no-op fallback.`
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    `[annotations-runtime] fallback event "${event}" for plugin "${pluginId}" (${capability}).`
  );
};

export const createAnnotationToolPlugin = <
  TPlugin extends AnnotationToolPlugin
>(
  plugin: TPlugin
): TPlugin => {
  const capabilities = plugin.capabilities ?? [];
  let normalizedPlugin: AnnotationToolPlugin = { ...plugin };

  if (capabilities.includes("session") && !normalizedPlugin.session) {
    normalizedPlugin = {
      ...normalizedPlugin,
      session: {
        createSession: () => ({
          toolType: plugin.id,
          requestStart: () => {
            warnFallback(plugin.id, "session", "requestStart");
          },
          requestFinish: () => {
            warnFallback(plugin.id, "session", "requestFinish");
            return false;
          },
          discardDraft: () => {
            warnFallback(plugin.id, "session", "discardDraft");
          },
        }),
      },
    };
  }

  if (capabilities.includes("pointQuery") && !normalizedPlugin.pointQuery) {
    normalizedPlugin = {
      ...normalizedPlugin,
      pointQuery: {
        onPointCreated: () => {
          warnFallback(plugin.id, "pointQuery", "onPointCreated");
        },
      },
    };
  }

  if (
    (capabilities.includes("preview") ||
      capabilities.includes("previewPrimitives")) &&
    !normalizedPlugin.renderLayer
  ) {
    normalizedPlugin = {
      ...normalizedPlugin,
      renderLayer: {
        build: () => {
          warnFallback(plugin.id, "renderLayer", "build");
          return null;
        },
      },
    };
  }

  if (capabilities.includes("infoBox") && !normalizedPlugin.infoBox) {
    normalizedPlugin = {
      ...normalizedPlugin,
      infoBox: {
        getSlots: () => {
          warnFallback(plugin.id, "infoBox", "getSlots");
          return null;
        },
      },
    };
  }

  return normalizedPlugin as TPlugin;
};
