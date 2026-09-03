import {
  convertFilter,
  type FilterSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Map as MaplibreMap } from "maplibre-gl";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";
import {
  getMapStyleLocationLabelFlatOffset,
  isMapStyleLocationLabelLayer,
  type RuntimeStyleLayer,
} from "./map-style-layer-suppression";

const SHARED_SCENE_LAYER_ID = "carma-shared-three-scene";
const SHARED_SCENE_ENTRY_VERSION = 6;
const LOCATION_LABEL_HALO_COLOR = "rgba(0, 0, 0, 0.5)";
const LOCATION_LABEL_HALO_WIDTH = 1;
const TERRAIN_COVERAGE_MARGIN_METERS = 0.5;

type SharedSceneEntry = {
  version: number;
  layer: SharedThreeSceneLayer;
  references: number;
  disposed: boolean;
  savedLocationLabelOffsets: Map<string, SavedLocationLabelOffset>;
  savedLocationLabelHaloWidths: Map<string, SavedLocationLabelHaloWidth>;
  savedLocationLabelHaloColors: Map<string, SavedLocationLabelHaloColor>;
  savedLocationLabelTextColors: Map<string, SavedLocationLabelTextColor>;
  savedLocationLabelFilters: Map<string, SavedLocationLabelFilter>;
  locationLabelColorRequests: Map<symbol, string>;
  ensureLayer: () => void;
};

type SavedLocationLabelOffset = {
  signature: string;
  original: unknown;
  applied: readonly [number, number];
};

type SavedLocationLabelHaloWidth = {
  signature: string;
  original: unknown;
  applied: typeof LOCATION_LABEL_HALO_WIDTH;
};

type SavedLocationLabelHaloColor = {
  signature: string;
  original: unknown;
  applied: typeof LOCATION_LABEL_HALO_COLOR;
};

type SavedLocationLabelTextColor = {
  signature: string;
  original: unknown;
  applied: string;
};

type SavedLocationLabelFilter = {
  signature: string;
  original: unknown;
  appliedSignature: string;
};

type SharedSceneHotData = {
  sharedThreeSceneEntries?: WeakMap<MaplibreMap, SharedSceneEntry>;
};

export type SharedThreeSceneLease = {
  layer: SharedThreeSceneLayer;
  setLocationLabelColor: (color: string | null) => void;
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

const getMapStyleLocationLabelLayers = (
  map: MaplibreMap
): RuntimeStyleLayer[] => {
  try {
    return (
      (map.getStyle().layers as RuntimeStyleLayer[] | undefined)?.filter(
        isMapStyleLocationLabelLayer
      ) ?? []
    );
  } catch {
    return [];
  }
};

const getLayerSignature = (layer: RuntimeStyleLayer): string =>
  `${layer.type}:${String(layer.source)}:${String(
    layer.sourceLayer ?? layer["source-layer"]
  )}`;

const isAppliedOffset = (
  value: unknown,
  applied: readonly [number, number]
): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  value[0] === applied[0] &&
  value[1] === applied[1];

const getStyleValueSignature = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const restoreLocationLabelFilters = (
  map: MaplibreMap,
  savedFilters: Map<string, SavedLocationLabelFilter>
): void => {
  for (const [layerId, saved] of savedFilters) {
    try {
      const runtimeLayer = map.getLayer(layerId) as
        | RuntimeStyleLayer
        | undefined;
      if (
        runtimeLayer &&
        getLayerSignature(runtimeLayer) === saved.signature &&
        getStyleValueSignature(map.getFilter(layerId)) ===
          saved.appliedSignature
      ) {
        map.setFilter(
          layerId,
          saved.original == null ? null : (saved.original as never)
        );
      }
    } catch {
      // The host may already have disposed or replaced its style.
    }
  }
  savedFilters.clear();
};

type TerrainCoverageBox = Readonly<{
  key: string;
  minimumX: number;
  minimumZ: number;
  maximumX: number;
  maximumZ: number;
}>;

type TerrainCoverage = Readonly<{ predicate: unknown }>;

type TerrainCoverageCacheEntry = Readonly<{
  sourceSignature: string;
  coverage: TerrainCoverage;
}>;

const terrainCoverageCache = new WeakMap<
  SharedThreeSceneLayer,
  TerrainCoverageCacheEntry
>();

const containsCoverageBox = (
  outer: TerrainCoverageBox,
  inner: TerrainCoverageBox
): boolean =>
  outer.minimumX <= inner.minimumX &&
  outer.minimumZ <= inner.minimumZ &&
  outer.maximumX >= inner.maximumX &&
  outer.maximumZ >= inner.maximumZ;

const getTerrainCoverageFilter = (
  layer: SharedThreeSceneLayer
): TerrainCoverage | null => {
  const terrainRuntimes = (layer.getRuntimes?.() ?? []).filter(
    (runtime) => runtime.providesTerrain === true
  );
  if (terrainRuntimes.length === 0) return null;

  const boxes: TerrainCoverageBox[] = [];
  for (const runtime of terrainRuntimes) {
    for (const volume of runtime.getActiveTileVolumes?.() ?? []) {
      const [minimumX, , minimumZ] = volume.minimum;
      const [maximumX, , maximumZ] = volume.maximum;
      if (
        ![minimumX, minimumZ, maximumX, maximumZ].every(Number.isFinite) ||
        minimumX > maximumX ||
        minimumZ > maximumZ
      ) {
        continue;
      }
      boxes.push({
        key: `${runtime.id}:${volume.id}`,
        minimumX: minimumX - TERRAIN_COVERAGE_MARGIN_METERS,
        minimumZ: minimumZ - TERRAIN_COVERAGE_MARGIN_METERS,
        maximumX: maximumX + TERRAIN_COVERAGE_MARGIN_METERS,
        maximumZ: maximumZ + TERRAIN_COVERAGE_MARGIN_METERS,
      });
    }
  }

  // Style and label updates can call this repeatedly while the terrain
  // selection is unchanged. Keep the signature in the runtime's stable tile
  // order so the hot path remains linear; an order-only change merely causes
  // one harmless cache miss.
  const sourceSignature = JSON.stringify(
    boxes.map(({ key, minimumX, minimumZ, maximumX, maximumZ }) => [
      key,
      minimumX,
      minimumZ,
      maximumX,
      maximumZ,
    ])
  );
  const cached = terrainCoverageCache.get(layer);
  if (cached?.sourceSignature === sourceSignature) return cached.coverage;

  boxes.sort((a, b) => {
    const areaA = (a.maximumX - a.minimumX) * (a.maximumZ - a.minimumZ);
    const areaB = (b.maximumX - b.minimumX) * (b.maximumZ - b.minimumZ);
    return areaB - areaA || a.key.localeCompare(b.key);
  });
  const coverageBoxes: TerrainCoverageBox[] = [];
  for (const box of boxes) {
    if (
      coverageBoxes.some((candidate) => containsCoverageBox(candidate, box))
    ) {
      continue;
    }
    coverageBoxes.push(box);
  }

  const coordinates = coverageBoxes.flatMap((box) => {
    const southWest = layer.projectSceneToLngLat?.([
      box.minimumX,
      0,
      box.minimumZ,
    ]);
    const southEast = layer.projectSceneToLngLat?.([
      box.maximumX,
      0,
      box.minimumZ,
    ]);
    const northEast = layer.projectSceneToLngLat?.([
      box.maximumX,
      0,
      box.maximumZ,
    ]);
    const northWest = layer.projectSceneToLngLat?.([
      box.minimumX,
      0,
      box.maximumZ,
    ]);
    if (!southWest || !southEast || !northEast || !northWest) return [];
    return [[[southWest, southEast, northEast, northWest, southWest]]];
  });
  const predicate =
    coordinates.length === 0
      ? false
      : ["within", { type: "MultiPolygon", coordinates }];
  const coverage = { predicate };
  terrainCoverageCache.set(layer, { sourceSignature, coverage });
  return coverage;
};

const applyLocationLabelCoverageFilters = (
  map: MaplibreMap,
  sceneLayer: SharedThreeSceneLayer,
  layers: RuntimeStyleLayer[],
  savedFilters: Map<string, SavedLocationLabelFilter>
): void => {
  const coverage = getTerrainCoverageFilter(sceneLayer);
  if (!coverage) {
    restoreLocationLabelFilters(map, savedFilters);
    return;
  }

  const currentIds = new Set(layers.map(({ id }) => id));
  for (const id of savedFilters.keys()) {
    if (!currentIds.has(id)) savedFilters.delete(id);
  }
  for (const layer of layers) {
    const signature = getLayerSignature(layer);
    try {
      const current = map.getFilter(layer.id);
      const currentSignature = getStyleValueSignature(current);
      let saved = savedFilters.get(layer.id);
      if (
        !saved ||
        saved.signature !== signature ||
        currentSignature !== saved.appliedSignature
      ) {
        saved = { signature, original: current, appliedSignature: "" };
        savedFilters.set(layer.id, saved);
      }
      const originalExpression =
        saved.original == null
          ? null
          : convertFilter(saved.original as FilterSpecification);
      const applied =
        originalExpression != null
          ? ["all", originalExpression, coverage.predicate]
          : coverage.predicate;
      const appliedSignature = getStyleValueSignature(applied);
      saved.appliedSignature = appliedSignature;
      if (currentSignature !== appliedSignature) {
        map.setFilter(layer.id, applied as never);
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
};

const restoreLocationLabelPaint = (
  map: MaplibreMap,
  property: "text-color" | "text-halo-color" | "text-halo-width",
  savedValues: Map<
    string,
    | SavedLocationLabelHaloWidth
    | SavedLocationLabelHaloColor
    | SavedLocationLabelTextColor
  >
): void => {
  for (const [layerId, saved] of savedValues) {
    try {
      const runtimeLayer = map.getLayer(layerId) as
        | RuntimeStyleLayer
        | undefined;
      if (
        runtimeLayer &&
        getLayerSignature(runtimeLayer) === saved.signature &&
        map.getPaintProperty(layerId, property) === saved.applied
      ) {
        map.setPaintProperty(
          layerId,
          property,
          saved.original === undefined ? null : saved.original
        );
      }
    } catch {
      // The host may already have disposed or replaced its style.
    }
  }
  savedValues.clear();
};

const applyLocationLabelOffsets = (
  map: MaplibreMap,
  layers: RuntimeStyleLayer[],
  savedOffsets: Map<string, SavedLocationLabelOffset>,
  savedHaloWidths: Map<string, SavedLocationLabelHaloWidth>,
  savedHaloColors: Map<string, SavedLocationLabelHaloColor>,
  savedTextColors: Map<string, SavedLocationLabelTextColor>,
  textColor: string | null
): void => {
  const currentIds = new Set(layers.map(({ id }) => id));
  for (const id of savedOffsets.keys()) {
    if (!currentIds.has(id)) savedOffsets.delete(id);
  }
  for (const id of savedHaloWidths.keys()) {
    if (!currentIds.has(id)) savedHaloWidths.delete(id);
  }
  for (const id of savedHaloColors.keys()) {
    if (!currentIds.has(id)) savedHaloColors.delete(id);
  }
  for (const id of savedTextColors.keys()) {
    if (!currentIds.has(id)) savedTextColors.delete(id);
  }
  if (textColor === null) {
    restoreLocationLabelPaint(map, "text-halo-width", savedHaloWidths);
    restoreLocationLabelPaint(map, "text-halo-color", savedHaloColors);
    restoreLocationLabelPaint(map, "text-color", savedTextColors);
  }

  for (const layer of layers) {
    const applied = getMapStyleLocationLabelFlatOffset(layer);
    if (!applied) continue;
    const signature = getLayerSignature(layer);
    try {
      const current = map.getLayoutProperty(layer.id, "text-offset");
      let saved = savedOffsets.get(layer.id);
      if (
        !saved ||
        saved.signature !== signature ||
        !isAppliedOffset(current, saved.applied)
      ) {
        saved = { signature, original: current, applied };
        savedOffsets.set(layer.id, saved);
      }
      if (!isAppliedOffset(current, applied)) {
        map.setLayoutProperty(layer.id, "text-offset", [...applied]);
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
    if (textColor === null) continue;
    try {
      const current = map.getPaintProperty(layer.id, "text-halo-width");
      let saved = savedHaloWidths.get(layer.id);
      if (
        !saved ||
        saved.signature !== signature ||
        current !== saved.applied
      ) {
        saved = {
          signature,
          original: current,
          applied: LOCATION_LABEL_HALO_WIDTH,
        };
        savedHaloWidths.set(layer.id, saved);
      }
      if (current !== LOCATION_LABEL_HALO_WIDTH) {
        map.setPaintProperty(
          layer.id,
          "text-halo-width",
          LOCATION_LABEL_HALO_WIDTH
        );
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
    try {
      const current = map.getPaintProperty(layer.id, "text-halo-color");
      let saved = savedHaloColors.get(layer.id);
      if (
        !saved ||
        saved.signature !== signature ||
        current !== saved.applied
      ) {
        saved = {
          signature,
          original: current,
          applied: LOCATION_LABEL_HALO_COLOR,
        };
        savedHaloColors.set(layer.id, saved);
      }
      if (current !== LOCATION_LABEL_HALO_COLOR) {
        map.setPaintProperty(
          layer.id,
          "text-halo-color",
          LOCATION_LABEL_HALO_COLOR
        );
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
    try {
      const current = map.getPaintProperty(layer.id, "text-color");
      let saved = savedTextColors.get(layer.id);
      if (
        !saved ||
        saved.signature !== signature ||
        current !== saved.applied
      ) {
        saved = { signature, original: current, applied: textColor };
        savedTextColors.set(layer.id, saved);
      } else {
        saved.applied = textColor;
      }
      if (current !== textColor) {
        map.setPaintProperty(layer.id, "text-color", textColor);
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
};

const getLocationLabelColor = (entry: SharedSceneEntry): string | null => {
  let color: string | null = null;
  for (const requestedColor of entry.locationLabelColorRequests.values()) {
    color = requestedColor;
  }
  return color;
};

const ensureSharedLayerOrder = (
  map: MaplibreMap,
  sceneLayer: SharedThreeSceneLayer,
  savedOffsets: Map<string, SavedLocationLabelOffset>,
  savedHaloWidths: Map<string, SavedLocationLabelHaloWidth>,
  savedHaloColors: Map<string, SavedLocationLabelHaloColor>,
  savedTextColors: Map<string, SavedLocationLabelTextColor>,
  savedFilters: Map<string, SavedLocationLabelFilter>,
  textColor: string | null
): void => {
  const layerOrder = map.getLayersOrder();
  const layerIndex = layerOrder.indexOf(SHARED_SCENE_LAYER_ID);
  if (layerIndex < 0) return;

  const locationLabelLayers = getMapStyleLocationLabelLayers(map);
  applyLocationLabelCoverageFilters(
    map,
    sceneLayer,
    locationLabelLayers,
    savedFilters
  );
  applyLocationLabelOffsets(
    map,
    locationLabelLayers,
    savedOffsets,
    savedHaloWidths,
    savedHaloColors,
    savedTextColors,
    textColor
  );
  const locationLabelIds = locationLabelLayers
    .map(({ id }) => id)
    .filter((id) => layerOrder.includes(id));
  const locationLabelSet = new Set(locationLabelIds);
  const expectedOrder = [
    ...layerOrder.filter(
      (id) => id !== SHARED_SCENE_LAYER_ID && !locationLabelSet.has(id)
    ),
    SHARED_SCENE_LAYER_ID,
    ...locationLabelIds,
  ];
  if (expectedOrder.every((id, index) => layerOrder[index] === id)) return;

  // Capture the complete authored style below Three, then redraw only place
  // names above it. Roads and road labels remain part of the projected,
  // shadowed terrain texture instead of being drawn a second time.
  map.moveLayer(SHARED_SCENE_LAYER_ID);
  for (const id of locationLabelIds) map.moveLayer(id);
};

const configureEnsureLayer = (
  map: MaplibreMap,
  entry: SharedSceneEntry
): void => {
  entry.ensureLayer = () => {
    if (entry.disposed) return;
    try {
      if (!getMountedSharedThreeSceneLayer(map)) map.addLayer(entry.layer);
      ensureSharedLayerOrder(
        map,
        entry.layer,
        entry.savedLocationLabelOffsets,
        entry.savedLocationLabelHaloWidths,
        entry.savedLocationLabelHaloColors,
        entry.savedLocationLabelTextColors,
        entry.savedLocationLabelFilters,
        getLocationLabelColor(entry)
      );
    } catch {
      // A style replacement or map teardown can race this callback.
    }
  };
};

const addEnsureLayerListeners = (
  map: MaplibreMap,
  entry: SharedSceneEntry
): void => {
  map.on("styledata", entry.ensureLayer);
  map.on("style.load", entry.ensureLayer);
  map.on("idle", entry.ensureLayer);
};

const removeEnsureLayerListeners = (
  map: MaplibreMap,
  entry: SharedSceneEntry
): void => {
  map.off("styledata", entry.ensureLayer);
  map.off("style.load", entry.ensureLayer);
  map.off("idle", entry.ensureLayer);
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
  if (entry && entry.version !== SHARED_SCENE_ENTRY_VERSION) {
    removeEnsureLayerListeners(map, entry);
    entry.version = SHARED_SCENE_ENTRY_VERSION;
    entry.savedLocationLabelOffsets ??= new Map();
    entry.savedLocationLabelHaloWidths ??= new Map();
    entry.savedLocationLabelHaloColors ??= new Map();
    entry.savedLocationLabelTextColors ??= new Map();
    entry.savedLocationLabelFilters ??= new Map();
    entry.locationLabelColorRequests ??= new Map();
    configureEnsureLayer(map, entry);
    addEnsureLayerListeners(map, entry);
    entry.ensureLayer();
  }
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
      version: SHARED_SCENE_ENTRY_VERSION,
      layer,
      references: 0,
      disposed: false,
      savedLocationLabelOffsets: new Map(),
      savedLocationLabelHaloWidths: new Map(),
      savedLocationLabelHaloColors: new Map(),
      savedLocationLabelTextColors: new Map(),
      savedLocationLabelFilters: new Map(),
      locationLabelColorRequests: new Map(),
      ensureLayer: () => undefined,
    };
    configureEnsureLayer(map, nextEntry);
    entries.set(map, nextEntry);
    addEnsureLayerListeners(map, nextEntry);
    nextEntry.ensureLayer();
    entry = nextEntry;
  }

  entry.references += 1;
  const labelColorRequestId = Symbol("location-label-color");
  let released = false;

  return {
    layer: entry.layer,
    setLocationLabelColor(color) {
      const current = entries.get(map);
      if (!current || current !== entry || released) return;
      const existingColor =
        current.locationLabelColorRequests.get(labelColorRequestId);
      if (color === null) {
        if (existingColor === undefined) return;
        current.locationLabelColorRequests.delete(labelColorRequestId);
      } else {
        if (existingColor === color) return;
        current.locationLabelColorRequests.set(labelColorRequestId, color);
      }
      current.ensureLayer();
    },
    release() {
      if (released) return;
      released = true;
      const current = entries.get(map);
      if (!current || current !== entry) return;
      current.locationLabelColorRequests.delete(labelColorRequestId);
      current.references -= 1;
      if (current.references > 0) {
        current.ensureLayer();
        return;
      }

      current.disposed = true;
      removeEnsureLayerListeners(map, current);
      try {
        if (getMountedSharedThreeSceneLayer(map) === current.layer) {
          map.removeLayer(current.layer.id);
        }
      } catch {
        // The host may already have disposed or replaced its style.
      }
      for (const [layerId, saved] of current.savedLocationLabelOffsets) {
        try {
          const runtimeLayer = map.getLayer(layerId) as
            | RuntimeStyleLayer
            | undefined;
          if (
            runtimeLayer &&
            getLayerSignature(runtimeLayer) === saved.signature &&
            isAppliedOffset(
              map.getLayoutProperty(layerId, "text-offset"),
              saved.applied
            )
          ) {
            map.setLayoutProperty(
              layerId,
              "text-offset",
              saved.original === undefined ? null : saved.original
            );
          }
        } catch {
          // The host may already have disposed or replaced its style.
        }
      }
      restoreLocationLabelPaint(
        map,
        "text-halo-width",
        current.savedLocationLabelHaloWidths
      );
      restoreLocationLabelPaint(
        map,
        "text-halo-color",
        current.savedLocationLabelHaloColors
      );
      restoreLocationLabelPaint(
        map,
        "text-color",
        current.savedLocationLabelTextColors
      );
      restoreLocationLabelFilters(map, current.savedLocationLabelFilters);
      terrainCoverageCache.delete(current.layer);
      current.layer.dispose();
      entries.delete(map);
    },
  };
};
