import type {
  AnnotationToolPlugin,
  AnnotationToolPluginCapability,
  AnnotationToolRegistry,
} from "./annotationToolPlugin.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";

const warnedFallbackKeys = new Set<string>();

const warnCapabilityFallback = (
  pluginId: AnnotationToolPlugin["id"],
  capability: AnnotationToolPluginCapability
) => {
  const warningKey = `${pluginId}:${capability}`;
  if (warnedFallbackKeys.has(warningKey)) {
    return;
  }

  warnedFallbackKeys.add(warningKey);
  // eslint-disable-next-line no-console
  console.warn(
    `[annotations-runtime] Plugin "${pluginId}" is missing capability implementation "${capability}". Using a no-op fallback at registry build time.`
  );
};

const comparePlugins = (
  left: AnnotationToolPlugin,
  right: AnnotationToolPlugin
) => {
  const orderDelta = left.descriptor.order - right.descriptor.order;
  if (orderDelta !== 0) return orderDelta;
  return left.id.localeCompare(right.id);
};

const toByIdMap = (
  plugins: readonly AnnotationToolPlugin[]
): Map<RuntimeToolId, AnnotationToolPlugin> => {
  const byId = new Map<RuntimeToolId, AnnotationToolPlugin>();

  plugins.forEach((plugin) => {
    const existing = byId.get(plugin.id);
    if (existing) {
      throw new Error(
        `Duplicate annotation tool plugin registration for "${plugin.id}".`
      );
    }

    byId.set(plugin.id, plugin);
  });

  return byId;
};

const assertCapabilityContract = (
  plugin: AnnotationToolPlugin,
  capability: AnnotationToolPluginCapability
) =>
  Boolean(
    (capability === "session" && plugin.session) ||
      (capability === "pointQuery" && plugin.pointQuery) ||
      ((capability === "preview" || capability === "previewPrimitives") &&
        plugin.renderLayer) ||
      (capability === "infoBox" && plugin.infoBox) ||
      (capability !== "session" &&
        capability !== "pointQuery" &&
        capability !== "preview" &&
        capability !== "previewPrimitives" &&
        capability !== "infoBox")
  );

const normalizePluginContract = (
  plugin: AnnotationToolPlugin
): AnnotationToolPlugin => {
  if (plugin.descriptor.id !== plugin.id) {
    throw new Error(
      `Plugin "${plugin.id}" descriptor id "${plugin.descriptor.id}" must match plugin id.`
    );
  }

  let normalizedPlugin: AnnotationToolPlugin = { ...plugin };

  (plugin.capabilities ?? []).forEach((capability) => {
    if (assertCapabilityContract(normalizedPlugin, capability)) {
      return;
    }

    warnCapabilityFallback(plugin.id, capability);

    if (capability === "session") {
      normalizedPlugin = {
        ...normalizedPlugin,
        session: {
          createSession: () => ({
            toolType: plugin.id,
            requestStart: () => undefined,
            requestFinish: () => false,
            discardDraft: () => undefined,
          }),
        },
      };
      return;
    }

    if (capability === "pointQuery") {
      normalizedPlugin = {
        ...normalizedPlugin,
        pointQuery: {
          onPointCreated: () => undefined,
        },
      };
      return;
    }

    if (capability === "preview" || capability === "previewPrimitives") {
      normalizedPlugin = {
        ...normalizedPlugin,
        renderLayer: {
          build: () => null,
        },
      };
      return;
    }

    if (capability === "infoBox") {
      normalizedPlugin = {
        ...normalizedPlugin,
        infoBox: {
          getSlots: () => null,
        },
      };
    }
  });

  return normalizedPlugin;
};

export const buildAnnotationToolRegistry = (
  plugins: readonly AnnotationToolPlugin[]
): AnnotationToolRegistry => {
  const normalizedPlugins = plugins.map(normalizePluginContract);
  const orderedPlugins = [...normalizedPlugins].sort(comparePlugins);
  const byId = toByIdMap(orderedPlugins);

  return {
    plugins: orderedPlugins,
    orderedDescriptors: orderedPlugins.map((plugin) => plugin.descriptor),
    byId,
    getPlugin: (toolType: RuntimeToolId) => byId.get(toolType),
    assertPlugin: (toolType: RuntimeToolId) => {
      const plugin = byId.get(toolType);
      if (!plugin) {
        throw new Error(
          `Missing annotation tool plugin for tool type "${toolType}".`
        );
      }
      return plugin;
    },
  };
};
