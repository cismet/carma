import type { ModelConfig } from "@carma-mapping/engines/cesium/core";
import { Color, Model, type CustomShader } from "@carma-cesium";

type ModelWithReadyPromise = {
  readyPromise?: Promise<unknown>;
};

export const getPrimitiveSelectionId = (primitive: Model): string | null => {
  const pickId = primitive.id as { id?: unknown } | undefined;
  return typeof pickId?.id === "string" ? pickId.id : null;
};

export const findModelPrimitiveBySelectionId = (
  primitives: Iterable<Model>,
  primitiveId: string
): Model | null => {
  for (const primitive of primitives) {
    if (primitive.isDestroyed()) {
      continue;
    }
    if (getPrimitiveSelectionId(primitive) === primitiveId) {
      return primitive;
    }
  }
  return null;
};

export const buildModelKey = (config: ModelConfig): string => {
  const model = config.model;
  const position = config.position;
  const orientation = config.orientation ?? {};
  return JSON.stringify({
    uri: model.uri,
    scale: typeof model.scale === "number" ? model.scale : null,
    position: {
      longitude: position.longitude,
      latitude: position.latitude,
      altitude: position.altitude,
    },
    orientation: {
      heading: orientation.heading ?? null,
      pitch: orientation.pitch ?? null,
      roll: orientation.roll ?? null,
    },
    name: typeof config.name === "string" ? config.name : null,
    title:
      typeof config.properties?.title === "string"
        ? config.properties.title
        : null,
  });
};

export const isModelPick = <
  T extends { primitive?: unknown } | null | undefined
>(
  obj: T
): obj is T & { primitive: Model } => {
  const candidate = obj as { primitive?: unknown } | null | undefined;
  return (
    candidate?.primitive instanceof Model && !candidate.primitive.isDestroyed()
  );
};

export const extractPickedProperties = (
  picked: { id?: { properties?: Record<string, unknown> } } | null | undefined
): Record<string, unknown> => {
  const entityProperties = picked?.id?.properties;
  if (!entityProperties) return {};
  return Object.entries(entityProperties).reduce<Record<string, unknown>>(
    (result, [key, value]) => {
      result[key] = value;
      return result;
    },
    {}
  );
};

export const getModelConfigCustomShader = (
  config: ModelConfig
): CustomShader | undefined =>
  config.model.customShader
    ? (config.model.customShader as CustomShader)
    : undefined;

export const getModelConfigCustomShaderSignature = (
  config: ModelConfig
): string | null =>
  typeof config.model.renderStyleSignature === "string"
    ? config.model.renderStyleSignature
    : null;

const toModelConfigRenderStyleOutlineColor = (
  value: unknown
): Color | undefined => {
  if (value instanceof Color) {
    return value;
  }
  if (typeof value === "string") {
    return Color.fromCssColorString(value);
  }
  return undefined;
};

export type ModelPrimitiveRenderStylePresentation = {
  outlineColor?: Color;
  outlineWidthPx: number;
};

export const getModelConfigRenderStylePresentation = (
  config: ModelConfig
): ModelPrimitiveRenderStylePresentation | null => {
  if (typeof config.model.renderStyleSignature !== "string") {
    return null;
  }

  const outlineColor = toModelConfigRenderStyleOutlineColor(
    config.model.renderStyleOutlineColor
  );
  const outlineWidthPx =
    typeof config.model.renderStyleOutlineWidthPx === "number" &&
    Number.isFinite(config.model.renderStyleOutlineWidthPx) &&
    config.model.renderStyleOutlineWidthPx > 0
      ? config.model.renderStyleOutlineWidthPx
      : 0;

  return {
    ...(outlineColor ? { outlineColor } : {}),
    outlineWidthPx,
  };
};

export const applyModelConfigRenderStylePresentation = (
  primitive: Model,
  config: ModelConfig
) => {
  if (primitive.isDestroyed()) {
    return;
  }

  const presentation = getModelConfigRenderStylePresentation(config);
  if (!presentation) {
    return;
  }

  if (presentation.outlineColor) {
    primitive.silhouetteColor = Color.clone(
      presentation.outlineColor,
      new Color()
    );
  }
  primitive.silhouetteSize = presentation.outlineWidthPx;
};

export const applyModelCustomShader = (
  primitive: Model,
  shader: CustomShader | undefined,
  requestRender: () => void
) => {
  if (primitive.isDestroyed()) return;
  if (primitive.ready) {
    primitive.customShader = shader;
    requestRender();
    return;
  }
  const readyPromise = (primitive as ModelWithReadyPromise).readyPromise;
  if (!readyPromise) {
    primitive.customShader = shader;
    requestRender();
    return;
  }
  readyPromise
    .then(() => {
      if (!primitive.isDestroyed()) {
        primitive.customShader = shader;
        requestRender();
      }
    })
    .catch(() => undefined);
};
