import {
  convertFilter,
  type FilterSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Map as MaplibreMap } from "maplibre-gl";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";
import {
  getMapStyleLocationLabelFlatOffset,
  isMapStylePointLabelLayer,
  isMapStyleRoadLabelLayer,
  type RuntimeStyleLayer,
} from "./map-style-layer-suppression";

const SHARED_SCENE_LAYER_ID = "carma-shared-three-scene";
const SHARED_SCENE_ENTRY_VERSION = 11;
const TERRAIN_COVERAGE_MARGIN_METERS = 0.5;
/** Neighbouring tile boxes overlap by twice the margin; merge anything closer. */
const TERRAIN_COVERAGE_MERGE_TOLERANCE_METERS = 0.01;
/**
 * Label overlay maintenance rewrites the filter and paint of every point-label
 * layer. MapLibre schedules a repaint per write and that repaint's `idle`
 * lands here again, so the maintenance is rate limited instead of running on
 * every style or idle event.
 */
const LABEL_OVERLAY_MAINTENANCE_INTERVAL_MS = 1000;

type PointLabelLayersCache = {
  orderSignature: string;
  layers: RuntimeStyleLayer[];
};

type SharedSceneEntry = {
  version: number;
  layer: SharedThreeSceneLayer;
  references: number;
  disposed: boolean;
  pointLabelLayersCache: PointLabelLayersCache | null;
  labelMaintenanceTimer: ReturnType<typeof setTimeout> | null;
  lastLabelMaintenanceMs: number;
  savedLocationLabelOffsets: Map<string, SavedLocationLabelOffset>;
  savedLocationLabelHaloWidths: Map<string, SavedLocationLabelHaloWidth>;
  savedLocationLabelHaloColors: Map<string, SavedLocationLabelHaloColor>;
  savedLocationLabelTextColors: Map<string, SavedLocationLabelTextColor>;
  savedLocationLabelFilters: Map<string, SavedLocationLabelFilter>;
  savedPointLabelVisibilities: Map<string, SavedPointLabelVisibility>;
  locationLabelColorRequests: Map<symbol, string>;
  pointLabelOverlayVisibilityRequests: Map<symbol, boolean>;
  /** Rate-limited maintenance; safe to register as a MapLibre listener. */
  ensureLayer: (event?: unknown) => void;
  /** Immediate maintenance for user-driven changes. */
  ensureLayerNow: () => void;
};

type SavedLocationLabelOffset = {
  signature: string;
  original: unknown;
  applied: readonly [number, number];
};

type SavedLocationLabelHaloWidth = {
  signature: string;
  original: unknown;
  applied: number;
};

type SavedLocationLabelHaloColor = {
  signature: string;
  original: unknown;
  applied: string;
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
  /** The runtime filter object MapLibre handed back after the last write. */
  appliedFilter?: unknown;
  /** The coverage the applied filter was built from. */
  coverage?: TerrainCoverage;
};

type SavedPointLabelVisibility = {
  signature: string;
  original: unknown;
};

type SharedSceneHotData = {
  sharedThreeSceneEntries?: WeakMap<MaplibreMap, SharedSceneEntry>;
};

export type SharedThreeSceneLease = {
  layer: SharedThreeSceneLayer;
  setLocationLabelColor: (color: string | null) => void;
  setPointLabelOverlayVisible: (visible: boolean) => void;
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

const getMapStylePointLabelLayers = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layerOrder: readonly string[]
): RuntimeStyleLayer[] => {
  // `getStyle()` serializes every layer including the coverage filters, so
  // the classification is reused until the layer list itself changes.
  const orderSignature = layerOrder.join("\n");
  const cached = entry.pointLabelLayersCache;
  if (cached?.orderSignature === orderSignature) return cached.layers;
  try {
    const layers =
      (map.getStyle().layers as RuntimeStyleLayer[] | undefined)?.filter(
        isMapStylePointLabelLayer
      ) ?? [];
    entry.pointLabelLayersCache = { orderSignature, layers };
    return layers;
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

const nearlyEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) <= TERRAIN_COVERAGE_MERGE_TOLERANCE_METERS;

/**
 * Union grid-aligned tile boxes along one axis: boxes that share their extent
 * on the other axis and touch or overlap along `axis` collapse into one.
 */
const mergeCoverageBoxesAlong = (
  boxes: readonly TerrainCoverageBox[],
  axis: "x" | "z"
): TerrainCoverageBox[] => {
  const [minimum, maximum, otherMinimum, otherMaximum] =
    axis === "x"
      ? (["minimumX", "maximumX", "minimumZ", "maximumZ"] as const)
      : (["minimumZ", "maximumZ", "minimumX", "maximumX"] as const);
  const sorted = [...boxes].sort(
    (a, b) =>
      a[otherMinimum] - b[otherMinimum] ||
      a[otherMaximum] - b[otherMaximum] ||
      a[minimum] - b[minimum]
  );
  const merged: TerrainCoverageBox[] = [];
  for (const box of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      nearlyEqual(previous[otherMinimum], box[otherMinimum]) &&
      nearlyEqual(previous[otherMaximum], box[otherMaximum]) &&
      box[minimum] <=
        previous[maximum] + TERRAIN_COVERAGE_MERGE_TOLERANCE_METERS
    ) {
      const extent = Math.max(previous[maximum], box[maximum]);
      merged[merged.length - 1] =
        axis === "x"
          ? { ...previous, maximumX: extent }
          : { ...previous, maximumZ: extent };
      continue;
    }
    merged.push(box);
  }
  return merged;
};

/**
 * Collapse a quadtree tile selection into far fewer rectangles. Hundreds of
 * per-tile polygons in a `within` filter make every symbol layout and every
 * style serialization pay for the polygon count.
 */
const mergeCoverageBoxes = (
  boxes: readonly TerrainCoverageBox[]
): TerrainCoverageBox[] =>
  mergeCoverageBoxesAlong(mergeCoverageBoxesAlong(boxes, "x"), "z");

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

  const coordinates = mergeCoverageBoxes(coverageBoxes).flatMap((box) => {
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
      let saved = savedFilters.get(layer.id);
      if (
        saved &&
        saved.signature === signature &&
        saved.coverage === coverage &&
        saved.appliedFilter !== undefined &&
        current === saved.appliedFilter
      ) {
        // MapLibre still holds the object of the last write, so nothing else
        // touched this filter; skip serializing the coverage polygon again.
        continue;
      }
      const currentSignature = getStyleValueSignature(current);
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
      saved.coverage = coverage;
      if (currentSignature !== appliedSignature) {
        // The expression is assembled here from validated parts; skipping the
        // style-spec validation saves a full walk of the coverage polygon.
        map.setFilter(layer.id, applied as never, { validate: false });
        saved.appliedFilter = map.getFilter(layer.id);
      } else {
        saved.appliedFilter = current;
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

const isWhiteLabelHalo = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "white" || compact === "#fff" || compact === "#ffffff") {
    return true;
  }
  return /^rgba?\(255,255,255(?:,(?:0?\.\d+|1(?:\.0+)?))?\)$/.test(compact);
};

const restoreLocationLabelOffsets = (
  map: MaplibreMap,
  savedOffsets: Map<string, SavedLocationLabelOffset>
): void => {
  for (const [layerId, saved] of savedOffsets) {
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
  savedOffsets.clear();
};

const setPointLabelLayersHidden = (
  map: MaplibreMap,
  layers: RuntimeStyleLayer[],
  savedVisibilities: Map<string, SavedPointLabelVisibility>,
  hidden: boolean
): void => {
  if (!hidden) {
    for (const [layerId, saved] of savedVisibilities) {
      try {
        const runtimeLayer = map.getLayer(layerId) as
          | RuntimeStyleLayer
          | undefined;
        if (
          runtimeLayer &&
          getLayerSignature(runtimeLayer) === saved.signature &&
          map.getLayoutProperty(layerId, "visibility") === "none"
        ) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            saved.original === undefined ? null : saved.original
          );
        }
      } catch {
        // The host may already have disposed or replaced its style.
      }
    }
    savedVisibilities.clear();
    return;
  }

  const currentIds = new Set(layers.map(({ id }) => id));
  for (const id of savedVisibilities.keys()) {
    if (!currentIds.has(id)) savedVisibilities.delete(id);
  }
  for (const layer of layers) {
    try {
      const signature = getLayerSignature(layer);
      const current = map.getLayoutProperty(layer.id, "visibility");
      const saved = savedVisibilities.get(layer.id);
      if (!saved || saved.signature !== signature) {
        savedVisibilities.set(layer.id, { signature, original: current });
      }
      if (current !== "none") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
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
    const signature = getLayerSignature(layer);
    if (applied) {
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
    }
    if (textColor === null) continue;
    let authoredHaloColor: unknown;
    try {
      authoredHaloColor =
        savedHaloColors.get(layer.id)?.original ??
        map.getPaintProperty(layer.id, "text-halo-color");
    } catch {
      continue;
    }
    if (
      authoredHaloColor == null ||
      (!isMapStyleRoadLabelLayer(layer) && !isWhiteLabelHalo(authoredHaloColor))
    ) {
      continue;
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
          applied: textColor,
        };
        savedHaloColors.set(layer.id, saved);
      } else {
        saved.applied = textColor;
      }
      if (current !== textColor) {
        map.setPaintProperty(layer.id, "text-halo-color", textColor);
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

const isPointLabelOverlayVisible = (entry: SharedSceneEntry): boolean => {
  let visible = true;
  for (const requestedVisibility of entry.pointLabelOverlayVisibilityRequests.values()) {
    visible = requestedVisibility;
  }
  return visible;
};

const ensureSharedLayerOrder = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  textColor: string | null,
  pointLabelOverlayVisible: boolean
): void => {
  const sceneLayer = entry.layer;
  const savedOffsets = entry.savedLocationLabelOffsets;
  const savedHaloWidths = entry.savedLocationLabelHaloWidths;
  const savedHaloColors = entry.savedLocationLabelHaloColors;
  const savedTextColors = entry.savedLocationLabelTextColors;
  const savedFilters = entry.savedLocationLabelFilters;
  const savedVisibilities = entry.savedPointLabelVisibilities;
  const layerOrder = map.getLayersOrder();
  const layerIndex = layerOrder.indexOf(SHARED_SCENE_LAYER_ID);
  if (layerIndex < 0) return;

  const locationLabelLayers = getMapStylePointLabelLayers(
    map,
    entry,
    layerOrder
  );
  if (!pointLabelOverlayVisible) {
    restoreLocationLabelOffsets(map, savedOffsets);
    restoreLocationLabelPaint(map, "text-halo-width", savedHaloWidths);
    restoreLocationLabelPaint(map, "text-halo-color", savedHaloColors);
    restoreLocationLabelPaint(map, "text-color", savedTextColors);
    restoreLocationLabelFilters(map, savedFilters);
    setPointLabelLayersHidden(
      map,
      locationLabelLayers,
      savedVisibilities,
      true
    );
    return;
  }
  setPointLabelLayersHidden(map, locationLabelLayers, savedVisibilities, false);
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

  // Capture the complete authored style below Three, then redraw point-based
  // labels above it. Line labels remain part of the projected, shadowed
  // terrain texture instead of being drawn a second time.
  map.moveLayer(SHARED_SCENE_LAYER_ID);
  for (const id of locationLabelIds) map.moveLayer(id);
};

const clearLabelMaintenanceTimer = (entry: SharedSceneEntry): void => {
  if (entry.labelMaintenanceTimer === null) return;
  clearTimeout(entry.labelMaintenanceTimer);
  entry.labelMaintenanceTimer = null;
};

const mountSharedLayer = (map: MaplibreMap, entry: SharedSceneEntry): void => {
  try {
    if (!getMountedSharedThreeSceneLayer(map)) map.addLayer(entry.layer);
  } catch {
    // A style replacement or map teardown can race this callback.
  }
};

const configureEnsureLayer = (
  map: MaplibreMap,
  entry: SharedSceneEntry
): void => {
  entry.ensureLayerNow = () => {
    if (entry.disposed) return;
    clearLabelMaintenanceTimer(entry);
    entry.lastLabelMaintenanceMs = Date.now();
    mountSharedLayer(map, entry);
    try {
      ensureSharedLayerOrder(
        map,
        entry,
        getLocationLabelColor(entry),
        isPointLabelOverlayVisible(entry)
      );
    } catch {
      // A style replacement or map teardown can race this callback.
    }
  };
  entry.ensureLayer = (event) => {
    if (entry.disposed) return;
    if ((event as { type?: unknown } | undefined)?.type === "style.load") {
      // A new style carries new layer objects; drop the classification.
      entry.pointLabelLayersCache = null;
      entry.ensureLayerNow();
      return;
    }
    const elapsedMs = Date.now() - entry.lastLabelMaintenanceMs;
    if (elapsedMs >= LABEL_OVERLAY_MAINTENANCE_INTERVAL_MS) {
      entry.ensureLayerNow();
      return;
    }
    // Mounting is cheap and must not wait: the custom layer has to exist for
    // the next frame. Only the label overlay maintenance is rate limited.
    mountSharedLayer(map, entry);
    if (entry.labelMaintenanceTimer !== null) return;
    entry.labelMaintenanceTimer = setTimeout(() => {
      entry.labelMaintenanceTimer = null;
      entry.ensureLayerNow();
    }, LABEL_OVERLAY_MAINTENANCE_INTERVAL_MS - elapsedMs);
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
    if (entry.labelMaintenanceTimer != null) {
      clearTimeout(entry.labelMaintenanceTimer);
    }
    entry.labelMaintenanceTimer = null;
    entry.lastLabelMaintenanceMs = Number.NEGATIVE_INFINITY;
    entry.pointLabelLayersCache = null;
    restoreLocationLabelOffsets(
      map,
      entry.savedLocationLabelOffsets ?? new Map()
    );
    restoreLocationLabelPaint(
      map,
      "text-halo-width",
      entry.savedLocationLabelHaloWidths ?? new Map()
    );
    restoreLocationLabelPaint(
      map,
      "text-halo-color",
      entry.savedLocationLabelHaloColors ?? new Map()
    );
    restoreLocationLabelPaint(
      map,
      "text-color",
      entry.savedLocationLabelTextColors ?? new Map()
    );
    restoreLocationLabelFilters(
      map,
      entry.savedLocationLabelFilters ?? new Map()
    );
    setPointLabelLayersHidden(
      map,
      [],
      entry.savedPointLabelVisibilities ?? new Map(),
      false
    );
    entry.version = SHARED_SCENE_ENTRY_VERSION;
    entry.savedLocationLabelOffsets ??= new Map();
    entry.savedLocationLabelHaloWidths ??= new Map();
    entry.savedLocationLabelHaloColors ??= new Map();
    entry.savedLocationLabelTextColors ??= new Map();
    entry.savedLocationLabelFilters ??= new Map();
    entry.savedPointLabelVisibilities ??= new Map();
    entry.locationLabelColorRequests ??= new Map();
    entry.pointLabelOverlayVisibilityRequests ??= new Map();
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
      pointLabelLayersCache: null,
      labelMaintenanceTimer: null,
      lastLabelMaintenanceMs: Number.NEGATIVE_INFINITY,
      savedLocationLabelOffsets: new Map(),
      savedLocationLabelHaloWidths: new Map(),
      savedLocationLabelHaloColors: new Map(),
      savedLocationLabelTextColors: new Map(),
      savedLocationLabelFilters: new Map(),
      savedPointLabelVisibilities: new Map(),
      locationLabelColorRequests: new Map(),
      pointLabelOverlayVisibilityRequests: new Map(),
      ensureLayer: () => undefined,
      ensureLayerNow: () => undefined,
    };
    configureEnsureLayer(map, nextEntry);
    entries.set(map, nextEntry);
    addEnsureLayerListeners(map, nextEntry);
    nextEntry.ensureLayer();
    entry = nextEntry;
  }

  entry.references += 1;
  const labelColorRequestId = Symbol("location-label-color");
  const labelVisibilityRequestId = Symbol("point-label-overlay-visibility");
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
    setPointLabelOverlayVisible(visible) {
      const current = entries.get(map);
      if (!current || current !== entry || released) return;
      if (
        current.pointLabelOverlayVisibilityRequests.get(
          labelVisibilityRequestId
        ) === visible
      ) {
        return;
      }
      current.pointLabelOverlayVisibilityRequests.set(
        labelVisibilityRequestId,
        visible
      );
      // A user toggle should repaint in place, not after the rate limit.
      current.ensureLayerNow();
    },
    release() {
      if (released) return;
      released = true;
      const current = entries.get(map);
      if (!current || current !== entry) return;
      current.locationLabelColorRequests.delete(labelColorRequestId);
      current.pointLabelOverlayVisibilityRequests.delete(
        labelVisibilityRequestId
      );
      current.references -= 1;
      if (current.references > 0) {
        current.ensureLayer();
        return;
      }

      current.disposed = true;
      clearLabelMaintenanceTimer(current);
      removeEnsureLayerListeners(map, current);
      try {
        if (getMountedSharedThreeSceneLayer(map) === current.layer) {
          map.removeLayer(current.layer.id);
        }
      } catch {
        // The host may already have disposed or replaced its style.
      }
      restoreLocationLabelOffsets(map, current.savedLocationLabelOffsets);
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
      setPointLabelLayersHidden(
        map,
        [],
        current.savedPointLabelVisibilities,
        false
      );
      terrainCoverageCache.delete(current.layer);
      current.layer.dispose();
      entries.delete(map);
    },
  };
};
