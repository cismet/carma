import type {
  MapGeoJSONFeature,
  MapSourceDataEvent,
  Map as MaplibreMap,
} from "maplibre-gl";

import {
  getMapLibreLayerOpacityProperties,
  registerClickHitProvider,
} from "@carma-mapping/engines/maplibre";

import { mountGlbModel, type GlbModelHandle } from "./glb-model";
import {
  DEFAULT_MIN_PITCH,
  findTiltedModels,
  isTilted,
  readLayerOpacity,
  type OpacityReference,
  type TiltedModel,
} from "./tilted-models";

/**
 * What a footprint layer's opacity properties are set to while its model
 * stands in for it: not zero, so the layer keeps answering queries, which is
 * what resolves a click on the model to the footprint feature.
 */
const FADED_OPACITY = 0.00001;

type Entry = {
  model: TiltedModel;
  handle: GlbModelHandle;
  /** the first numeric opacity paint of the footprint, see readLayerOpacity */
  opacityReference: OpacityReference | null;
};

const layerOpacityMetadata = (map: MaplibreMap, layerId: string): number => {
  const carried = (
    map.getLayer(layerId)?.metadata as { "layer-opacity"?: unknown } | undefined
  )?.["layer-opacity"];
  return typeof carried === "number" ? carried : 1;
};

/**
 * Shows each model a geojson feature declares (`carmaConf3D.model`) in place
 * of its footprint while the map is tilted, and the footprint again once the
 * map is flat. Returns the cleanup.
 *
 * It never tilts the map or frees the camera itself: the models register no 3D
 * presence, so a camera restriction that keeps the map flat keeps it flat.
 */
export const startTiltedModels = (
  map: MaplibreMap,
  { minPitch = DEFAULT_MIN_PITCH }: { minPitch?: number } = {}
): (() => void) => {
  const entries = new Map<string, Entry>();
  /** layer id → opacity property → the value it had before the fade */
  const faded = new Map<string, Map<string, unknown>>();

  /** a paint value as the style builder baked it, ahead of our fade */
  const bakedPaint = (layerId: string, property: string): unknown =>
    faded.get(layerId)?.has(property)
      ? faded.get(layerId)!.get(property)
      : map.getPaintProperty(layerId, property);

  const fadeLayer = (layerId: string) => {
    const layer = map.getLayer(layerId);
    if (!layer) {
      return;
    }
    const saved = faded.get(layerId) ?? new Map<string, unknown>();
    for (const property of getMapLibreLayerOpacityProperties(layer.type)) {
      const current = map.getPaintProperty(layerId, property);
      if (current === FADED_OPACITY) {
        continue;
      }
      // first fade, or a style diff put the builder's value back since
      saved.set(property, current);
      map.setPaintProperty(layerId, property, FADED_OPACITY);
    }
    faded.set(layerId, saved);
  };

  const restoreLayer = (layerId: string) => {
    const saved = faded.get(layerId);
    if (!saved) {
      return;
    }
    faded.delete(layerId);
    if (!map.getLayer(layerId)) {
      return;
    }
    for (const [property, value] of saved) {
      if (map.getPaintProperty(layerId, property) === FADED_OPACITY) {
        map.setPaintProperty(layerId, property, value);
      }
    }
  };

  const takeOpacityReference = (model: TiltedModel): OpacityReference | null => {
    for (const layerId of model.footprintLayerIds) {
      const layer = map.getLayer(layerId);
      if (!layer) {
        continue;
      }
      for (const property of getMapLibreLayerOpacityProperties(layer.type)) {
        const painted = bakedPaint(layerId, property);
        if (typeof painted === "number") {
          return { painted, opacity: layerOpacityMetadata(map, layerId) };
        }
      }
    }
    return null;
  };

  const currentOpacity = (entry: Entry): number => {
    const reference = entry.opacityReference;
    for (const layerId of entry.model.footprintLayerIds) {
      const layer = map.getLayer(layerId);
      if (!layer) {
        continue;
      }
      for (const property of getMapLibreLayerOpacityProperties(layer.type)) {
        const opacity = readLayerOpacity(
          bakedPaint(layerId, property),
          reference
        );
        if (opacity !== null) {
          return opacity;
        }
      }
    }
    const firstLayerId = entry.model.footprintLayerIds[0];
    return firstLayerId ? layerOpacityMetadata(map, firstLayerId) : 1;
  };

  const footprintShown = (model: TiltedModel): boolean =>
    model.footprintLayerIds.some(
      (layerId) =>
        map.getLayer(layerId) &&
        map.getLayoutProperty(layerId, "visibility") !== "none"
    );

  const apply = () => {
    const tilted = isTilted(map.getPitch(), minPitch);
    const fadedNow = new Set<string>();
    for (const entry of entries.values()) {
      const shown = tilted && footprintShown(entry.model);
      entry.handle.setOpacity(currentOpacity(entry));
      entry.handle.setVisible(shown);
      if (shown) {
        for (const layerId of entry.model.footprintLayerIds) {
          fadeLayer(layerId);
          fadedNow.add(layerId);
        }
      }
    }
    for (const layerId of [...faded.keys()]) {
      if (!fadedNow.has(layerId)) {
        restoreLayer(layerId);
      }
    }
  };

  const sync = () => {
    const found = new Map(
      findTiltedModels(map).map((model) => [model.key, model])
    );
    for (const [key, entry] of entries) {
      if (!found.has(key)) {
        entry.handle.dispose();
        entries.delete(key);
      }
    }
    for (const [key, model] of found) {
      const existing = entries.get(key);
      if (existing) {
        existing.model = model;
        continue;
      }
      const { sourceId, featureId } = model;
      entries.set(key, {
        model,
        opacityReference: takeOpacityReference(model),
        handle: mountGlbModel(map, {
          id: `tilted-model:${key}`,
          url: model.model.url,
          lngLat: [model.model.position.lon, model.model.position.lat],
          height: model.model.position.height,
          heading: model.model.heading ?? 0,
          isHighlighted: () => {
            try {
              return (
                map.getFeatureState({ source: sourceId, id: featureId })
                  ?.selected === true
              );
            } catch {
              return false;
            }
          },
        }),
      });
    }
    apply();
  };

  const onSourceData = (event: MapSourceDataEvent) => {
    // a geojson source got new data (setData), which no styledata announces
    if (event.sourceDataType === "metadata") {
      sync();
    }
  };

  /** a model under the point stands for its footprint feature */
  const provideHits = (
    point: Parameters<GlbModelHandle["raycast"]>[0]
  ): MapGeoJSONFeature[] | null => {
    let nearest: { entry: Entry; distance: number } | null = null;
    for (const entry of entries.values()) {
      const distance = entry.handle.raycast(point);
      if (distance !== null && (!nearest || distance < nearest.distance)) {
        nearest = { entry, distance };
      }
    }
    if (!nearest) {
      return null;
    }
    const { footprintLayerIds, featureId } = nearest.entry.model;
    const layers = footprintLayerIds.filter((layerId) => map.getLayer(layerId));
    if (layers.length === 0) {
      return null;
    }
    // the faded footprint still answers queries; asked without geometry, it
    // is found anywhere in the viewport, not only under the click
    const hits = map.queryRenderedFeatures({
      layers,
      filter: ["==", ["id"], featureId],
    });
    return hits.length > 0 ? hits : null;
  };

  map.on("styledata", sync);
  map.on("sourcedata", onSourceData);
  map.on("pitch", apply);
  const unregisterHits = registerClickHitProvider(map, provideHits);
  sync();

  return () => {
    unregisterHits();
    map.off("styledata", sync);
    map.off("sourcedata", onSourceData);
    map.off("pitch", apply);
    for (const entry of entries.values()) {
      entry.handle.dispose();
    }
    entries.clear();
    for (const layerId of [...faded.keys()]) {
      restoreLayer(layerId);
    }
  };
};
