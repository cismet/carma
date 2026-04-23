import {
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  ANNOTATION_TOOL_PLUGIN_KINDS,
} from "./annotation-tool-plugin.types";
import type {
  AnnotationToolPlugin,
  AnnotationToolPluginCapability,
} from "./annotation-tool-plugin.types";
type InteractionToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  annotationType?: null;
  capabilities?: readonly AnnotationToolPluginCapability[];
};

type MeasurementToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  annotationType: NonNullable<AnnotationToolPlugin["annotationType"]>;
  capabilities?: readonly AnnotationToolPluginCapability[];
};

const CAPABILITY_ORDER: readonly AnnotationToolPluginCapability[] = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.ADD_ANNOTATION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.AUTHORING_VISUALS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.KEYBOARD,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.VISUAL_MODELS,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
];

export const INTERACTION_PLUGIN_CAPABILITIES = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
] as const satisfies readonly AnnotationToolPluginCapability[];

export const BASE_MEASUREMENT_PLUGIN_CAPABILITIES = [
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.SESSION,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.POINT_QUERY,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.VISUAL_MODELS,
] as const satisfies readonly AnnotationToolPluginCapability[];

export const KEYBOARD_MEASUREMENT_PLUGIN_CAPABILITIES = [
  ...BASE_MEASUREMENT_PLUGIN_CAPABILITIES,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.KEYBOARD,
] as const satisfies readonly AnnotationToolPluginCapability[];

export const AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES = [
  ...KEYBOARD_MEASUREMENT_PLUGIN_CAPABILITIES,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES.AUTHORING_VISUALS,
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
  ({
    ...plugin,
    kind: ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION,
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? INTERACTION_PLUGIN_CAPABILITIES
    ),
  } satisfies AnnotationToolPlugin);

export const createMeasurementToolPlugin = (
  plugin: MeasurementToolPluginInput
) =>
  ({
    ...plugin,
    kind: ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT,
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? BASE_MEASUREMENT_PLUGIN_CAPABILITIES
    ),
  } satisfies AnnotationToolPlugin);
