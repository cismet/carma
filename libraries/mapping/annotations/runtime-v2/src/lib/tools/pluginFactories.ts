import type {
  AnnotationToolPlugin,
  AnnotationToolPluginCapability,
} from "./annotationToolPlugin.types";
import {
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  ANNOTATION_TOOL_PLUGIN_KINDS,
} from "./annotationToolPlugin.types";
import { createAnnotationToolPlugin } from "./createAnnotationToolPlugin";

type InteractionToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  capabilities?: readonly AnnotationToolPluginCapability[];
};

type MeasurementToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  capabilities?: readonly AnnotationToolPluginCapability[];
};

const CAPABILITY_ORDER: readonly AnnotationToolPluginCapability[] = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SETTINGS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.TOOLBAR_OPTIONS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
];

export const INTERACTION_PLUGIN_CAPABILITIES = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
] as const satisfies readonly AnnotationToolPluginCapability[];

export const POINT_MEASUREMENT_PLUGIN_CAPABILITIES = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SETTINGS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
] as const satisfies readonly AnnotationToolPluginCapability[];

export const NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SETTINGS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.PREVIEW_PRIMITIVES,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.TOOLBAR_OPTIONS,
] as const satisfies readonly AnnotationToolPluginCapability[];

const normalizeCapabilities = (
  capabilities: readonly AnnotationToolPluginCapability[]
): readonly AnnotationToolPluginCapability[] => {
  const uniqueCapabilities = Array.from(new Set(capabilities));
  const orderByCapability = new Map(
    CAPABILITY_ORDER.map((capability, index) => [capability, index] as const)
  );

  return uniqueCapabilities.sort(
    (left, right) =>
      (orderByCapability.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (orderByCapability.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
};

export const createInteractionToolPlugin = (
  plugin: InteractionToolPluginInput
) =>
  createAnnotationToolPlugin({
    ...plugin,
    kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? INTERACTION_PLUGIN_CAPABILITIES
    ),
  });

export const createMeasurementToolPlugin = (
  plugin: MeasurementToolPluginInput
) =>
  createAnnotationToolPlugin({
    ...plugin,
    kind: ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? POINT_MEASUREMENT_PLUGIN_CAPABILITIES
    ),
  });
