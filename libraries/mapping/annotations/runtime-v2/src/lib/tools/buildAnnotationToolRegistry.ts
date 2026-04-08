import type { RuntimeToolId } from "../types/runtimeTool.types";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "./annotationToolPlugin.types";
import type {
  AnnotationToolPlugin,
  AnnotationToolPluginCapability,
  AnnotationToolRegistry,
} from "./annotationToolPlugin.types";
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
    (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION &&
      plugin.session) ||
      (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY &&
        plugin.pointQuery) ||
      ((capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW ||
        capability ===
          ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES) &&
        plugin.preview) ||
      (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX &&
        plugin.infoBox) ||
      (capability !== ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION &&
        capability !== ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY &&
        capability !== ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW &&
        capability !== ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES &&
        capability !== ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX)
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

    if (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION) {
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

    if (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY) {
      normalizedPlugin = {
        ...normalizedPlugin,
        pointQuery: {
          onPointCreated: () => undefined,
        },
      };
      return;
    }

    if (
      capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW ||
      capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES
    ) {
      normalizedPlugin = {
        ...normalizedPlugin,
        preview: {
          createController: () => null,
        },
      };
      return;
    }

    if (capability === ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX) {
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
