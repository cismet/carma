import type { Map as MaplibreMap } from "maplibre-gl";

import type { CarmaConf3DModel } from "@carma-mapping/engines/maplibre";

/** pitch in degrees above which the models replace their footprints */
export const DEFAULT_MIN_PITCH = 1;

/**
 * A feature of a geojson source on the map that declares a 3D model, the way
 * Cesium reads it: `properties.carmaConf3D.model`. The style layers drawing the
 * source are the model's footprint.
 */
export type TiltedModel = {
  /** `sourceId#featureId`, stable while the source stays on the map */
  key: string;
  sourceId: string;
  featureId: string | number;
  model: CarmaConf3DModel & { position: { height: number } };
  footprintLayerIds: string[];
};

type MapReader = Pick<MaplibreMap, "getLayersOrder" | "getLayer" | "getSource">;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** the model a feature declares, or null when it has none MapLibre can place */
export const readModelConfig = (
  properties: unknown
): TiltedModel["model"] | null => {
  const model = (
    properties as { carmaConf3D?: { model?: unknown } } | null | undefined
  )?.carmaConf3D?.model as Partial<CarmaConf3DModel> | undefined;
  if (
    !model ||
    typeof model.url !== "string" ||
    model.url.trim().length === 0 ||
    !isFiniteNumber(model.position?.lon) ||
    !isFiniteNumber(model.position?.lat)
  ) {
    return null;
  }
  return {
    ...(model as CarmaConf3DModel),
    position: {
      lon: model.position.lon,
      lat: model.position.lat,
      height: isFiniteNumber(model.position.height) ? model.position.height : 0,
    },
  };
};

/** the map's layer order, or none while there is no style to ask */
const layerOrder = (map: MapReader): string[] => {
  try {
    return map.getLayersOrder();
  } catch {
    return [];
  }
};

/**
 * Every model on the map, read from the inline data of its geojson sources.
 * A feature without an id is left out: neither its selection nor its
 * feature-state could be addressed.
 */
export const findTiltedModels = (map: MapReader): TiltedModel[] => {
  const layerIdsBySource = new Map<string, string[]>();
  for (const layerId of layerOrder(map)) {
    const source = (map.getLayer(layerId) as { source?: unknown } | undefined)
      ?.source;
    if (typeof source !== "string") {
      continue;
    }
    const layerIds = layerIdsBySource.get(source) ?? [];
    layerIds.push(layerId);
    layerIdsBySource.set(source, layerIds);
  }

  const models: TiltedModel[] = [];
  for (const [sourceId, footprintLayerIds] of layerIdsBySource) {
    const source = map.getSource(sourceId);
    if (source?.type !== "geojson") {
      continue;
    }
    const data = (source as { serialize?: () => { data?: unknown } })
      .serialize?.()?.data as
      | { type?: string; features?: unknown[]; id?: unknown; properties?: unknown }
      | undefined;
    if (!data || typeof data !== "object") {
      continue;
    }
    const features =
      data.type === "FeatureCollection"
        ? data.features ?? []
        : data.type === "Feature"
        ? [data]
        : [];
    for (const feature of features as Array<{
      id?: unknown;
      properties?: unknown;
    }>) {
      const featureId = feature?.id;
      if (typeof featureId !== "string" && typeof featureId !== "number") {
        continue;
      }
      const model = readModelConfig(feature.properties);
      if (!model) {
        continue;
      }
      models.push({
        key: `${sourceId}#${String(featureId)}`,
        sourceId,
        featureId,
        model,
        footprintLayerIds,
      });
    }
  }
  return models;
};

/** whether the map is tilted far enough for the models to show */
export const isTilted = (pitch: number, minPitch = DEFAULT_MIN_PITCH): boolean =>
  pitch > minPitch;

/**
 * A paint value next to the layer bar's opacity it was baked with, taken when
 * the layer reached the map.
 */
export type OpacityReference = { painted: number; opacity: number };

/**
 * The layer bar's opacity as it stands now, read back from a paint property.
 *
 * The style builder bakes the slider into the paint (authored × opacity) and
 * writes it to `metadata["layer-opacity"]` too, but MapLibre's style diff skips
 * metadata, so after a slider move only the paint carries the new value. With
 * the reference the authored factor is known and the opacity follows from the
 * current paint. Null when the paint is no number or the reference cannot tell.
 */
export const readLayerOpacity = (
  painted: unknown,
  reference: OpacityReference | null
): number | null => {
  if (
    !reference ||
    !isFiniteNumber(painted) ||
    reference.painted <= 0 ||
    reference.opacity <= 0
  ) {
    return null;
  }
  const authored = reference.painted / reference.opacity;
  return Math.min(1, Math.max(0, painted / authored));
};
