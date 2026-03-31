import {
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  type AnnotationToolPlugin,
} from "./annotationToolPlugin.types";

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

  if (
    capabilities.includes(ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION) &&
    !normalizedPlugin.session
  ) {
    normalizedPlugin = {
      ...normalizedPlugin,
      session: {
        createSession: () => ({
          toolType: plugin.id,
          requestStart: () => {
            warnFallback(
              plugin.id,
              ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
              "requestStart"
            );
          },
          requestFinish: () => {
            warnFallback(
              plugin.id,
              ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
              "requestFinish"
            );
            return false;
          },
          discardDraft: () => {
            warnFallback(
              plugin.id,
              ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
              "discardDraft"
            );
          },
        }),
      },
    };
  }

  if (
    capabilities.includes(ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY) &&
    !normalizedPlugin.pointQuery
  ) {
    normalizedPlugin = {
      ...normalizedPlugin,
      pointQuery: {
        onPointCreated: () => {
          warnFallback(
            plugin.id,
            ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
            "onPointCreated"
          );
        },
      },
    };
  }

  if (
    (capabilities.includes(ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW) ||
      capabilities.includes(
        ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES
      )) &&
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

  if (
    capabilities.includes(ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX) &&
    !normalizedPlugin.infoBox
  ) {
    normalizedPlugin = {
      ...normalizedPlugin,
      infoBox: {
        getSlots: () => {
          warnFallback(
            plugin.id,
            ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
            "getSlots"
          );
          return null;
        },
      },
    };
  }

  return normalizedPlugin as TPlugin;
};
