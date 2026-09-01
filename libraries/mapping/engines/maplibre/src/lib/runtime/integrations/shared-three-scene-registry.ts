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

type SharedSceneHotData = {
  sharedThreeSceneEntries?: WeakMap<MaplibreMap, SharedSceneEntry>;
};

export type SharedThreeSceneLease = {
  layer: SharedThreeSceneLayer;
  release: () => void;
};

const hotData = import.meta.hot?.data as SharedSceneHotData | undefined;
const entries =
  hotData?.sharedThreeSceneEntries ??
  new WeakMap<MaplibreMap, SharedSceneEntry>();
if (hotData) hotData.sharedThreeSceneEntries = entries;

const isSharedThreeSceneLayer = (
  value: unknown
): value is SharedThreeSceneLayer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SharedThreeSceneLayer>;
  return (
    candidate.id === SHARED_SCENE_LAYER_ID &&
    typeof candidate.addRuntime === "function" &&
    typeof candidate.removeRuntime === "function" &&
    typeof candidate.getScene === "function" &&
    typeof candidate.getRenderer === "function"
  );
};

const getMountedSharedThreeSceneLayer = (
  map: MaplibreMap
): SharedThreeSceneLayer | undefined => {
  try {
    const styleLayer = map.getLayer(SHARED_SCENE_LAYER_ID) as
      | { implementation?: unknown }
      | SharedThreeSceneLayer
      | undefined;
    if (isSharedThreeSceneLayer(styleLayer)) return styleLayer;
    return isSharedThreeSceneLayer(styleLayer?.implementation)
      ? styleLayer.implementation
      : undefined;
  } catch {
    return undefined;
  }
};

const getFirstSymbolLayerId = (map: MaplibreMap): string | undefined => {
  try {
    return map.getStyle().layers?.find(({ type }) => type === "symbol")?.id;
  } catch {
    return undefined;
  }
};

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
    // Vite may reload this registry while MapLibre keeps the existing custom
    // layer alive. Reuse that mounted implementation so new runtimes are not
    // attached to a fresh, unmounted Three.js scene.
    const layer =
      getMountedSharedThreeSceneLayer(map) ??
      buildSharedThreeSceneLayer(SHARED_SCENE_LAYER_ID, {
        ambientLightIntensity: 0.58,
      });
    const nextEntry: SharedSceneEntry = {
      layer,
      references: 0,
      disposed: false,
      ensureLayer: () => undefined,
    };
    nextEntry.ensureLayer = () => {
      if (nextEntry.disposed) return;
      try {
        if (!getMountedSharedThreeSceneLayer(map)) {
          map.addLayer(layer, getFirstSymbolLayerId(map));
        }
      } catch {
        // A style replacement or map teardown can race this callback.
      }
    };
    entries.set(map, nextEntry);
    map.on("styledata", nextEntry.ensureLayer);
    map.on("style.load", nextEntry.ensureLayer);
    map.on("idle", nextEntry.ensureLayer);
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
      map.off("style.load", current.ensureLayer);
      map.off("idle", current.ensureLayer);
      try {
        if (getMountedSharedThreeSceneLayer(map) === current.layer) {
          map.removeLayer(current.layer.id);
        }
      } catch {
        // The host may already have disposed or replaced its style.
      }
      current.layer.dispose();
      entries.delete(map);
    },
  };
};
