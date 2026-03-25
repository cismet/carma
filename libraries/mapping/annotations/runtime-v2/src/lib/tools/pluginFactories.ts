import type {
  AnnotationToolPlugin,
  AnnotationToolPluginCapability,
} from "./annotationToolPlugin.types";
import { createAnnotationToolPlugin } from "./createAnnotationToolPlugin";

type InteractionToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  capabilities?: readonly AnnotationToolPluginCapability[];
};

type MeasurementToolPluginInput = Omit<AnnotationToolPlugin, "kind"> & {
  capabilities?: readonly AnnotationToolPluginCapability[];
};

const CAPABILITY_ORDER: readonly AnnotationToolPluginCapability[] = [
  "session",
  "settings",
  "pointQuery",
  "preview",
  "previewPrimitives",
  "toolbarOptions",
  "infoBox",
];

export const INTERACTION_PLUGIN_CAPABILITIES = [
  "session",
] as const satisfies readonly AnnotationToolPluginCapability[];

export const POINT_MEASUREMENT_PLUGIN_CAPABILITIES = [
  "session",
  "settings",
  "pointQuery",
  "infoBox",
] as const satisfies readonly AnnotationToolPluginCapability[];

export const NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES = [
  "session",
  "settings",
  "pointQuery",
  "preview",
  "previewPrimitives",
  "toolbarOptions",
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
    kind: "interaction",
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? INTERACTION_PLUGIN_CAPABILITIES
    ),
  });

export const createMeasurementToolPlugin = (
  plugin: MeasurementToolPluginInput
) =>
  createAnnotationToolPlugin({
    ...plugin,
    kind: "measurement",
    capabilities: normalizeCapabilities(
      plugin.capabilities ?? POINT_MEASUREMENT_PLUGIN_CAPABILITIES
    ),
  });
