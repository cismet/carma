import { Model } from "@carma/cesium";
import type { ModelConfig } from "@carma-commons/resources";

export const getPrimitiveSelectionId = (primitive: Model): string | null => {
  const pickId = primitive.id as { id?: unknown } | undefined;
  return typeof pickId?.id === "string" ? pickId.id : null;
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
