import type { Map as MaplibreMap } from "maplibre-gl";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";

const SHARED_SCENE_LAYER_ID = "carma-shared-three-scene";

type SharedSceneEntry = {
  layer: SharedThreeSceneLayer;
  references: number;
  disposed: boolean;
  ensureLayer: () => void;
};

export type SharedThreeSceneLease = {
  layer: SharedThreeSceneLayer;
  release: () => void;
};

const entries = new WeakMap<MaplibreMap, SharedSceneEntry>();
const listeners = new WeakMap<MaplibreMap, Set<() => void>>();

const emitStatusChange = (map: MaplibreMap) => {
  for (const listener of listeners.get(map) ?? []) listener();
};

export type SharedThreeSceneStatus = {
  layerVisible: boolean;
  hasShadeableContent: boolean;
};

export const getSharedThreeSceneStatus = (
  map: MaplibreMap
): SharedThreeSceneStatus => {
  const entry = entries.get(map);
  if (!entry || entry.disposed) {
    return { layerVisible: false, hasShadeableContent: false };
  }
  let layerVisible = false;
  try {
    layerVisible = Boolean(map.getLayer(entry.layer.id));
    if (layerVisible && map.getLayoutProperty) {
      layerVisible =
        map.getLayoutProperty(entry.layer.id, "visibility") !== "none";
    }
  } catch {
    layerVisible = false;
  }
  return {
    layerVisible,
    hasShadeableContent: entry.layer.hasShadeableContent(),
  };
};

export const subscribeSharedThreeSceneStatus = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const mapListeners = listeners.get(map) ?? new Set<() => void>();
  mapListeners.add(listener);
  listeners.set(map, mapListeners);
  return () => {
    mapListeners.delete(listener);
    if (mapListeners.size === 0) listeners.delete(map);
  };
};

const getFirstSymbolLayerId = (map: MaplibreMap): string | undefined =>
  map.getStyle().layers?.find(({ type }) => type === "symbol")?.id;

/**
 * Acquire the one shared Three.js custom layer belonging to a MapLibre map.
 * Consumers contribute runtimes or lights and release their lease on cleanup;
 * the last release removes and disposes the shared renderer and scene.
 */
export const acquireSharedThreeScene = (
  map: MaplibreMap
): SharedThreeSceneLease => {
  let entry = entries.get(map);
  if (!entry) {
    const layer = buildSharedThreeSceneLayer(SHARED_SCENE_LAYER_ID, {
      ambientLightIntensity: 0.58,
      onContentChange: () => emitStatusChange(map),
    });
    const nextEntry: SharedSceneEntry = {
      layer,
      references: 0,
      disposed: false,
      ensureLayer: () => undefined,
    };
    nextEntry.ensureLayer = () => {
      if (nextEntry.disposed || !map.isStyleLoaded()) return;
      try {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer, getFirstSymbolLayerId(map));
        }
      } catch {
        // A style replacement or map teardown can race this callback.
      }
      emitStatusChange(map);
    };
    entries.set(map, nextEntry);
    map.on("styledata", nextEntry.ensureLayer);
    nextEntry.ensureLayer();
    entry = nextEntry;
  }

  entry.references += 1;
  let released = false;

  return {
    layer: entry.layer,
    release() {
      if (released) return;
      released = true;
      const current = entries.get(map);
      if (!current || current !== entry) return;
      current.references -= 1;
      if (current.references > 0) return;

      current.disposed = true;
      map.off("styledata", current.ensureLayer);
      try {
        if (map.getLayer(current.layer.id)) map.removeLayer(current.layer.id);
      } catch {
        // The host may already have disposed or replaced its style.
      }
      current.layer.dispose();
      entries.delete(map);
      emitStatusChange(map);
    },
  };
};
