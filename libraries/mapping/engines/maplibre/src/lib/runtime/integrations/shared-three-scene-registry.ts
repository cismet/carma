import {
  convertFilter,
  type FilterSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Map as MaplibreMap } from "maplibre-gl";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import type { SharedThreeSceneLayer } from "./shared-three-scene-layer";
import {
  getMapStylePointLabelLiftMeters,
  isMapStyleContourLineLayer,
  isMapStyleElevationLabelLayer,
  isMapStyleHouseNumberLabelLayer,
  isMapStylePointLabelLayer,
  isMapStyleRoadLabelLayer,
  isMapStyleRoadShieldLayer,
  isMapStyleWaterLabelLayer,
  type RuntimeStyleLayer,
} from "./map-style-layer-suppression";

const SHARED_SCENE_LAYER_ID = "carma-shared-three-scene";
const SHARED_SCENE_ENTRY_VERSION = 14;
/** Contour lines stay in the mesh drape at half strength. */
const MESH_DRAPE_CONTOUR_OPACITY = 0.5;
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;
const MAPLIBRE_TILE_SIZE = 512;
/** Keep a lifted place name inside the view at high zoom. */
const MAX_LABEL_LIFT_VIEWPORT_FRACTION = 0.35;
/** Halo behind street names and house numbers on the mesh drape. */
const MESH_LABEL_HALO_COLOR = "#808080";
/** Draped street names are read off a textured surface; give them more body. */
const MESH_STREET_LABEL_SIZE_FACTOR = 1.4;
const MESH_STREET_LABEL_HALO_WIDTH = 1.5;
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
  /** All style layers, reused until the layer list changes. */
  styleLayersCache: PointLabelLayersCache | null;
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
  /** Street names and house numbers in sun color on a textured mesh. */
  meshLabelStyleRequests: Map<symbol, boolean>;
  savedMeshLabelPaint: Map<string, SavedMeshLabelPaint>;
  /** Fills, strokes and rasters hidden below Three while a mesh is draped. */
  savedMeshDrapeVisibilities: Map<string, SavedPointLabelVisibility>;
  savedContourOpacities: Map<string, SavedPointLabelVisibility>;
  /** Place names floating above the scene, with their saved translate paint. */
  liftLayers: LabelLiftLayer[];
  savedLabelLifts: Map<string, SavedLabelLift>;
  /** Recolored sprite copies while the mesh label style is on. */
  tintedImages: Map<string, TintedSpriteImage>;
  /** Per-frame lift update; registered as a MapLibre `move` listener. */
  updateLabelLift: () => void;
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

type SavedMeshLabelPaint = {
  layerId: string;
  property: MeshLabelPaintProperty;
  signature: string;
  original: unknown;
  applied: unknown;
};

type LabelLiftLayer = { id: string; signature: string; meters: number };

type SavedLabelLift = {
  signature: string;
  originalTranslate: unknown;
  originalAnchor: unknown;
  appliedPixels: number;
};

type SpriteImageData = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

type TintedSpriteImage = {
  original: SpriteImageData;
  color: string;
};

type MeshLabelPaintProperty =
  | "text-color"
  | "text-halo-color"
  | "text-halo-width"
  | "text-halo-blur"
  | "icon-color"
  | "text-size";

/** `text-size` is a layout property; the rest is paint. */
const MESH_LABEL_LAYOUT_PROPERTIES = new Set<MeshLabelPaintProperty>([
  "text-size",
]);

const getMeshLabelProperty = (
  map: MaplibreMap,
  layerId: string,
  property: MeshLabelPaintProperty
): unknown =>
  MESH_LABEL_LAYOUT_PROPERTIES.has(property)
    ? map.getLayoutProperty(layerId, property)
    : map.getPaintProperty(layerId, property);

const setMeshLabelProperty = (
  map: MaplibreMap,
  layerId: string,
  property: MeshLabelPaintProperty,
  value: unknown
): void => {
  if (MESH_LABEL_LAYOUT_PROPERTIES.has(property)) {
    map.setLayoutProperty(layerId, property, value);
  } else {
    map.setPaintProperty(layerId, property, value);
  }
};

/** Scale an authored `text-size`; legacy stop functions are left alone. */
const scaleTextSize = (authored: unknown, factor: number): unknown => {
  if (typeof authored === "number")
    return Math.round(authored * factor * 10) / 10;
  if (Array.isArray(authored)) return ["*", factor, authored];
  return undefined;
};

type SharedSceneHotData = {
  sharedThreeSceneEntries?: WeakMap<MaplibreMap, SharedSceneEntry>;
};

export type SharedThreeSceneLease = {
  layer: SharedThreeSceneLayer;
  setLocationLabelColor: (color: string | null) => void;
  setPointLabelOverlayVisible: (visible: boolean) => void;
  /**
   * Restyle the draped and overlaid labels for a textured mesh: street names
   * and house numbers take the sun color with a grey halo, water names keep
   * their blue and drop their halo. Off for bare terrain.
   */
  setMeshLabelStyle: (enabled: boolean) => void;
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

const getCachedStyleLayers = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layerOrder: readonly string[]
): RuntimeStyleLayer[] => {
  // `getStyle()` serializes every layer including the coverage filters, so
  // the list is reused until the layer list itself changes.
  const orderSignature = layerOrder.join("\n");
  const cached = entry.styleLayersCache;
  if (cached?.orderSignature === orderSignature) return cached.layers;
  try {
    const layers = [
      ...((map.getStyle().layers as RuntimeStyleLayer[] | undefined) ?? []),
    ];
    entry.styleLayersCache = { orderSignature, layers };
    return layers;
  } catch {
    return [];
  }
};

const getMapStylePointLabelLayers = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layerOrder: readonly string[]
): RuntimeStyleLayer[] =>
  getCachedStyleLayers(map, entry, layerOrder).filter(
    isMapStylePointLabelLayer
  );

/** Line-placed symbols stay below Three; the mesh drape restyles them in place. */
const getMapStyleLineLabelLayers = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layerOrder: readonly string[]
): RuntimeStyleLayer[] =>
  getCachedStyleLayers(map, entry, layerOrder).filter(
    (layer) => layer.type === "symbol" && !isMapStylePointLabelLayer(layer)
  );

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

/** White and near-white halos (basemap.de uses rgb(255,253,238)) count as white. */
const isWhiteLabelHalo = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "white") return true;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(compact);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1].split("").map((digit) => digit + digit)
        : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];
    return digits.every((digit) => Number.parseInt(digit, 16) >= 235);
  }
  const rgb = /^rgba?\((\d+),(\d+),(\d+)(?:,[\d.]+)?\)$/.exec(compact);
  return (
    rgb !== null && rgb.slice(1, 4).every((channel) => Number(channel) >= 235)
  );
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
  textColor: string | null,
  /** Layers whose paint another rule owns; offsets still apply. */
  skipPaint: (layer: RuntimeStyleLayer) => boolean = () => false
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

  // Place names are lifted in meters (see configureLabelLifts) instead of a
  // flat em offset; earlier offsets are handed back through savedOffsets.
  restoreLocationLabelOffsets(map, savedOffsets);
  for (const layer of layers) {
    const signature = getLayerSignature(layer);
    // Road shields keep their authored text and fill in every mode.
    if (isMapStyleRoadShieldLayer(layer)) continue;
    if (textColor === null || skipPaint(layer)) continue;
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

/**
 * A textured mesh that supplies the terrain composites the captured style
 * over its own texture; that is the case the mesh label rules exist for.
 */
const hasMeshDrapeProvider = (entry: SharedSceneEntry): boolean => {
  const runtimes = entry.layer.getRuntimes?.() ?? [];
  const providers = runtimes.filter(
    (runtime) => runtime.providesTerrain === true
  );
  return (
    providers.length > 0 &&
    providers.every((runtime) => runtime.mapStyleProjectionBlend === "overlay")
  );
};

/** An explicit request (the shadow scene) wins; otherwise the mesh decides. */
const isMeshLabelStyle = (entry: SharedSceneEntry): boolean => {
  let enabled: boolean | null = null;
  for (const requested of entry.meshLabelStyleRequests.values()) {
    enabled = requested;
  }
  return enabled ?? hasMeshDrapeProvider(entry);
};

const restoreMeshDrape = (map: MaplibreMap, entry: SharedSceneEntry): void => {
  for (const [layerId, saved] of entry.savedMeshDrapeVisibilities) {
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
  entry.savedMeshDrapeVisibilities.clear();
  for (const [layerId, saved] of entry.savedContourOpacities) {
    try {
      const runtimeLayer = map.getLayer(layerId) as
        | RuntimeStyleLayer
        | undefined;
      if (
        runtimeLayer &&
        getLayerSignature(runtimeLayer) === saved.signature &&
        map.getPaintProperty(layerId, "line-opacity") ===
          MESH_DRAPE_CONTOUR_OPACITY
      ) {
        map.setPaintProperty(
          layerId,
          "line-opacity",
          saved.original === undefined ? null : saved.original
        );
      }
    } catch {
      // The host may already have disposed or replaced its style.
    }
  }
  entry.savedContourOpacities.clear();
};

/**
 * Keep only the symbol layers and the contour lines in the pass captured
 * below Three. Fills, strokes, rasters and the background would otherwise
 * paint over the mesh texture; contour lines stay at half strength so they
 * lighten the surface instead of covering it. Runs whenever a textured mesh
 * supplies the terrain, with or without the shadow simulation.
 */
const applyMeshDrape = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layers: readonly RuntimeStyleLayer[]
): void => {
  const currentIds = new Set(layers.map(({ id }) => id));
  for (const id of entry.savedMeshDrapeVisibilities.keys()) {
    if (!currentIds.has(id)) entry.savedMeshDrapeVisibilities.delete(id);
  }
  for (const id of entry.savedContourOpacities.keys()) {
    if (!currentIds.has(id)) entry.savedContourOpacities.delete(id);
  }
  for (const layer of layers) {
    if (layer.type === "custom" || layer.type === "symbol") continue;
    if (layer.id.startsWith("carma-")) continue;
    try {
      const signature = getLayerSignature(layer);
      if (isMapStyleContourLineLayer(layer)) {
        const current = map.getPaintProperty(layer.id, "line-opacity");
        const saved = entry.savedContourOpacities.get(layer.id);
        if (!saved || saved.signature !== signature) {
          entry.savedContourOpacities.set(layer.id, {
            signature,
            original: current,
          });
        }
        if (current !== MESH_DRAPE_CONTOUR_OPACITY) {
          map.setPaintProperty(
            layer.id,
            "line-opacity",
            MESH_DRAPE_CONTOUR_OPACITY
          );
        }
        continue;
      }
      const current = map.getLayoutProperty(layer.id, "visibility");
      const saved = entry.savedMeshDrapeVisibilities.get(layer.id);
      if (!saved || saved.signature !== signature) {
        entry.savedMeshDrapeVisibilities.set(layer.id, {
          signature,
          original: current,
        });
      }
      if (current !== "none") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
};

/**
 * Whether the mesh drape owns this layer's text, halo and icon paint: every
 * point label (places, POIs, areas, house numbers, shields), the street names
 * draped below Three, and water names.
 */
const isMeshStyledLabelLayer = (layer: RuntimeStyleLayer): boolean =>
  isMapStyleWaterLabelLayer(layer) ||
  isMapStyleElevationLabelLayer(layer) ||
  (isMapStylePointLabelLayer(layer)
    ? // Shields keep their authored text on their own icon backdrop.
      !isMapStyleRoadShieldLayer(layer)
    : isMapStyleRoadLabelLayer(layer));

const getMeshLabelPaint = (
  map: MaplibreMap,
  layer: RuntimeStyleLayer,
  textColor: string | null,
  authoredProperty: (
    layer: RuntimeStyleLayer,
    property: MeshLabelPaintProperty
  ) => unknown
): Array<[MeshLabelPaintProperty, unknown]> => {
  // Water names keep their authored blue and only drop the halo.
  if (isMapStyleWaterLabelLayer(layer)) return [["text-halo-width", 0]];
  // Contour and spot-height numbers: sun colored, no halo, draped or lifted.
  // Without a sun (shadow simulation off) they stay white.
  if (isMapStyleElevationLabelLayer(layer)) {
    return [
      ["text-color", textColor ?? "#ffffff"],
      ["text-halo-width", 0],
    ];
  }
  // Draped street names are lit and shadowed in place on the mesh, so they
  // stay pure white; only the overlaid point labels take the sun color.
  // They also get more body and a crisp, narrower halo so the halo does
  // not creep into the glyphs on the textured ground.
  if (!isMapStylePointLabelLayer(layer)) {
    const paint: Array<[MeshLabelPaintProperty, unknown]> = [
      ["text-color", "#ffffff"],
      ["text-halo-color", MESH_LABEL_HALO_COLOR],
      ["text-halo-width", MESH_STREET_LABEL_HALO_WIDTH],
      ["text-halo-blur", 0],
    ];
    const size = scaleTextSize(
      authoredProperty(layer, "text-size"),
      MESH_STREET_LABEL_SIZE_FACTOR
    );
    if (size !== undefined) paint.push(["text-size", size]);
    return paint;
  }
  if (textColor === null) return [];
  const paint: Array<[MeshLabelPaintProperty, unknown]> = [
    ["text-color", textColor],
    ["text-halo-color", MESH_LABEL_HALO_COLOR],
  ];
  // Flat white SDF icons (churches, POIs) take the sun color as well.
  if (isWhiteLabelHalo(authoredProperty(layer, "icon-color"))) {
    paint.push(["icon-color", textColor]);
  }
  return paint;
};

/** Expression values come back as fresh arrays; compare by content. */
const isSameMeshLabelValue = (left: unknown, right: unknown): boolean =>
  left === right ||
  (Array.isArray(left) &&
    Array.isArray(right) &&
    JSON.stringify(left) === JSON.stringify(right));

const restoreMeshLabelPaint = (
  map: MaplibreMap,
  saved: Map<string, SavedMeshLabelPaint>
): void => {
  for (const entry of saved.values()) {
    try {
      const runtimeLayer = map.getLayer(entry.layerId) as
        | RuntimeStyleLayer
        | undefined;
      if (
        runtimeLayer &&
        getLayerSignature(runtimeLayer) === entry.signature &&
        isSameMeshLabelValue(
          getMeshLabelProperty(map, entry.layerId, entry.property),
          entry.applied
        )
      ) {
        setMeshLabelProperty(
          map,
          entry.layerId,
          entry.property,
          entry.original === undefined ? null : entry.original
        );
      }
    } catch {
      // The host may already have disposed or replaced its style.
    }
  }
  saved.clear();
};

const applyMeshLabelPaint = (
  map: MaplibreMap,
  layers: readonly RuntimeStyleLayer[],
  saved: Map<string, SavedMeshLabelPaint>,
  textColor: string | null
): void => {
  const wanted = new Map<
    string,
    [RuntimeStyleLayer, MeshLabelPaintProperty, unknown]
  >();
  const authoredProperty = (
    layer: RuntimeStyleLayer,
    property: MeshLabelPaintProperty
  ): unknown => {
    const entry = saved.get(`${layer.id}|${property}`);
    if (entry && entry.signature === getLayerSignature(layer)) {
      return entry.original;
    }
    try {
      return getMeshLabelProperty(map, layer.id, property);
    } catch {
      return undefined;
    }
  };
  for (const layer of layers) {
    for (const [property, value] of getMeshLabelPaint(
      map,
      layer,
      textColor,
      authoredProperty
    )) {
      wanted.set(`${layer.id}|${property}`, [layer, property, value]);
    }
  }
  // Hand back paint that is no longer wanted (layer gone, sun color gone).
  const stale = new Map<string, SavedMeshLabelPaint>();
  for (const [key, entry] of saved) {
    if (!wanted.has(key)) {
      stale.set(key, entry);
      saved.delete(key);
    }
  }
  restoreMeshLabelPaint(map, stale);
  for (const [key, [layer, property, value]] of wanted) {
    try {
      const signature = getLayerSignature(layer);
      const current = getMeshLabelProperty(map, layer.id, property);
      let entry = saved.get(key);
      if (
        !entry ||
        entry.signature !== signature ||
        !isSameMeshLabelValue(current, entry.applied)
      ) {
        entry = {
          layerId: layer.id,
          property,
          signature,
          original: current,
          applied: value,
        };
        saved.set(key, entry);
      } else {
        entry.applied = value;
      }
      if (!isSameMeshLabelValue(current, value)) {
        setMeshLabelProperty(map, layer.id, property, value);
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
};

const restoreLabelLifts = (
  map: MaplibreMap,
  saved: Map<string, SavedLabelLift>
): void => {
  for (const [layerId, entry] of saved) {
    try {
      const runtimeLayer = map.getLayer(layerId) as
        | RuntimeStyleLayer
        | undefined;
      if (
        !runtimeLayer ||
        getLayerSignature(runtimeLayer) !== entry.signature
      ) {
        continue;
      }
      map.setPaintProperty(
        layerId,
        "text-translate",
        entry.originalTranslate === undefined ? null : entry.originalTranslate
      );
      map.setPaintProperty(
        layerId,
        "text-translate-anchor",
        entry.originalAnchor === undefined ? null : entry.originalAnchor
      );
    } catch {
      // The host may already have disposed or replaced its style.
    }
  }
  saved.clear();
};

/**
 * Register the place-name layers that float above the scene and pin their
 * translate to the viewport, so the per-frame lift is a plain pixel offset.
 */
const configureLabelLifts = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  layers: readonly RuntimeStyleLayer[]
): void => {
  const next: LabelLiftLayer[] = [];
  for (const layer of layers) {
    const meters = getMapStylePointLabelLiftMeters(layer);
    if (meters === null) continue;
    next.push({ id: layer.id, signature: getLayerSignature(layer), meters });
  }
  const nextIds = new Set(next.map(({ id }) => id));
  const stale = new Map<string, SavedLabelLift>();
  for (const [layerId, saved] of entry.savedLabelLifts) {
    if (!nextIds.has(layerId)) {
      stale.set(layerId, saved);
      entry.savedLabelLifts.delete(layerId);
    }
  }
  restoreLabelLifts(map, stale);
  for (const lift of next) {
    try {
      let saved = entry.savedLabelLifts.get(lift.id);
      if (!saved || saved.signature !== lift.signature) {
        saved = {
          signature: lift.signature,
          originalTranslate: map.getPaintProperty(lift.id, "text-translate"),
          originalAnchor: map.getPaintProperty(
            lift.id,
            "text-translate-anchor"
          ),
          appliedPixels: Number.NaN,
        };
        entry.savedLabelLifts.set(lift.id, saved);
      }
      if (
        map.getPaintProperty(lift.id, "text-translate-anchor") !== "viewport"
      ) {
        map.setPaintProperty(lift.id, "text-translate-anchor", "viewport");
      }
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
  entry.liftLayers = next;
};

/**
 * Screen pixels a point `meters` above the ground moves up at the map center
 * for the current zoom and pitch. Every label of a layer gets the same lift,
 * which reads as a uniform floating height across the view.
 */
const getLabelLiftPixels = (
  map: MaplibreMap,
  meters: number
): number | null => {
  const zoom = map.getZoom?.();
  const pitch = map.getPitch?.();
  const center = map.getCenter?.();
  const canvas = map.getCanvas?.();
  if (
    typeof zoom !== "number" ||
    typeof pitch !== "number" ||
    !center ||
    !Number.isFinite(center.lat)
  ) {
    return null;
  }
  const pixelsPerMeter =
    (MAPLIBRE_TILE_SIZE * 2 ** zoom) /
    (EARTH_CIRCUMFERENCE_METERS * Math.cos((center.lat * Math.PI) / 180));
  const lifted = meters * pixelsPerMeter * Math.cos((pitch * Math.PI) / 180);
  const viewportHeight = canvas?.clientHeight ?? 0;
  const cap =
    viewportHeight > 0
      ? viewportHeight * MAX_LABEL_LIFT_VIEWPORT_FRACTION
      : Number.POSITIVE_INFINITY;
  return Math.min(lifted, cap);
};

const updateLabelLiftPaint = (map: MaplibreMap, entry: SharedSceneEntry) => {
  for (const lift of entry.liftLayers) {
    const saved = entry.savedLabelLifts.get(lift.id);
    if (!saved) continue;
    const pixels = getLabelLiftPixels(map, lift.meters);
    if (pixels === null) return;
    if (Math.abs(pixels - saved.appliedPixels) < 0.5) continue;
    try {
      map.setPaintProperty(lift.id, "text-translate", [0, -pixels]);
      saved.appliedPixels = pixels;
    } catch {
      // A style rebuild can remove a layer between inspection and update.
    }
  }
};

const isSpriteImageData = (value: unknown): value is SpriteImageData => {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<SpriteImageData>;
  return (
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    (image.data instanceof Uint8Array ||
      image.data instanceof Uint8ClampedArray)
  );
};

const getSpriteImageData = (
  map: MaplibreMap,
  id: string
): SpriteImageData | null => {
  const host = map as unknown as {
    style?: { imageManager?: { getImage?: (id: string) => unknown } };
  };
  try {
    const image = host.style?.imageManager?.getImage?.(id) as
      | { data?: unknown; sdf?: boolean }
      | undefined;
    if (!image || image.sdf || !isSpriteImageData(image.data)) return null;
    return image.data;
  } catch {
    return null;
  }
};

/** Every visible sprite is lit by the sun; fully transparent ones are skipped. */
const isSunTintableSprite = ({ data }: SpriteImageData): boolean => {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return true;
  }
  return false;
};

const parseHexColor = (color: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const tintSpriteImage = (
  image: SpriteImageData,
  rgb: [number, number, number]
): SpriteImageData => {
  // The sprite is lit by the sun: its authored color is the albedo, the sun
  // color the light, and the result is their product per channel. White
  // becomes the sun color, a yellow shield a sun-lit yellow, black stays
  // black.
  const data = new Uint8Array(image.data);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    data[index] = Math.round((data[index] * rgb[0]) / 255);
    data[index + 1] = Math.round((data[index + 1] * rgb[1]) / 255);
    data[index + 2] = Math.round((data[index + 2] * rgb[2]) / 255);
  }
  return { width: image.width, height: image.height, data };
};

const restoreMeshIconTint = (map: MaplibreMap, entry: SharedSceneEntry) => {
  for (const [id, tinted] of entry.tintedImages) {
    try {
      if (map.hasImage?.(id)) map.updateImage(id, tinted.original as never);
    } catch {
      // The sprite may already have been replaced with the style.
    }
  }
  entry.tintedImages.clear();
};

const applyMeshIconTint = (
  map: MaplibreMap,
  entry: SharedSceneEntry,
  color: string | null
) => {
  const rgb = color === null ? null : parseHexColor(color);
  if (!rgb || typeof map.listImages !== "function") {
    restoreMeshIconTint(map, entry);
    return;
  }
  let ids: string[];
  try {
    ids = map.listImages();
  } catch {
    return;
  }
  const present = new Set(ids);
  for (const id of entry.tintedImages.keys()) {
    if (!present.has(id)) entry.tintedImages.delete(id);
  }
  for (const id of ids) {
    const tinted = entry.tintedImages.get(id);
    if (tinted?.color === color) continue;
    const original = tinted?.original ?? getSpriteImageData(map, id);
    if (!original) continue;
    if (!tinted) {
      if (!isSunTintableSprite(original)) continue;
      // Keep a private copy: the manager hands out its live buffer.
      entry.tintedImages.set(id, {
        original: {
          width: original.width,
          height: original.height,
          data: new Uint8Array(original.data),
        },
        color,
      });
    } else {
      tinted.color = color;
    }
    try {
      map.updateImage(
        id,
        tintSpriteImage(entry.tintedImages.get(id)!.original, rgb) as never
      );
    } catch {
      entry.tintedImages.delete(id);
    }
  }
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
  const meshLabelStyle = isMeshLabelStyle(entry);
  if (meshLabelStyle) {
    applyMeshDrape(map, entry, getCachedStyleLayers(map, entry, layerOrder));
  } else {
    restoreMeshDrape(map, entry);
  }
  if (!pointLabelOverlayVisible) {
    restoreMeshIconTint(map, entry);
    restoreMeshLabelPaint(map, entry.savedMeshLabelPaint);
    restoreLabelLifts(map, entry.savedLabelLifts);
    entry.liftLayers = [];
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
  // Hand the mesh paint back before the default rules read the layers, so
  // they see the authored values and not the mesh colors as "originals".
  if (!meshLabelStyle) restoreMeshLabelPaint(map, entry.savedMeshLabelPaint);
  applyLocationLabelOffsets(
    map,
    locationLabelLayers,
    savedOffsets,
    savedHaloWidths,
    savedHaloColors,
    savedTextColors,
    textColor,
    meshLabelStyle ? isMeshStyledLabelLayer : undefined
  );
  if (meshLabelStyle) {
    applyMeshLabelPaint(
      map,
      [
        ...locationLabelLayers,
        ...getMapStyleLineLabelLayers(map, entry, layerOrder),
      ].filter(isMeshStyledLabelLayer),
      entry.savedMeshLabelPaint,
      textColor
    );
    applyMeshIconTint(map, entry, textColor);
  } else {
    restoreMeshIconTint(map, entry);
  }
  configureLabelLifts(map, entry, locationLabelLayers);
  updateLabelLiftPaint(map, entry);
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
  entry.updateLabelLift = () => {
    if (entry.disposed || entry.liftLayers.length === 0) return;
    updateLabelLiftPaint(map, entry);
  };
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
      entry.styleLayersCache = null;
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
  map.on("move", entry.updateLabelLift);
};

const removeEnsureLayerListeners = (
  map: MaplibreMap,
  entry: SharedSceneEntry
): void => {
  map.off("styledata", entry.ensureLayer);
  map.off("style.load", entry.ensureLayer);
  map.off("idle", entry.ensureLayer);
  map.off("move", entry.updateLabelLift);
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
    entry.styleLayersCache = null;
    entry.savedMeshDrapeVisibilities ??= new Map();
    entry.savedContourOpacities ??= new Map();
    restoreMeshDrape(map, entry);
    entry.liftLayers ??= [];
    entry.savedLabelLifts ??= new Map();
    entry.tintedImages ??= new Map();
    restoreMeshIconTint(map, entry);
    restoreMeshLabelPaint(map, entry.savedMeshLabelPaint ?? new Map());
    restoreLabelLifts(map, entry.savedLabelLifts);
    entry.liftLayers = [];
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
    entry.meshLabelStyleRequests ??= new Map();
    entry.savedMeshLabelPaint ??= new Map();
    entry.updateLabelLift ??= () => undefined;
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
      styleLayersCache: null,
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
      meshLabelStyleRequests: new Map(),
      savedMeshLabelPaint: new Map(),
      savedMeshDrapeVisibilities: new Map(),
      savedContourOpacities: new Map(),
      liftLayers: [],
      savedLabelLifts: new Map(),
      tintedImages: new Map(),
      updateLabelLift: () => undefined,
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
  const meshLabelStyleRequestId = Symbol("mesh-label-style");
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
    setMeshLabelStyle(enabled) {
      const current = entries.get(map);
      if (!current || current !== entry || released) return;
      if (
        current.meshLabelStyleRequests.get(meshLabelStyleRequestId) === enabled
      ) {
        return;
      }
      current.meshLabelStyleRequests.set(meshLabelStyleRequestId, enabled);
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
      current.meshLabelStyleRequests.delete(meshLabelStyleRequestId);
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
      restoreMeshIconTint(map, current);
      restoreMeshDrape(map, current);
      restoreMeshLabelPaint(map, current.savedMeshLabelPaint);
      restoreLabelLifts(map, current.savedLabelLifts);
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
