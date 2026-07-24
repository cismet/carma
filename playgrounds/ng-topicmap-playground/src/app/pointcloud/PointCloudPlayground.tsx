import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  faChevronDown,
  faChevronUp,
  faCircleInfo,
  faEye,
  faEyeSlash,
  faMap,
  faRotateLeft,
  faSliders,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Icon from "react-cismap/commons/Icon";
import { Button, Checkbox, InputNumber, Radio, Select, Slider, Switch, Tabs } from "antd";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";

import { CarmaMap } from "@carma-mapping/core";
import { useHashState } from "@carma-providers/hash-state";
import {
  slugifyUrl,
  useLibreContext,
  WUPPERTAL_CONFIG,
} from "@carma-mapping/engines/maplibre";

import {
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
} from "@carma-commons/resources";
import type { Latitude, Longitude } from "@carma-geo/data-structures";
import { getFromUTM32ToWGS84, getGcg2016Undulation } from "@carma-geo/proj";

import {
  buildCategoryLut,
  getRampTexture,
  isQualitativeRamp,
} from "./colorRamps";
import {
  buildFrustumProjector,
  buildOrientedImageryLayer,
  loadObliquePoses,
  loadPanoPoses,
  utmToScene,
} from "./orientedImagery";
import type { OrientedImageryLayer } from "./orientedImagery";
import {
  buildTiles3dLayer,
  TILES_ERROR_TARGET_DEFAULT_PIXELS,
  TILES_ERROR_TARGET_MAX_PIXELS,
  TILES_ERROR_TARGET_MIN_PIXELS,
} from "./tiles3dLayer";
import type { ImageProjector, Tiles3dLayer } from "./tiles3dLayer";
import * as THREE from "three";
import { buildCloudFieldInfos, openCopcPointSource } from "./copcLoader";
import type {
  CloudFieldInfo,
  CopcPointChunk,
  CopcPointSource,
  CopcRigidRegistration,
  CopcSceneMetadata,
} from "./copcLoader";
import {
  buildCopcPointsLayer,
  POINT_SHAPES,
  POINT_SIZE_MODES,
} from "./copcPointsLayer";
import type {
  CopcPointsLayer,
  LayerColorSlot,
  PointShape,
  PointSizeMode,
} from "./copcPointsLayer";
import { compileFieldExpression } from "./deriveField";
import {
  adaptPointBudget,
  allocatePointBudget,
  derivePointMemoryBudget,
  deriveSceneMemoryAllocation,
  deriveSceneRequestAllocation,
  estimatePointChunkMemoryBytes,
} from "./dynamicPointBudget";
import type { PointMemoryBudget } from "./dynamicPointBudget";
import { deriveDecodedPointCacheBudget } from "./pointCloudFrustum";
import {
  resolveTerrainBaseHeight,
  type ElevationDatum,
} from "./elevationFrame";
import type { CarmaConf3DPointCloud } from "@carma-appframeworks/portals";
import { POINT_CLOUD_PRESET_FEATURE_COLLECTION } from "./pointcloud-preset-features";
import { createPointTilesetSceneRuntime } from "./pointTilesetSceneRuntime";
import {
  AWG2_DGM1_RIGID_REGISTRATION,
  AWG2_GCG2016_UNDULATION_METERS,
  AWG2_MESH_2024_MICRO_CORRECTION,
  resolveCopcSourcePosition,
} from "./pointcloud-spatial-registration";
import {
  formatPointCloudAcquisitionDate,
  POINT_CLOUD_DATASETS,
  POINT_CLOUD_PUBLIC_BASE_URL,
} from "./point-cloud-assets";
import type { PointCloudAssetIdentity } from "./point-cloud-assets";
import {
  buildPointCloudMicroCorrectionsDocument,
  parsePointCloudMicroCorrections,
} from "./pointCloudMicroCorrections";
import type { PointCloudMicroCorrection } from "./pointCloudMicroCorrections";
import { buildPointcloudSceneLayer } from "./pointcloudSceneLayer";
import {
  mergePersistedSettings,
  readPointcloudViewState,
  writePointcloudViewState,
} from "./pointcloudViewState";
import type { PersistedMapCamera } from "./pointcloudViewState";
import {
  buildTerrainRelativeHeightField,
  TERRAIN_DEM_ENCODINGS,
  TERRAIN_RELATIVE_HEIGHT_FIELD,
} from "./terrainRelativeField";
import type { TerrainDemFieldSource } from "./terrainRelativeField";
import { getCloudFlyToButtonState } from "./pointcloudFlyTo";
import {
  ADHOC_POINTCLOUD_ID_PREFIX,
  isAdhocPointCloudFeature,
  parseAdhocPointCloudJson,
  pointCloudFeatureToConfig,
} from "./adhocPointCloud";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
export type { ElevationDatum } from "./elevationFrame";
import {
  DEFAULT_COLORIZATION,
  DEFAULT_SLOT,
  FloatingPanel,
  formatColorizerFieldLabel,
  formatColorizerSourceLabel,
  PointColorizer,
} from "./PointColorizer";
import type { ColorizationConfig, ColorSlotConfig } from "./PointColorizer";

// ─────────────────────────────────────────────────────────────
//  Point cloud playground (wupp#4064): a small scene graph of
//  assets (COPC point clouds + Cesium 3D Tiles meshes) over the
//  MapLibre map. Every asset carries its own display settings
//  (elevation datum, z offset, colors, …) edited in a tree-like
//  panel. Production streams content-versioned COPCs from the public data
//  origin; local .data/ mirrors are preprocessing inputs and never enter dist.
//
//  This MapLibre route uses the active terrain provider's DHHN2016 numeric
//  heights. Ellipsoidal assets are transformed with GCG2016 before display.
// ─────────────────────────────────────────────────────────────

const APP_KEY = "ng-topicmap-playground-pointcloud";
const MICRO_CORRECTIONS_STORAGE_KEY = `${APP_KEY}:microcorrections:v1`;
const VIEW_STATE_STORAGE_KEY = `${APP_KEY}:view-state:v2`;
const ADHOC_POINTCLOUD_STORAGE_KEY = `${APP_KEY}:adhoc-pointclouds:v1`;
const POINTCLOUD_DATA_BASE_URL = (
  import.meta.env.VITE_POINTCLOUD_DATA_BASE_URL ?? POINT_CLOUD_PUBLIC_BASE_URL
).replace(/\/$/, "");

// Terrain should be on by default in this demo: seed the CarmaMap
// persistence key (respected on map load) unless the user already
// made a choice.
const TERRAIN_STORAGE_KEY = `${APP_KEY}:carma-map-terrain`;
try {
  if (localStorage.getItem(TERRAIN_STORAGE_KEY) === null) {
    localStorage.setItem(TERRAIN_STORAGE_KEY, "true");
  }
} catch {
  // localStorage unavailable (e.g. privacy mode) — non-fatal
}

const DGM01_SOURCE_ID = WUPPERTAL_CONFIG.terrain
  ? slugifyUrl(WUPPERTAL_CONFIG.terrain.url)
  : "terrainSource";

interface DemEntry {
  id: string;
  label: string;
  sourceId: string;
  terrainFieldSource?: TerrainDemFieldSource;
  /** Source spec for DEMs not already part of the default style */
  spec?: Record<string, unknown>;
}

// The playground currently uses MapLibre terrain sources for the
// interactive height frame, so only the local Wuppertal DEM entry is shown.
// A DSM terrain provider exists in shared resources, but it is not wired into
// this MapLibre-based dropdown yet.
const DEMS: DemEntry[] = [
  {
    id: "dgm01",
    label: "Wuppertal DGM1 (1 m · DHHN2016)",
    sourceId: DGM01_SOURCE_ID,
    terrainFieldSource: WUPPERTAL_CONFIG.terrain
      ? {
          tileUrlTemplate: WUPPERTAL_CONFIG.terrain.url,
          tileSize: WUPPERTAL_CONFIG.terrain.tileSize ?? 512,
          zoom: WUPPERTAL_CONFIG.terrain.maxzoom ?? 15,
          encoding: TERRAIN_DEM_ENCODINGS.MAPBOX,
        }
      : undefined,
  },
];

const demIdForSource = (sourceId: string | undefined): string =>
  DEMS.find((dem) => dem.sourceId === sourceId)?.id ?? DEMS[0].id;

/** Constant mix opacity for an AO scalar baked into the source point cloud. */
const BAKED_AO_MIX_OPACITY = 0.85;
// ALKIS buildings (extrusion heights via carma3d style metadata,
// rendered by the engine's ThreeLayerManager; with terrain enabled
// it queries absolute ground elevations per building).
/** Enables LibreMap's ThreeLayerManager for detected carma3d configs */
const BUILDINGS_RUNTIME_PARAMS: Record<string, number | string> = {};
const BUILDINGS_LIBRE_LAYERS = [
  {
    type: "vector" as const,
    name: "Gebaeude",
    style: "https://tiles.cismet.de/alkis/gebaeude-only.style.json",
  },
];

/** Show/hide all style layers of the ALKIS building sub-style.
 *  Only writes actual changes: setLayoutProperty fires styledata,
 *  and unconditional writes from a styledata handler loop forever
 *  (map never reaches idle, stalling every whenStyleReady). */
const setBuildingLayersVisible = (map: MaplibreMap, visible: boolean) => {
  const wanted = visible ? "visible" : "none";
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const source = (layer as { source?: string }).source ?? "";
    if (source === "alkis_data" || source.endsWith("::alkis_data")) {
      const current =
        (map.getLayoutProperty(layer.id, "visibility") as string) ?? "visible";
      if (current !== wanted) {
        map.setLayoutProperty(layer.id, "visibility", wanted);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────
//  Asset definitions + per-asset settings
// ─────────────────────────────────────────────────────────────

const DATUM_OPTIONS = [
  { value: "dhhn", label: "DHHN2016" },
  { value: "ellipsoidal", label: "ellipsoidisch (GCG2016)" },
  { value: "surfaceRelative", label: "oberflächenrelativ" },
] as const;

interface CloudAssetDef extends PointCloudAssetIdentity {
  url: string;
  defaultDatum: ElevationDatum;
  /** "3d-tiles" renders the cloud from a tileset instead of a COPC file. */
  delivery?: "copc" | "3d-tiles";
  /** Source-CRS extent, used to anchor a tileset without opening a COPC. */
  sourceBounds?: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };
  /** Empirical rigid registration after the declared/inferred datum transform. */
  registration?: CopcRigidRegistration;
  /** Exact resource-anchor GCG2016 value; otherwise query the cloud center. */
  geoidUndulationMeters?: number;
}

const CLOUD_ASSETS: CloudAssetDef[] = POINT_CLOUD_DATASETS.map((dataset) => ({
  ...dataset,
  url: `${POINTCLOUD_DATA_BASE_URL}/${dataset.artifactFileName}`,
  ...(dataset.id === "awg"
    ? {
        registration: AWG2_DGM1_RIGID_REGISTRATION,
        geoidUndulationMeters: AWG2_GCG2016_UNDULATION_METERS,
      }
    : {}),
}));
// Alternate deliveries of the same clouds (currently the Oelberg MLS tileset)
// come from the shared ad-hoc FeatureCollection, so the app list and the
// importable config stay in sync.
for (const feature of POINT_CLOUD_PRESET_FEATURE_COLLECTION.features) {
  const properties = feature.properties as {
    title?: string;
    carmaConf3D?: { pointcloud?: CarmaConf3DPointCloud };
  } | null;
  const pointcloud = properties?.carmaConf3D?.pointcloud;
  if (!pointcloud || pointcloud.delivery !== "3d-tiles" || !pointcloud.bounds) {
    continue;
  }
  const base = CLOUD_ASSETS.find(
    (asset) => asset.artifactFileName && pointcloud.fields === asset.fieldDimensions
  );
  CLOUD_ASSETS.push({
    ...(base ?? CLOUD_ASSETS[0]),
    id: String(feature.id),
    label: properties?.title ?? String(feature.id),
    url: pointcloud.url,
    delivery: "3d-tiles",
    sourceBounds: {
      min: pointcloud.bounds.min,
      max: pointcloud.bounds.max,
    },
    registration: undefined,
  });
}
// AWG2 is the only pointcloud shown when the playground has no persisted view.
const DEFAULT_PRELOADED_CLOUD_IDS = new Set(["awg"]);

const CLOUD_CLASSIFICATION_LABELS: Readonly<
  Partial<Record<string, Readonly<Record<number, string>>>>
> = {
  // Observed in this non-ASPRS AWG segmentation; other values stay unlabeled.
  awg: { 9: "Vegetation" },
};

const CLOUD_ASSET_IDS = new Set(CLOUD_ASSETS.map((asset) => asset.id));
const CLOUD_ASSET_EXPORT_METADATA = Object.fromEntries(
  CLOUD_ASSETS.map((asset) => [
    asset.id,
    {
      label: asset.label,
      artifact: asset.url,
      sourceTag: asset.sourceTag,
      acquiredOn: asset.acquiredOn?.value ?? null,
    },
  ])
);

interface MeshAssetDef {
  id: string;
  label: string;
  url: string;
  /** Covers the terrain surface and replaces the draped 2D base map. */
  replacesBasemap?: boolean;
  /** Initial material presentation for this tileset. */
  defaultClay?: boolean;
  /** Proven source heights after ECEF reorientation. */
  sourceElevationDatum?: "ellipsoidal" | "terrain" | "unverified";
}

// Cesium 3D Tiles rendered via 3d-tiles-renderer. Mesh 2024 stores ECEF
// positions produced from EPSG:25832 + DHHN2016 through GCG2016, so its
// reoriented local heights are ellipsoidal already. Mesh 2020's vertical
// provenance is not equivalently verified. Its tiles are glTF 1.0 b3dm and
// therefore upgraded on the fly for three's GLTFLoader.
const MESH_ASSETS: MeshAssetDef[] = [
  {
    id: "mesh2020",
    label: "Mesh 2020",
    url: WUPP_MESH_2020.url,
    replacesBasemap: true,
    sourceElevationDatum: "unverified",
  },
  {
    id: "mesh2024",
    label: "Mesh 2024",
    url: WUPP_MESH_2024.url,
    replacesBasemap: true,
    sourceElevationDatum: "ellipsoidal",
  },
  {
    id: "lod2",
    label: "LOD2",
    url: WUPP_LOD2_TILESET.url,
    defaultClay: true,
    sourceElevationDatum: "unverified",
  },
];

export type CloudPositionOffset = PointCloudMicroCorrection;

interface CloudSettings extends CloudPositionOffset {
  enabled: boolean;
  visualDefaultsVersion: number;
  datum: ElevationDatum;
  rotationEastDegrees: number;
  rotationNorthDegrees: number;
  rotationUpDegrees: number;
  sizeMode: PointSizeMode;
  pointSizePx: number;
  radiusMeters: number;
  /** Spacing multiplier for the auto size mode */
  radiusScale: number;
  shape: PointShape;
  nodeBoundsVisible: boolean;
  colorization: ColorizationConfig;
}

interface MeshSettings {
  enabled: boolean;
  zOffset: number;
  white: boolean;
    clayColor: string;
  errorTarget: number;
  opacity: number;
  wireframe: boolean;
  tileBoundsVisible: boolean;
}

const rgbAoColorizationPreset = (): ColorizationConfig => {
  const aoLayer: ColorSlotConfig = {
    ...DEFAULT_SLOT,
    source: { kind: "field", field: "ao" },
    ramp: "grayscale",
    blendMode: "multiply",
    opacity: BAKED_AO_MIX_OPACITY,
  };
  return {
    layers: [
      { ...DEFAULT_SLOT, source: { kind: "rgb" } },
      aoLayer,
      { ...DEFAULT_SLOT },
    ],
  };
};

const classificationAoColorizationPreset = (): ColorizationConfig => {
  const rgbAo = rgbAoColorizationPreset();
  return {
    layers: [
      {
        ...DEFAULT_SLOT,
        source: { kind: "classification" },
        ramp: "classification",
      },
      rgbAo.layers[1],
      rgbAo.layers[2],
    ],
  };
};

const defaultCloudSettings = (
  def: CloudAssetDef,
  enabled = DEFAULT_PRELOADED_CLOUD_IDS.has(def.id)
): CloudSettings => {
  const colorization = def.runtimeEnabled
    ? def.hasRgb
      ? rgbAoColorizationPreset()
      : classificationAoColorizationPreset()
    : DEFAULT_COLORIZATION;
  const defaultCorrection =
    def.id === "awg"
      ? AWG2_MESH_2024_MICRO_CORRECTION
      : { offsetEast: 0, offsetNorth: 0, offsetUp: 0 };

  return {
    enabled,
    visualDefaultsVersion: def.id === "mls" ? 2 : 0,
    datum: def.defaultDatum,
    ...defaultCorrection,
    rotationEastDegrees: 0,
    rotationNorthDegrees: 0,
    rotationUpDegrees: 0,
    sizeMode: POINT_SIZE_MODES.METERS,
    pointSizePx: 2,
    radiusMeters: def.id === "mls" ? 0.1 : 0.3,
    radiusScale: 1,
    shape: def.id === "mls" ? POINT_SHAPES.DOME : POINT_SHAPES.CIRCLE,
    nodeBoundsVisible: false,
    colorization,
  };
};

const defaultMeshSettings = (definition?: MeshAssetDef): MeshSettings => ({
  enabled: false,
  zOffset: 0,
  white: definition?.defaultClay ?? false,
    clayColor: "#d6d2ca",
  errorTarget: TILES_ERROR_TARGET_DEFAULT_PIXELS,
  opacity: 1,
  wireframe: false,
  tileBoundsVisible: false,
});

// Ölberg survey bounds in UTM32, used to select the relevant oblique poses
// from the city-wide 2024 image set.
const TRASSE_BBOX_UTM: [number, number, number, number] = [
  369200, 5679500, 370800, 5681100,
];

const DEFAULT_TARGET_FRAME_RATE = 30;
const SCENE_REQUEST_CONCURRENCY = 12;
const CAMERA_MOVE_POINT_BUDGET_FACTOR = 0.35;
const NORMAL_MINIMUM_SPACING_PIXELS = 0.75;
const CAMERA_MOVE_MINIMUM_SPACING_PIXELS = 2;

const resolvePointMemoryBudget = (): PointMemoryBudget => {
  const memory =
    typeof performance === "undefined"
      ? undefined
      : (
          performance as Performance & {
            memory?: { jsHeapSizeLimit?: number };
          }
        ).memory;
  const deviceMemoryGiB =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  return derivePointMemoryBudget({
    jsHeapSizeLimitBytes: memory?.jsHeapSizeLimit,
    deviceMemoryGiB,
  });
};

const whenStyleReady = (map: MaplibreMap): Promise<void> => {
  if (map.isStyleLoaded()) return Promise.resolve();

  return new Promise((resolve) => {
    let pollTimer = 0;
    const cleanup = () => {
      map.off("load", handleStyleData);
      map.off("styledata", handleStyleData);
      if (pollTimer) window.clearInterval(pollTimer);
    };
    const handleStyleData = () => {
      if (!map.isStyleLoaded()) return;
      cleanup();
      resolve();
    };

    map.on("load", handleStyleData);
    map.on("styledata", handleStyleData);
    // MapLibre can become ready without another styledata event after an
    // optional source request was aborted. The active default cloud must not
    // then wait forever until the user toggles it off and on again.
    pollTimer = window.setInterval(handleStyleData, 100);
    handleStyleData();
  });
};

const formatCount = (value: number): string => value.toLocaleString("de-DE");
const formatMebibytes = (bytes: number): string =>
  `${Math.round(bytes / 1024 ** 2).toLocaleString("de-DE")} MiB`;

const formatPointMemoryBudgetSource = (
  source: PointMemoryBudget["source"]
): string =>
  source === "js-heap-limit"
    ? "Browser-Heap-Limit"
    : source === "device-memory"
    ? "Gerätespeicher"
    : "Browser-Fallback";

const readStoredMicroCorrections = (): Record<
  string,
  PointCloudMicroCorrection
> => {
  try {
    return parsePointCloudMicroCorrections(
      localStorage.getItem(MICRO_CORRECTIONS_STORAGE_KEY),
      CLOUD_ASSET_IDS
    );
  } catch {
    return {};
  }
};

const collectMicroCorrections = (
  settings: Readonly<Record<string, CloudSettings>>
): Record<string, PointCloudMicroCorrection> =>
  Object.fromEntries(
    CLOUD_ASSETS.map(({ id }) => [
      id,
      {
        offsetEast: settings[id]?.offsetEast ?? 0,
        offsetNorth: settings[id]?.offsetNorth ?? 0,
        offsetUp: settings[id]?.offsetUp ?? 0,
      },
    ])
  );

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

interface CloudState {
  loading: boolean;
  loadedPoints: number;
  loadedNodes: number;
  renderedNodes: number;
  visibleNodes: number;
  meta: CopcSceneMetadata | null;
  geoidUndulation: number | null;
  /** Per-field stats + histograms once loading finished */
  fields: CloudFieldInfo[] | null;
  error: string | null;
}

/** Map a UI color slot onto the engine slot (ramp texture etc.) */
const toLayerSlot = (slot: ColorSlotConfig): LayerColorSlot => {
  if (!slot.source) return { mode: 0 };
  if (slot.source.kind === "rgb") return { mode: 1 };
  if (slot.source.kind === "classification") {
    return {
      mode: 2,
      categoryLut: buildCategoryLut(
        slot.ramp,
        slot.inverted,
        slot.categoryStyles ?? {}
      ),
    };
  }
  if (slot.source.kind === "solid") {
    return { mode: 5, solidColor: slot.source.color };
  }
  if (isQualitativeRamp(slot.ramp)) {
    return {
      mode: 4,
      categoryLut: buildCategoryLut(
        slot.ramp,
        slot.inverted,
        slot.categoryStyles ?? {}
      ),
    };
  }
  return {
    mode: 3,
    rampTexture: getRampTexture(slot.ramp, slot.inverted),
    range: [slot.clampMin, slot.clampMax],
    clipRangeMin: slot.rangeModeMin === "clip",
    clipRangeMax: slot.rangeModeMax === "clip",
    gamma: slot.gamma,
  };
};

const BLEND_MODE_TO_INT = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
} as const;

const slotFieldName = (slot: ColorSlotConfig): string | null =>
  slot.source?.kind === "field" ? slot.source.field : null;

const getSecondaryPanelPosition = (index: number) => {
  const panelWidth = 400;
  const panelGap = 16;
  const topInset = 76;
  const estimatedPanelHeight = 460;
  const panelStep = estimatedPanelHeight + panelGap;
  const availableHeight = Math.max(0, window.innerHeight - topInset - 24);
  const rows = Math.max(
    1,
    Math.floor((availableHeight + panelGap) / (estimatedPanelHeight + panelGap))
  );
  const column = Math.floor(index / rows);
  const row = index % rows;
  const rightColumnX = Math.max(16, window.innerWidth - panelWidth - 16);
  const firstColumnX = 420;
  return {
    x: column === 0 ? firstColumnX : rightColumnX,
    y: topInset + row * panelStep,
  };
};

const isAbortError = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  value.name === "AbortError";

/** Flatten terrain skirts: maplibre has no public option, so zero the
 *  per-tile frame drop (Terrain.getMeshFrameDelta) on the live instance. */
const disableTerrainSkirts = (map: MaplibreMap) => {
  const terrainInstance = (
    map as unknown as {
      terrain?: { getMeshFrameDelta?: () => number; __noSkirts?: boolean };
    }
  ).terrain;
  if (terrainInstance && !terrainInstance.__noSkirts) {
    terrainInstance.__noSkirts = true;
    terrainInstance.getMeshFrameDelta = () => 0;
    map.triggerRepaint();
  }
};

/** Central scene state for the map surface shown above MapLibre terrain. */
type BasemapMode = "stadtplan" | "luftbild" | "off";

const useBasemapMode = (initialMode: BasemapMode = "stadtplan") => {
  const [mode, setMode] = useState<BasemapMode>(initialMode);
  const cycle = useCallback(
    () =>
      setMode((current) =>
        current === "stadtplan"
          ? "luftbild"
          : current === "luftbild"
          ? "off"
          : "stadtplan"
      ),
    []
  );
  return { mode, setMode, cycle };
};

const isAerialBasemapLayer = (layerId: string): boolean => {
  const id = layerId.toLowerCase();
  return (
    id.includes("trueortho2024") ||
    id.includes("rvrgrundriss") ||
    id.includes("rvrgrund") ||
    id.includes("rvr-schrift")
  );
};

const isCityBasemapLayer = (layerId: string): boolean =>
  layerId.toLowerCase().includes("wupp-plan-live");

const SCENE_BACKGROUND_COLORS = {
  white: "#ffffff",
  black: "#000000",
  gray50: "#808080",
} as const;
type SceneBackgroundPreset = keyof typeof SCENE_BACKGROUND_COLORS;

interface CloudSlot {
  def: CloudAssetDef;
  cancelToken: { cancelled: boolean };
  layer: CopcPointsLayer | null;
  /** Set instead of `layer` when the cloud is delivered as a 3D Tiles tileset. */
  tilesetRuntime?: ReturnType<typeof createPointTilesetSceneRuntime> | null;
  meta: CopcSceneMetadata | null;
  anchorMarker: THREE.Group | null;
  source: CopcPointSource | null;
  memoryBytes: number;
  cacheBudgetBytes: number;
  loadConcurrency: number;
  geoidUndulation: number | null;
  chunks: CopcPointChunk[];
  chunkCache: Map<
    string,
    { chunk: CopcPointChunk; bytes: number; lastUsed: number }
  >;
  desiredNodeKeys: Set<string>;
  loadingNodeKeys: Set<string>;
  nodeAbortControllers: Map<string, AbortController>;
  failedNodeKeys: Set<string>;
  terrainFieldDemId: string | null;
  terrainFieldComputing: boolean;
  terrainFieldError: string | null;
  loadComplete: boolean;
  fieldInfos: CloudFieldInfo[];
  /** Currently uploaded field per shader slot (avoid re-uploads) */
  uploadedFields: [string | null, string | null, string | null];
  workingSetRevision: number;
  trimCache: (() => void) | null;
  pumpNodeLoads: (() => void) | null;
}

interface SceneApi {
  /** Create a derived field on a cloud from an expression */
  deriveField: (
    cloudId: string,
    name: string,
    expression: string
  ) => Promise<void>;
}

const SceneManager = memo(function SceneManager({
  cloudAssets,
  cloudSettings,
  meshSettings,
  pointMemoryBudget,
  targetFrameRate,
  basemapMode,
  demId,
  buildingsEnabled,
  imageryPano,
  imageryOblique,
  onCloudState,
  onPointMemoryUsage,
  onTerrainChange,
  onImageryStatus,
  onApi,
}: {
  cloudAssets: CloudAssetDef[];
  cloudSettings: Record<string, CloudSettings>;
  meshSettings: Record<string, MeshSettings>;
  pointMemoryBudget: PointMemoryBudget;
  targetFrameRate: number;
  basemapMode: BasemapMode;
  demId: string;
  buildingsEnabled: boolean;
  imageryPano: boolean;
  imageryOblique: boolean;
  onCloudState: (id: string, state: CloudState) => void;
  onPointMemoryUsage: (usedBytes: number) => void;
  onTerrainChange: (active: boolean, sourceId?: string) => void;
  onImageryStatus: (status: string) => void;
  onApi?: (api: SceneApi) => void;
}) {
  const { map } = useLibreContext();
  const cloudSlotsRef = useRef<Map<string, CloudSlot>>(new Map());
  const meshLayersRef = useRef<Map<string, Tiles3dLayer>>(new Map());
  const terrainActiveRef = useRef(false);
  const sharedSceneLayer = useMemo(
    () => (map ? buildPointcloudSceneLayer("pointcloud-three-scene") : null),
    [map]
  );
  const onApiRef = useRef(onApi);
  onApiRef.current = onApi;
  const onPointMemoryUsageRef = useRef(onPointMemoryUsage);
  onPointMemoryUsageRef.current = onPointMemoryUsage;
  const cloudSettingsRef = useRef(cloudSettings);
  cloudSettingsRef.current = cloudSettings;
  const meshSettingsRef = useRef(meshSettings);
  meshSettingsRef.current = meshSettings;
  const rasterLayerVisibilityRef = useRef<Map<string, "visible" | "none">>(
    new Map()
  );

  const activeCloudIds = cloudAssets.filter(
    (def) => cloudSettings[def.id]?.enabled
  ).map((def) => def.id);
  const activeMeshIds = MESH_ASSETS.filter(
    (def) => meshSettings[def.id]?.enabled
  ).map((def) => def.id);
  const activeCloudKey = activeCloudIds.join("|");
  const activeMeshKey = activeMeshIds.join("|");
  const activeCloudIdsRef = useRef(activeCloudIds);
  activeCloudIdsRef.current = activeCloudIds;
  const activeMeshIdsRef = useRef(activeMeshIds);
  activeMeshIdsRef.current = activeMeshIds;
  const sceneMemoryAllocation = deriveSceneMemoryAllocation(
    pointMemoryBudget.bytes,
    activeCloudIds.length,
    activeMeshIds.length
  );
  const pointCapacity = sceneMemoryAllocation.pointCapacity;
  const pointWorkingSetBytes = sceneMemoryAllocation.pointBytes;
  const meshCacheBudgetBytes = sceneMemoryAllocation.meshBytesPerLayer;

  useEffect(() => {
    if (!map || !sharedSceneLayer) return;
    let stale = false;
    const add = () => {
      if (stale || !map.isStyleLoaded() || map.getLayer(sharedSceneLayer.id)) {
        return;
      }
      map.addLayer(sharedSceneLayer);
    };
    void whenStyleReady(map).then(add);
    map.on("styledata", add);
    return () => {
      stale = true;
      map.off("styledata", add);
      if (map.isStyleLoaded() && map.getLayer(sharedSceneLayer.id)) {
        map.removeLayer(sharedSceneLayer.id);
      }
      // Fast Refresh may recreate this effect while preserving runtime refs.
      // Detach the scene but keep mesh/point runtimes available for onAdd.
      sharedSceneLayer.detach();
    };
  }, [map, sharedSceneLayer]);

  // Keep MapLibre terrain registered for interaction and elevation queries,
  // but remove its visible raster drape while a surface mesh takes over.
  // A transparent render-to-texture layer is deliberately avoided: MapLibre
  // would still draw that terrain surface into the depth buffer.
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;

      const styleLayers = map.getStyle()?.layers ?? [];
      const rasterLayerIds = styleLayers
        .filter((layer) => layer.type === "raster")
        .map((layer) => layer.id);
      for (const layerId of rasterLayerIds) {
        const current = map.getLayoutProperty(layerId, "visibility") as
          | "visible"
          | "none"
          | undefined;
        if (!rasterLayerVisibilityRef.current.has(layerId)) {
          rasterLayerVisibilityRef.current.set(
            layerId,
            current === "none" ? "none" : "visible"
          );
        }

        const isAerial = isAerialBasemapLayer(layerId);
        const isCity = isCityBasemapLayer(layerId);
        const target =
          basemapMode === "off" ||
          (basemapMode === "stadtplan" && isAerial) ||
          (basemapMode === "luftbild" && isCity)
            ? "none"
            : "visible";
        if (current !== target) {
          map.setLayoutProperty(layerId, "visibility", target);
        }
      }
      map.triggerRepaint();
    };

    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, basemapMode]);

  // ── offsets into the registered MapLibre terrain-height frame ─
  const cloudBaseHeight = useCallback(
    (slot: CloudSlot): number => {
      const settings = cloudSettingsRef.current[slot.def.id];
      if (!settings || !slot.meta || !map) return 0;
      if (slot.geoidUndulation === null) {
        throw new Error(`GCG2016 undulation is unavailable for ${slot.def.id}`);
      }
      const [lng, lat] = slot.meta.centerLngLat;
      const surfaceHeightTerrain = terrainActiveRef.current
        ? map.queryTerrainElevation({ lng, lat }) ?? undefined
        : undefined;
      const base = resolveTerrainBaseHeight({
        datum: settings.datum,
        zBase: slot.meta.zBase,
        geoidUndulation: slot.geoidUndulation,
        surfaceHeightTerrain,
      });
      return base;
    },
    [map]
  );

  const meshOffset = useCallback((id: string): number => {
    const settings = meshSettingsRef.current[id];
    if (!settings) return 0;
    // ECEF is already ellipsoid-referenced. Applying GCG2016 here would repeat
    // the source conversion and place Mesh 2024 about 46.5 m too low.
    return settings.zOffset;
  }, []);

  const applyCloudSettings = useCallback(
    (slot: CloudSlot) => {
      const settings = cloudSettingsRef.current[slot.def.id];
      // A 3D Tiles delivery brings its own baked colours and screen-space
      // point size; only the pixel size is adjustable, and the panel hides
      // the options that do not apply to it.
      if (slot.tilesetRuntime) {
        if (!settings) return;
        slot.tilesetRuntime.setPointSize(settings.pointSizePx);
        slot.tilesetRuntime.setPositionOffset(
          settings.offsetEast,
          settings.offsetNorth,
          settings.offsetUp
        );
        slot.tilesetRuntime.setRotationOffset(
          settings.rotationEastDegrees,
          settings.rotationNorthDegrees,
          settings.rotationUpDegrees
        );
        return;
      }
      const layer = slot.layer;
      if (!settings || !layer) return;
      layer.setSizeMode(settings.sizeMode);
      layer.setPointSize(settings.pointSizePx);
      layer.setRadiusMeters(settings.radiusMeters);
      layer.setRadiusScale(settings.radiusScale);
      layer.setShape(settings.shape);
      layer.setNodeBoundsVisible(settings.nodeBoundsVisible);

      // A layer referencing a not-yet-loaded or lazily derived field stays
      // disabled instead of rendering garbage.
      const fieldExists = (name: string | null): boolean =>
        name !== null && Boolean(slot.chunks[0]?.fieldValues[name]);
      const resolveSlot = (config: ColorSlotConfig): LayerColorSlot => {
        const fieldName = slotFieldName(config);
        if (fieldName !== null && !fieldExists(fieldName)) return { mode: 0 };
        return toLayerSlot(config);
      };

      const resolvedLayers = settings.colorization.layers;
      const [layerA, layerB, layerC] = resolvedLayers;
      layer.setColorization(
        resolveSlot(layerA),
        resolveSlot(layerB),
        resolveSlot(layerC),
        { mode: BLEND_MODE_TO_INT[layerB.blendMode], opacity: layerB.opacity },
        { mode: BLEND_MODE_TO_INT[layerC.blendMode], opacity: layerC.opacity }
      );
      // Upload field data only when the selected field changed
      (["a", "b", "c"] as const).forEach((slotName, slotIndex) => {
        const config = resolvedLayers[slotIndex];
        const fieldName = slotFieldName(config);
        const effective = fieldExists(fieldName) ? fieldName : null;
        if (effective !== slot.uploadedFields[slotIndex]) {
          slot.chunks.forEach((chunk, index) =>
            layer.setChunkField(
              slotName,
              index,
              effective ? chunk.fieldValues[effective] ?? null : null
            )
          );
          slot.uploadedFields[slotIndex] = effective;
        }
      });

      layer.setPositionOffset(
        settings.offsetEast,
        settings.offsetNorth,
        cloudBaseHeight(slot) + settings.offsetUp
      );
      layer.setRotationOffset(
        settings.rotationEastDegrees,
        settings.rotationNorthDegrees,
        settings.rotationUpDegrees
      );
      updateAnchorMarker(slot, settings);
    },
    [cloudBaseHeight]
  );

  const applyMeshSettings = useCallback(
    (id: string) => {
      const settings = meshSettingsRef.current[id];
      const layer = meshLayersRef.current.get(id);
      if (!settings || !layer) return;
      layer.setHeightOffset(meshOffset(id));
      layer.setErrorTarget(settings.errorTarget);
      layer.setWhiteShading(settings.white);
      layer.setClayColor(settings.clayColor);
      layer.setOpacity(settings.opacity);
      layer.setWireframe(settings.wireframe);
      layer.setTileBoundsVisible(settings.tileBoundsVisible);
    },
    [meshOffset]
  );

  const applyAllSettings = useCallback(() => {
    for (const slot of cloudSlotsRef.current.values()) applyCloudSettings(slot);
    for (const id of meshLayersRef.current.keys()) applyMeshSettings(id);
  }, [applyCloudSettings, applyMeshSettings]);

  // Live-apply settings on every change (cheap uniform updates)
  useEffect(() => {
    applyAllSettings();
  }, [cloudSettings, meshSettings, applyAllSettings]);

  // ── terrain tracking (built-in mountain-city control) ────────
  useEffect(() => {
    if (!map) return;
    const notify = () => {
      const terrain = map.getTerrain();
      terrainActiveRef.current = Boolean(terrain);
      if (terrain) disableTerrainSkirts(map);
      onTerrainChange(Boolean(terrain), terrain?.source);
      applyAllSettings();
      if (terrain) map.once("idle", applyAllSettings);
    };
    notify();
    map.on("terrain", notify);
    return () => {
      map.off("terrain", notify);
    };
  }, [map, onTerrainChange, applyAllSettings]);

  // ── DEM selection while terrain is active (exaggeration 1) ───
  useEffect(() => {
    if (!map) return;
    const dem = DEMS.find((entry) => entry.id === demId);
    if (!dem) return;
    const current = map.getTerrain();
    if (!current || current.source === dem.sourceId) return;
    if (dem.spec && !map.getSource(dem.sourceId)) {
      map.addSource(dem.sourceId, dem.spec as never);
    }
    map.setTerrain({ source: dem.sourceId, exaggeration: 1 });
  }, [map, demId]);

  // ── ALKIS building sub-style toggle ──────────────────────────
  useEffect(() => {
    if (!map) return;
    let stale = false;
    const apply = () => {
      if (!stale) setBuildingLayersVisible(map, buildingsEnabled);
    };
    whenStyleReady(map).then(apply);
    map.on("styledata", apply);
    return () => {
      stale = true;
      map.off("styledata", apply);
    };
  }, [map, buildingsEnabled]);

  const refreshFieldsRef = useRef<Map<string, () => void>>(new Map());

  // ── terrain-relative Z: direct batch sampling of the selected DEM tiles ──
  const computeTerrainRelativeField = useCallback(
    (slot: CloudSlot) => {
      const dem = DEMS.find((entry) => entry.id === demId);
      const selected = cloudSettingsRef.current[
        slot.def.id
      ]?.colorization.layers.some(
        (layer) => slotFieldName(layer) === TERRAIN_RELATIVE_HEIGHT_FIELD
      );
      if (
        !selected ||
        !dem?.terrainFieldSource ||
        !slot.meta ||
        !slot.loadComplete ||
        slot.terrainFieldComputing ||
        slot.terrainFieldDemId === dem.id
      ) {
        return;
      }

      slot.terrainFieldDemId = dem.id;
      slot.terrainFieldComputing = true;
      slot.terrainFieldError = null;
      const revision = slot.workingSetRevision;
      const chunks = [...slot.chunks];
      for (const chunk of chunks) {
        delete chunk.fieldValues[TERRAIN_RELATIVE_HEIGHT_FIELD];
      }
      refreshFieldsRef.current.get(slot.def.id)?.();

      const token = slot.cancelToken;
      const pointBaseHeightMeters = cloudBaseHeight(slot);
      buildTerrainRelativeHeightField(
        chunks,
        slot.meta,
        pointBaseHeightMeters,
        dem.terrainFieldSource
      )
        .then(({ values }) => {
          if (
            token.cancelled ||
            slot.terrainFieldDemId !== dem.id ||
            slot.workingSetRevision !== revision
          )
            return;
          chunks.forEach((chunk, index) => {
            chunk.fieldValues[TERRAIN_RELATIVE_HEIGHT_FIELD] = values[index];
          });
          slot.uploadedFields = [null, null, null];
          refreshFieldsRef.current.get(slot.def.id)?.();
          applyCloudSettings(slot);
        })
        .catch((error: unknown) => {
          if (token.cancelled || slot.terrainFieldDemId !== dem.id) return;
          slot.terrainFieldError = `Geländerelativfeld: ${String(error)}`;
          refreshFieldsRef.current.get(slot.def.id)?.();
        })
        .finally(() => {
          slot.terrainFieldComputing = false;
          if (
            !token.cancelled &&
            slot.loadComplete &&
            slot.workingSetRevision !== revision
          ) {
            computeTerrainRelativeField(slot);
          }
        });
    },
    [applyCloudSettings, cloudBaseHeight, demId]
  );

  useEffect(() => {
    for (const slot of cloudSlotsRef.current.values()) {
      computeTerrainRelativeField(slot);
    }
  }, [cloudSettings, computeTerrainRelativeField]);

  // ── cloud lifecycle ──────────────────────────────────────────
  const emitPointMemoryUsage = useCallback(() => {
    const usedBytes = [...cloudSlotsRef.current.values()].reduce(
      (sceneTotal, slot) => sceneTotal + slot.memoryBytes,
      0
    );
    onPointMemoryUsageRef.current(usedBytes);
  }, []);
  const refreshPointMemoryUsage = useCallback(
    (slot: CloudSlot) => {
      slot.memoryBytes = [...slot.chunkCache.values()].reduce(
        (total, entry) => total + entry.bytes,
        0
      );
      emitPointMemoryUsage();
    },
    [emitPointMemoryUsage]
  );
  const requestRebalanceFrameRef = useRef(0);
  const applySceneRequestAllocation = useCallback(() => {
    const cloudIds = activeCloudIdsRef.current;
    const meshIds = activeMeshIdsRef.current;
    const cloudSlots = cloudSlotsRef.current;
    const meshLayers = meshLayersRef.current;
    const allocation = deriveSceneRequestAllocation(SCENE_REQUEST_CONCURRENCY, {
      pointJobsByCloud: cloudIds.map((id) => {
        const slot = cloudSlots.get(id);
        if (!slot?.source) return 1;
        let pending = 0;
        for (const key of slot.desiredNodeKeys) {
          if (!slot.chunkCache.has(key) && !slot.failedNodeKeys.has(key)) {
            pending++;
          }
        }
        return pending;
      }),
      meshJobsByLayer: meshIds.map(
        (id) => meshLayers.get(id)?.getRequestDemand() ?? 1
      ),
      prioritizedMeshLayers: meshIds.map((id) => id === "lod2"),
    });

    cloudIds.forEach((id, index) => {
      const slot = cloudSlots.get(id);
      if (!slot) return;
      const jobs = allocation.pointJobsByCloud[index] ?? 0;
      slot.loadConcurrency = jobs;
      slot.pumpNodeLoads?.();
    });
    meshIds.forEach((id, index) => {
      meshLayers
        .get(id)
        ?.setRequestConcurrency(allocation.meshJobsByLayer[index] ?? 0);
    });
  }, []);
  const scheduleSceneRequestAllocation = useCallback(() => {
    if (requestRebalanceFrameRef.current) return;
    requestRebalanceFrameRef.current = requestAnimationFrame(() => {
      requestRebalanceFrameRef.current = 0;
      applySceneRequestAllocation();
    });
  }, [applySceneRequestAllocation]);

  useEffect(
    () => () => {
      if (requestRebalanceFrameRef.current) {
        cancelAnimationFrame(requestRebalanceFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    applySceneRequestAllocation();
  }, [activeCloudKey, activeMeshKey, applySceneRequestAllocation]);

  const dynamicPointBudgetRef = useRef(pointCapacity);
  const cameraMovingRef = useRef(false);
  const dynamicBudgetFrameRef = useRef(0);
  const applyDynamicPointBudgets = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    const slots = [...cloudSlotsRef.current.values()].filter(
      (slot) => slot.layer !== null
    );
    const allocations = allocatePointBudget(
      cameraMovingRef.current
        ? Math.floor(
            dynamicPointBudgetRef.current * CAMERA_MOVE_POINT_BUDGET_FACTOR
          )
        : dynamicPointBudgetRef.current,
      slots.map((slot) => {
        const cloudBounds = slot.meta?.boundsLngLat;
        const visible = cloudBounds
          ? cloudBounds[1][0] >= bounds.getWest() &&
            cloudBounds[0][0] <= bounds.getEast() &&
            cloudBounds[1][1] >= bounds.getSouth() &&
            cloudBounds[0][1] <= bounds.getNorth()
          : true;
        return {
          loadedPoints:
            slot.source?.metadata.selectedPoints ?? slot.layer?.pointCount ?? 0,
          visible,
        };
      })
    );
    slots.forEach((slot, index) =>
      slot.layer?.setPointBudget(allocations[index] ?? 0)
    );
  }, [map]);
  const scheduleDynamicPointBudgets = useCallback(() => {
    if (dynamicBudgetFrameRef.current) return;
    dynamicBudgetFrameRef.current = requestAnimationFrame(() => {
      dynamicBudgetFrameRef.current = 0;
      applyDynamicPointBudgets();
    });
  }, [applyDynamicPointBudgets]);

  useEffect(
    () => () => {
      if (dynamicBudgetFrameRef.current) {
        cancelAnimationFrame(dynamicBudgetFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    dynamicPointBudgetRef.current = pointCapacity;
    applyDynamicPointBudgets();
  }, [activeCloudKey, applyDynamicPointBudgets, pointCapacity]);

  useEffect(() => {
    if (!map) return;
    let previousFrame = 0;
    let averageFrameTime = 16.7;
    let sampleCount = 0;
    let lastAdjustment = performance.now();

    const handleMoveStart = () => {
      cameraMovingRef.current = true;
      for (const slot of cloudSlotsRef.current.values()) {
        // A camera move invalidates the previous working set immediately.
        // The next frustum pass will re-add the nodes that still intersect
        // the view, avoiding bandwidth spent decoding tiles behind the camera.
        for (const controller of slot.nodeAbortControllers.values()) {
          controller.abort();
        }
        slot.nodeAbortControllers.clear();
        slot.loadingNodeKeys.clear();
        slot.layer?.setMinimumSpacingPixels(CAMERA_MOVE_MINIMUM_SPACING_PIXELS);
      }
      applyDynamicPointBudgets();
    };
    const handleMove = () => {
      scheduleDynamicPointBudgets();
      scheduleSceneRequestAllocation();
    };
    const handleMoveEnd = () => {
      cameraMovingRef.current = false;
      for (const slot of cloudSlotsRef.current.values()) {
        slot.layer?.setMinimumSpacingPixels(NORMAL_MINIMUM_SPACING_PIXELS);
      }
      applyDynamicPointBudgets();
      scheduleSceneRequestAllocation();
    };
    const handleRender = () => {
      const now = performance.now();
      if (previousFrame > 0) {
        const frameTime = now - previousFrame;
        if (frameTime >= 4 && frameTime <= 100) {
          averageFrameTime += (frameTime - averageFrameTime) * 0.08;
          sampleCount++;
        }
      }
      previousFrame = now;
      if (sampleCount < 20 || now - lastAdjustment < 1_000) return;
      sampleCount = 0;
      lastAdjustment = now;
      const next = adaptPointBudget(
        dynamicPointBudgetRef.current,
        pointCapacity,
        averageFrameTime,
        targetFrameRate
      );
      if (next === dynamicPointBudgetRef.current) return;
      dynamicPointBudgetRef.current = next;
      applyDynamicPointBudgets();
    };

    map.on("movestart", handleMoveStart);
    map.on("move", handleMove);
    map.on("moveend", handleMoveEnd);
    map.on("render", handleRender);
    return () => {
      map.off("movestart", handleMoveStart);
      map.off("move", handleMove);
      map.off("moveend", handleMoveEnd);
      map.off("render", handleRender);
    };
  }, [
    applyDynamicPointBudgets,
    map,
    pointCapacity,
    scheduleDynamicPointBudgets,
    scheduleSceneRequestAllocation,
    targetFrameRate,
  ]);

  useEffect(() => {
    if (!map || !sharedSceneLayer) return;
    const slots = cloudSlotsRef.current;
    const active = new Set(activeCloudKey.split("|").filter(Boolean));

    const teardown = (id: string, slot: CloudSlot) => {
      slot.cancelToken.cancelled = true;
      slot.nodeAbortControllers.forEach((controller) => controller.abort());
      slot.nodeAbortControllers.clear();
      const layerId = `copc-points-${id}`;
      disposeAnchorMarker(slot);
      sharedSceneLayer.removeRuntime(layerId);
      if (slot.tilesetRuntime) {
        sharedSceneLayer.removeRuntime(slot.tilesetRuntime.id);
        slot.tilesetRuntime = null;
      }
      slot.layer = null;
      slot.trimCache = null;
      slot.pumpNodeLoads = null;
      slots.delete(id);
      refreshFieldsRef.current.delete(id);
      emitPointMemoryUsage();
    };

    for (const [id, slot] of [...slots]) {
      if (!active.has(id)) teardown(id, slot);
    }

    const cacheBudgetBytes = deriveDecodedPointCacheBudget(
      pointWorkingSetBytes,
      active.size
    );
    for (const slot of slots.values()) {
      if (slot.cacheBudgetBytes !== cacheBudgetBytes) {
        slot.cacheBudgetBytes = cacheBudgetBytes;
        slot.trimCache?.();
        refreshPointMemoryUsage(slot);
      }
      slot.pumpNodeLoads?.();
    }

    for (const def of cloudAssets) {
      if (!active.has(def.id) || slots.has(def.id)) continue;
      const slot: CloudSlot = {
        def,
        cancelToken: { cancelled: false },
        layer: null,
        meta: null,
        anchorMarker: null,
        source: null,
        memoryBytes: 0,
        cacheBudgetBytes,
        loadConcurrency: 1,
        geoidUndulation: null,
        chunks: [],
        chunkCache: new Map(),
        desiredNodeKeys: new Set(),
        loadingNodeKeys: new Set(),
        nodeAbortControllers: new Map(),
        failedNodeKeys: new Set(),
        terrainFieldDemId: null,
        terrainFieldComputing: false,
        terrainFieldError: null,
        loadComplete: false,
        fieldInfos: [],
        uploadedFields: [null, null, null],
        workingSetRevision: 0,
        trimCache: null,
        pumpNodeLoads: null,
      };
      slots.set(def.id, slot);

      let loadedPoints = 0;
      let fields: CloudFieldInfo[] | null = null;
      refreshFieldsRef.current.set(def.id, () => {
        refreshPointMemoryUsage(slot);
        fields = buildCloudFieldInfos(slot.chunks);
        slot.fieldInfos = fields;
        onCloudState(def.id, {
          loading: false,
          loadedPoints,
          loadedNodes: 0,
          renderedNodes: 0,
          visibleNodes: 0,
          meta: slot.meta,
          geoidUndulation: slot.geoidUndulation,
          fields,
          error: slot.terrainFieldError,
        });
      });
      const emit = (partial: Partial<CloudState>) =>
        onCloudState(def.id, {
          loading: true,
          loadedPoints,
          loadedNodes: 0,
          renderedNodes: 0,
          visibleNodes: 0,
          meta: slot.meta,
          geoidUndulation: slot.geoidUndulation,
          fields,
          error: null,
          ...partial,
        });
      emit({ loading: true });

      let accessClock = 0;
      const refreshWorkingSet = (loading: boolean) => {
        slot.workingSetRevision++;
        loadedPoints = slot.chunks.reduce(
          (sum, chunk) => sum + chunk.pointCount,
          0
        );
        slot.loadComplete = !loading;
        slot.uploadedFields = [null, null, null];
        slot.terrainFieldDemId = null;
        fields = buildCloudFieldInfos(slot.chunks);
        slot.fieldInfos = fields;
        refreshPointMemoryUsage(slot);
        applyCloudSettings(slot);
        emit({ loading });
      };
      const evictColdChunks = () => {
        let cacheBytes = [...slot.chunkCache.values()].reduce(
          (sum, entry) => sum + entry.bytes,
          0
        );
        const candidates = [...slot.chunkCache.entries()]
          .filter(([key]) => !slot.desiredNodeKeys.has(key))
          .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        for (const [key, entry] of candidates) {
          if (cacheBytes <= slot.cacheBudgetBytes) break;
          slot.chunkCache.delete(key);
          cacheBytes -= entry.bytes;
        }
      };
      slot.trimCache = evictColdChunks;
      const unmountNode = (key: string) => {
        const index = slot.chunks.findIndex((chunk) => chunk.nodeKey === key);
        if (index < 0) return false;
        slot.layer?.removeChunk(key);
        slot.chunks.splice(index, 1);
        return true;
      };
      const mountCachedNode = (key: string) => {
        const entry = slot.chunkCache.get(key);
        if (!entry || slot.layer?.hasChunk(key)) return false;
        entry.lastUsed = ++accessClock;
        if (!slot.chunks.some((chunk) => chunk.nodeKey === key)) {
          slot.chunks.push(entry.chunk);
        }
        slot.layer?.addChunk(entry.chunk);
        return true;
      };

      const pumpNodeLoads = () => {
        if (!slot.source || slot.cancelToken.cancelled) return;
        const missing = [...slot.desiredNodeKeys].filter(
          (key) =>
            !slot.chunkCache.has(key) &&
            !slot.loadingNodeKeys.has(key) &&
            !slot.failedNodeKeys.has(key)
        );
        while (
          slot.loadingNodeKeys.size < slot.loadConcurrency &&
          missing.length > 0
        ) {
          const key = missing.shift()!;
          const controller = new AbortController();
          slot.loadingNodeKeys.add(key);
          slot.nodeAbortControllers.set(key, controller);
          slot.source
            .loadNode(key, { signal: controller.signal })
            .then((chunk) => {
              if (slot.cancelToken.cancelled) return;
              slot.chunkCache.set(key, {
                chunk,
                bytes: estimatePointChunkMemoryBytes(chunk),
                lastUsed: ++accessClock,
              });
              if (slot.desiredNodeKeys.has(key)) mountCachedNode(key);
              evictColdChunks();
            })
            .catch((error: unknown) => {
              if (isAbortError(error)) return;
              if (!slot.cancelToken.cancelled) {
                slot.failedNodeKeys.add(key);
                console.error(`[pointcloud] node ${key} failed:`, error);
              }
            })
            .finally(() => {
              if (slot.nodeAbortControllers.get(key) === controller) {
                slot.nodeAbortControllers.delete(key);
              }
              slot.loadingNodeKeys.delete(key);
              if (slot.cancelToken.cancelled) return;
              const stillMissing = [...slot.desiredNodeKeys].some(
                (desiredKey) =>
                  !slot.chunkCache.has(desiredKey) &&
                  !slot.loadingNodeKeys.has(desiredKey) &&
                  !slot.failedNodeKeys.has(desiredKey)
              );
              refreshWorkingSet(stillMissing || slot.loadingNodeKeys.size > 0);
              if (!stillMissing && slot.loadingNodeKeys.size === 0) {
                computeTerrainRelativeField(slot);
              }
              scheduleSceneRequestAllocation();
              pumpNodeLoads();
            });
        }
      };
      slot.pumpNodeLoads = pumpNodeLoads;

      const reconcileFrustumNodes = (
        nodeKeys: readonly string[],
        stats: { visibleNodeCount: number; selectedPointCount: number }
      ) => {
        if (slot.cancelToken.cancelled) return;
        slot.desiredNodeKeys = new Set(nodeKeys);
        for (const [key, controller] of slot.nodeAbortControllers) {
          if (!slot.desiredNodeKeys.has(key)) controller.abort();
        }
        let changed = false;
        for (const chunk of [...slot.chunks]) {
          if (chunk.nodeKey && !slot.desiredNodeKeys.has(chunk.nodeKey)) {
            changed = unmountNode(chunk.nodeKey) || changed;
          }
        }
        for (const key of nodeKeys) {
          changed = mountCachedNode(key) || changed;
        }
        evictColdChunks();
        const loading = nodeKeys.some(
          (key) =>
            !slot.failedNodeKeys.has(key) &&
            (!slot.chunkCache.has(key) || slot.loadingNodeKeys.has(key))
        );
        if (changed || loading) refreshWorkingSet(loading);
        onCloudState(def.id, {
          loading,
          loadedPoints,
          loadedNodes: slot.chunkCache.size,
          renderedNodes: slot.chunks.length,
          visibleNodes: stats.visibleNodeCount,
          meta: slot.meta,
          geoidUndulation: slot.geoidUndulation,
          fields,
          error: null,
        });
        scheduleSceneRequestAllocation();
        pumpNodeLoads();
      };

      const run = async () => {
        await whenStyleReady(map);
        if (slot.cancelToken.cancelled) return;
        // A 3D Tiles delivery is served by its own runtime; the octree,
        // budgeting and node pumping below are COPC-specific.
        if (def.delivery === "3d-tiles" && def.sourceBounds) {
          const centerEast =
            (def.sourceBounds.min[0] + def.sourceBounds.max[0]) / 2;
          const centerNorth =
            (def.sourceBounds.min[1] + def.sourceBounds.max[1]) / 2;
          const [longitude, latitude] = getFromUTM32ToWGS84([
            centerEast,
            centerNorth,
          ]) as [number, number];
          const undulation = await getGcg2016Undulation(
            longitude as Longitude.deg,
            latitude as Latitude.deg
          );
          if (slot.cancelToken.cancelled) return;
          // The scene's vertical frame is DHHN2016: resolveTerrainBaseHeight
          // returns DHHN heights and the COPC layers are offset by that base,
          // so a runtime's local y is simply the DHHN height. The tileset
          // geometry is ECEF on ellipsoidal heights, so anchoring it at the
          // ellipsoidal height of the DHHN zero level makes its local y come
          // out as the DHHN height directly - no extra base offset needed.
          // Anchoring at the cloud's own floor instead (as before) dropped the
          // whole tileset by that floor, roughly 142 m for Oelberg.
          const anchorHeight = undulation;
          const tilesetRuntime = createPointTilesetSceneRuntime({
            id: `point-tileset-${def.id}`,
            tilesetUrl: def.url,
            originLngLat: [longitude, latitude],
            anchorHeightEllipsoidal: anchorHeight,
            requestRender: () => map.triggerRepaint(),
          });
          slot.tilesetRuntime = tilesetRuntime;
          sharedSceneLayer.addRuntime(tilesetRuntime);
          map.triggerRepaint();
          return;
        }
        const source = await openCopcPointSource({
          url: def.url,
          registration: def.registration,
          fieldDimensions: def.fieldDimensions,
          includeRgb: def.hasRgb,
          cancelToken: slot.cancelToken,
        });
        if (slot.cancelToken.cancelled) return;
        slot.source = source;
        const meta = source.metadata;
        const [longitude, latitude] = meta.centerLngLat;
        slot.geoidUndulation =
          def.geoidUndulationMeters ??
          (await getGcg2016Undulation(
            longitude as Longitude.deg,
            latitude as Latitude.deg
          ));
        if (slot.cancelToken.cancelled) return;
        slot.meta = meta;
        const layerId = `copc-points-${def.id}`;
        const layer = buildCopcPointsLayer(layerId, meta.centerLngLat);
        slot.layer = layer;
        sharedSceneLayer.addRuntime(layer);
        layer.setPointBudget(
          Math.max(
            100_000,
            Math.floor(pointCapacity / Math.max(1, active.size))
          )
        );
      layer.setMinimumSpacingPixels(
        cameraMovingRef.current
          ? CAMERA_MOVE_MINIMUM_SPACING_PIXELS
          : NORMAL_MINIMUM_SPACING_PIXELS
      );
        layer.setFrustumNodeSource(source.nodes, reconcileFrustumNodes);
        applyCloudSettings(slot);
        scheduleSceneRequestAllocation();
        scheduleDynamicPointBudgets();
        emit({ loading: true });
      };

      run().catch((error: unknown) => {
        console.error(`[pointcloud] loading ${def.id} failed:`, error);
        if (!slot.cancelToken.cancelled) {
          emit({ loading: false, error: String(error) });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    activeCloudKey,
    emitPointMemoryUsage,
    pointCapacity,
    pointWorkingSetBytes,
    refreshPointMemoryUsage,
    scheduleSceneRequestAllocation,
    sharedSceneLayer,
  ]);

  // ── ad-hoc derived fields (expression → new field) ───────────
  const deriveField = useCallback(
    async (cloudId: string, name: string, expression: string) => {
      const slot = cloudSlotsRef.current.get(cloudId);
      if (!slot || slot.chunks.length === 0) {
        throw new Error("Wolke nicht geladen");
      }
      const available = Object.keys(slot.chunks[0].fieldValues);
      const compiled = compileFieldExpression(expression, available);
      for (const chunk of slot.chunks) {
        chunk.fieldValues[name] = compiled.evaluate(chunk);
      }
      refreshFieldsRef.current.get(cloudId)?.();
      applyCloudSettings(slot);
    },
    [applyCloudSettings]
  );

  useEffect(() => {
    onApiRef.current?.({ deriveField });
  }, [deriveField]);

  // ── mesh (3D Tiles) lifecycle ────────────────────────────────
  useEffect(() => {
    if (!map || !sharedSceneLayer) return;
    const layers = meshLayersRef.current;
    const active = new Set(activeMeshKey.split("|").filter(Boolean));
    let stale = false;

    for (const [id, tilesLayer] of layers) {
      const visible = active.has(id);
      tilesLayer.setVisible(visible);
      if (!visible) continue;
      tilesLayer.setCacheBudget(meshCacheBudgetBytes);
    }

    const addMissing = async () => {
      await whenStyleReady(map);
      if (stale) return;
      // Fast refresh can preserve this ref while the shared custom layer is
      // recreated and disposed. Do not let stale layer entries suppress mesh
      // creation on the next effect run.
      for (const [id, tilesLayer] of [...layers]) {
        if (!active.has(id)) continue;
        if (!sharedSceneLayer.hasRuntime(tilesLayer.id)) {
          tilesLayer.dispose();
          layers.delete(id);
        }
      }
      if (!map.getLayer(sharedSceneLayer.id)) {
        requestAnimationFrame(() => {
          if (!stale) void addMissing();
        });
        return;
      }
      for (const def of MESH_ASSETS) {
        if (!active.has(def.id) || layers.has(def.id)) continue;
        const center = map.getCenter();
        const tilesLayer = buildTiles3dLayer(
          `tiles3d-${def.id}`,
          def.url,
          [center.lng, center.lat],
          {
            cacheBudgetBytes: meshCacheBudgetBytes,
            requestConcurrency: 1,
            onRequestStateChange: scheduleSceneRequestAllocation,
          }
        );
        layers.set(def.id, tilesLayer);
        sharedSceneLayer.addRuntime(tilesLayer);
        tilesLayer.setVisible(true);
        applyMeshSettings(def.id);
        scheduleSceneRequestAllocation();
      }
    };
    addMissing().catch((error: unknown) =>
      console.error("[pointcloud] 3d tiles layer failed:", error)
    );

    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    activeMeshKey,
    meshCacheBudgetBytes,
    scheduleSceneRequestAllocation,
    sharedSceneLayer,
  ]);

  // ── oriented imagery (panorama + oblique poses) ──────────────
  const imageryLayersRef = useRef<Map<string, OrientedImageryLayer>>(new Map());
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const activeImageRef = useRef<string | null>(null);
  const onImageryStatusRef = useRef(onImageryStatus);
  onImageryStatusRef.current = onImageryStatus;

  useEffect(() => {
    if (!map) return;
    let stale = false;
    const layers = imageryLayersRef.current;

    const sync = async (kind: "pano" | "oblique", enabled: boolean) => {
      const layerId = `imagery-${kind}`;
      if (!enabled) {
        const existing = layers.get(kind);
        if (existing && map.getLayer(layerId)) map.removeLayer(layerId);
        layers.delete(kind);
        return;
      }
      if (layers.has(kind)) return;
      const poses =
        kind === "pano"
          ? await loadPanoPoses()
          : await loadObliquePoses(TRASSE_BBOX_UTM);
      if (stale) return;
      await whenStyleReady(map);
      if (stale || layers.has(kind)) return;
      const center = map.getCenter();
      const layer = buildOrientedImageryLayer(
        layerId,
        [center.lng, center.lat],
        poses
      );
      layers.set(kind, layer);
      if (!map.getLayer(layerId)) map.addLayer(layer);
      onImageryStatusRef.current(
        `${poses.length} ${kind === "pano" ? "Panoramen" : "Obliques"} geladen`
      );
    };

    Promise.all([
      sync("pano", imageryPano),
      sync("oblique", imageryOblique),
    ]).catch((error: unknown) =>
      console.error("[pointcloud] imagery load failed:", error)
    );
    return () => {
      stale = true;
    };
  }, [map, imageryPano, imageryOblique]);

  // Proximity projection: when the map center approaches a pose,
  // project its image onto all active mesh tilesets.
  useEffect(() => {
    if (!map) return;

    const loadTexture = async (url: string): Promise<THREE.Texture> => {
      const cache = textureCacheRef.current;
      const cached = cache.get(url);
      if (cached) return cached;
      const texture = await new THREE.TextureLoader()
        .setCrossOrigin("anonymous")
        .loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (cache.size > 12) {
        const firstKey = cache.keys().next().value as string;
        cache.get(firstKey)?.dispose();
        cache.delete(firstKey);
      }
      cache.set(url, texture);
      return texture;
    };

    const update = async () => {
      const meshLayers = [...meshLayersRef.current.values()];
      const imageryLayers = [...imageryLayersRef.current.values()];
      if (!meshLayers.length || !imageryLayers.length) {
        activeImageRef.current = null;
        for (const meshLayer of meshLayers) meshLayer.setProjector(null);
        return;
      }
      const center = map.getCenter();
      const elevation = map.queryTerrainElevation(center) ?? 0;

      let best: {
        layer: OrientedImageryLayer;
        index: number;
        dist: number;
      } | null = null;
      for (const imagery of imageryLayers) {
        const merc = MercatorCoordinate.fromLngLat(center, elevation);
        const cam = new THREE.Vector3(
          (merc.x - imagery.originMerc.x) / imagery.mScale,
          merc.z / imagery.mScale,
          (merc.y - imagery.originMerc.y) / imagery.mScale
        );
        for (let i = 0; i < imagery.scenePositions.length; i++) {
          const d = cam.distanceTo(imagery.scenePositions[i]);
          if (!best || d < best.dist)
            best = { layer: imagery, index: i, dist: d };
        }
      }

      const MAX_DIST = 120;
      if (!best || best.dist > MAX_DIST) {
        if (activeImageRef.current !== null) {
          activeImageRef.current = null;
          for (const meshLayer of meshLayers) meshLayer.setProjector(null);
          for (const imagery of imageryLayers) imagery.setHighlight(null);
          onImageryStatusRef.current("kein Bild in Reichweite (<120 m)");
        }
        return;
      }
      const pose = best.layer.poses[best.index];
      const opacity = Math.min(
        1,
        Math.max(0.15, 1 - (best.dist - 25) / (MAX_DIST - 25))
      );
      best.layer.setHighlight(best.index);
      try {
        const texture = await loadTexture(pose.imageUrl);
        if (activeImageRef.current === pose.id) {
          // still update opacity on move
        }
        activeImageRef.current = pose.id;
        for (const meshLayer of meshLayers) {
          const projector: ImageProjector =
            pose.kind === "pano"
              ? {
                  kind: "pano",
                  position: utmToScene(
                    pose.utm,
                    pose.lngLat,
                    meshLayer.originMerc,
                    meshLayer.mScale
                  ),
                  headingRad: pose.headingRad ?? 0,
                  texture,
                  opacity,
                }
              : {
                  kind: "frustum",
                  viewProj: buildFrustumProjector(
                    pose,
                    meshLayer.originMerc,
                    meshLayer.mScale
                  ),
                  texture,
                  opacity,
                };
          meshLayer.setProjector(projector);
        }
        onImageryStatusRef.current(
          `${pose.kind === "pano" ? "Pano" : "Oblique"} ${
            pose.id
          } · ${Math.round(best.dist)} m · ${Math.round(opacity * 100)}%`
        );
      } catch (error) {
        console.error("[pointcloud] image load failed:", error);
      }
    };

    const handler = () => {
      void update();
    };
    map.on("moveend", handler);
    handler();
    return () => {
      map.off("moveend", handler);
    };
  }, [map, imageryPano, imageryOblique]);

  // ── full teardown on unmount / map swap ──────────────────────
  useEffect(() => {
    if (!map || !sharedSceneLayer) return;
    return () => {
      for (const [id, slot] of [...cloudSlotsRef.current]) {
        slot.cancelToken.cancelled = true;
        slot.nodeAbortControllers.forEach((controller) => controller.abort());
        slot.nodeAbortControllers.clear();
        slot.trimCache = null;
        slot.pumpNodeLoads = null;
        const layerId = `copc-points-${id}`;
        sharedSceneLayer.removeRuntime(layerId);
        cloudSlotsRef.current.delete(id);
      }
      onPointMemoryUsageRef.current(0);
      for (const [id, tilesLayer] of [...meshLayersRef.current]) {
        sharedSceneLayer.removeRuntime(tilesLayer.id);
        meshLayersRef.current.delete(id);
      }
    };
  }, [map, sharedSceneLayer]);

  return null;
});

// ─────────────────────────────────────────────────────────────
//  Panel UI (geoportal secondary-view style, top center)
// ─────────────────────────────────────────────────────────────

/** Geoportal secondary-view card shadow (apps/geoportal button.css) */
const CARD_SHADOW =
  "shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)]";

function OptionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center w-full gap-2 py-0.5">
      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
        {children}
      </div>
    </div>
  );
}

const CLOUD_OFFSET_SLIDER_LIMIT_METERS = 10;
const CLOUD_ROTATION_SLIDER_LIMIT_DEGREES = 15;

function CloudOffsetRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const sliderValue = Math.max(
    -CLOUD_OFFSET_SLIDER_LIMIT_METERS,
    Math.min(CLOUD_OFFSET_SLIDER_LIMIT_METERS, value)
  );

  return (
    <OptionRow label={label}>
      <div className="flex-1 min-w-[100px] pt-1">
        <Slider
          min={-CLOUD_OFFSET_SLIDER_LIMIT_METERS}
          max={CLOUD_OFFSET_SLIDER_LIMIT_METERS}
          step={0.1}
          value={sliderValue}
          onChange={onChange}
          tooltip={{ formatter: (next) => `${next?.toFixed(1) ?? 0} m` }}
        />
      </div>
      <InputNumber
        size="small"
        className="w-28"
        step={0.1}
        precision={2}
        value={value}
        addonAfter="m"
        onChange={(next) => {
          if (typeof next === "number" && Number.isFinite(next)) onChange(next);
        }}
      />
    </OptionRow>
  );
}

function CloudAngleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const sliderValue = Math.max(
    -CLOUD_ROTATION_SLIDER_LIMIT_DEGREES,
    Math.min(CLOUD_ROTATION_SLIDER_LIMIT_DEGREES, value)
  );

  return (
    <OptionRow label={label}>
      <div className="flex-1 min-w-[100px] pt-1">
        <Slider
          min={-CLOUD_ROTATION_SLIDER_LIMIT_DEGREES}
          max={CLOUD_ROTATION_SLIDER_LIMIT_DEGREES}
          step={0.1}
          value={sliderValue}
          onChange={onChange}
          tooltip={{ formatter: (next) => `${next?.toFixed(1) ?? 0}°` }}
        />
      </div>
      <InputNumber
        size="small"
        className="w-28"
        step={0.1}
        precision={2}
        value={value}
        addonAfter="°"
        onChange={(next) => {
          if (typeof next === "number" && Number.isFinite(next)) onChange(next);
        }}
      />
    </OptionRow>
  );
}

const formatMountCoordinate = (value: number): string => value.toFixed(3);
const formatMountTuple = (values: readonly number[]): string =>
  `(${values.map((value) => formatMountCoordinate(value)).join(", ")})`;

const disposeAnchorMarker = (slot: CloudSlot): void => {
  if (!slot.anchorMarker) return;
  slot.layer?.root.remove(slot.anchorMarker);
  slot.anchorMarker.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
  });
  slot.anchorMarker = null;
};

const buildAnchorMarker = (): THREE.Group => {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff4d4f,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.07, 8, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(sphere);
  group.add(ring);
  return group;
};

const updateAnchorMarker = (
  slot: CloudSlot,
  settings: CloudSettings
): void => {
  if (!slot.layer || !slot.meta) {
    disposeAnchorMarker(slot);
    return;
  }

  const registration = slot.def.registration;
  const anchorPosition = registration?.anchor ?? slot.meta.sourceOrigin;
  const resolvedAnchor = registration
    ? resolveCopcSourcePosition(anchorPosition, registration)
    : anchorPosition;
  const [lng, lat] = slot.meta.centerLngLat;
  const originMerc = MercatorCoordinate.fromLngLat([lng, lat], 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();
  const merc = MercatorCoordinate.fromLngLat(
    getFromUTM32ToWGS84([resolvedAnchor.easting, resolvedAnchor.northing]) as [number, number],
    resolvedAnchor.height - slot.meta.zBase
  );
  const localAnchor = [
    (merc.x - originMerc.x) / meterScale,
    (merc.z - originMerc.z) / meterScale,
    (merc.y - originMerc.y) / meterScale,
  ] as const;

  if (!slot.anchorMarker) {
    slot.anchorMarker = buildAnchorMarker();
    slot.layer.root.add(slot.anchorMarker);
  }

  slot.anchorMarker.position.fromArray(localAnchor);
  slot.anchorMarker.visible = settings.enabled;
};

function CloudMountPose({
  def,
  meta,
  settings,
  datumOffsetMeters,
}: {
  def: CloudAssetDef;
  meta: CopcSceneMetadata;
  settings: CloudSettings;
  datumOffsetMeters: number | null;
}) {
  const pivot = def.registration?.anchor ?? meta.sourceOrigin;
  const rotationEast = settings.rotationEastDegrees;
  const rotationNorth = settings.rotationNorthDegrees;
  const rotationUp = settings.rotationUpDegrees;
  const rigidUp = def.registration?.translationUpMeters ?? 0;
  const manualDelta = [
    settings.offsetEast,
    settings.offsetNorth,
    settings.offsetUp,
  ] as const;
  const totalDelta =
    datumOffsetMeters === null
      ? null
      : [
          settings.offsetEast,
          settings.offsetNorth,
          rigidUp + datumOffsetMeters + settings.offsetUp,
        ];

  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
      <div className="mb-1 font-medium text-gray-700">
        Registrierung · starr
      </div>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-mono tabular-nums">
        <span className="font-sans text-gray-500">Pivot p₀</span>
        <span className="break-words">
          {formatMountTuple([pivot.easting, pivot.northing, pivot.height])} m
        </span>
        <span className="font-sans text-gray-500">Δ E/N/U</span>
        <span className="break-words">
          {totalDelta
            ? `${formatMountTuple(totalDelta)} m`
            : "nicht verfügbar (Datumstransformation fehlgeschlagen)"}
        </span>
        <span className="font-sans text-gray-500">Euler XYZ</span>
        <span className="break-words">
          {formatMountTuple([rotationEast, rotationNorth, rotationUp])}°
        </span>
        <span className="font-sans text-gray-500">Δ-Anteile</span>
        <span className="break-words">
          Fit (0.000, 0.000, {rigidUp.toFixed(3)}) · Datum U{" "}
          {datumOffsetMeters === null
            ? "n/v"
            : `${datumOffsetMeters.toFixed(3)} m`}{" "}
          · manuell {formatMountTuple(manualDelta)} m
        </span>
      </div>
      <div className="mt-1 font-mono text-[11px] leading-4 text-gray-600 break-words">
        p′ = p₀ + Δ + Rz({rotationUp.toFixed(3)}°) Ry(
        {rotationNorth.toFixed(3)}°) Rx({rotationEast.toFixed(3)}°) (p − p₀)
      </div>
      <div className="text-[11px] leading-4 text-gray-500">
        Extrinsisches XYZ um feste Gitterachsen: X = Ost, Y = Nord, Z = Hoch.
        Gitternordkonvergenz wirkt nur auf Z/Gier, nicht auf X/Y-Neigung oder
        Höhe.
        {def.registration
          ? " Empirischer DGM-Fit; keine Sensorpose im COPC."
          : ""}
      </div>
    </div>
  );
}

export interface PointCloudPlaygroundProps {
  initialCloudIds?: readonly string[];
  initialCloudDatumById?: Readonly<Record<string, ElevationDatum>>;
  initialCloudOffsetById?: Readonly<
    Record<string, Partial<CloudPositionOffset>>
  >;
  initialMapView?: {
    center: [number, number];
    zoom: number;
    pitch?: number;
    bearing?: number;
  };
  initialTargetFrameRate?: number;
  initialBuildingsEnabled?: boolean;
  initialImageryPano?: boolean;
  initialImageryOblique?: boolean;
  fraunhoferGeoJsonUrl?: string;
  showMapControls?: boolean;
  showScenePanel?: boolean;
}

export function PointCloudPlayground({
  initialCloudIds,
  initialCloudDatumById,
  initialCloudOffsetById,
  initialMapView,
  initialTargetFrameRate = DEFAULT_TARGET_FRAME_RATE,
  initialBuildingsEnabled = false,
  initialImageryPano = false,
  initialImageryOblique = false,
  fraunhoferGeoJsonUrl,
  showMapControls = true,
  showScenePanel = true,
}: PointCloudPlaygroundProps = {}) {
  const { map } = useLibreContext();
  const { getHashStateValues, updateHashState } = useHashState();
  const hashView = getHashStateValues();
  const { addFeature, features: adhocFeatures, removeFeature } =
    useAdhocFeatureDisplay();
  const [importedCloudAssets, setImportedCloudAssets] = useState<CloudAssetDef[]>(
    []
  );
  const [adhocPointCloudsHydrated, setAdhocPointCloudsHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADHOC_POINTCLOUD_STORAGE_KEY);
      // Having imported nothing is a normal state, so an empty stored
      // collection is restored as "no imports" instead of being handed to the
      // import parser, which rejects empty collections for a reason: an empty
      // file a user drops really is an error worth reporting.
      const stored = raw ? (JSON.parse(raw) as { features?: unknown }) : null;
      const hasStoredFeatures =
        Array.isArray(stored?.features) && stored.features.length > 0;
      if (stored && hasStoredFeatures) {
        const parsed = parseAdhocPointCloudJson(stored);
        const restoredAssets = parsed.features.map((feature) => {
          const config = pointCloudFeatureToConfig(feature);
          const asset: CloudAssetDef = {
            format: config.format,
            id: feature.id,
            label: feature.metadata?.title ?? config.url.split("/").pop() ?? feature.id,
            artifactFileName: config.url,
            sourceTag: "Import",
            acquiredOn: null,
            fieldDimensions: config.fields ?? [],
            hasRgb: config.hasRgb ?? false,
            runtimeEnabled: true,
            defaultDatum: config.source?.verticalDatum === "ellipsoidal" ? "ellipsoidal" : "dhhn",
            source: config.source,
            transform: config.transform,
            url: config.url,
          };
          return asset;
        });
        setImportedCloudAssets(restoredAssets);
        setCloudSettings((current) => ({
          ...current,
          ...Object.fromEntries(
            restoredAssets.map((asset) => [asset.id, defaultCloudSettings(asset, true)])
          ),
        }));
        parsed.features.forEach((feature) =>
          addFeature(feature, {
            collectionId: parsed.collection.id,
            collectionTitle: parsed.collection.title,
            collectionMetadata: parsed.collection.metadata,
            layerId: "pointcloud",
          })
        );
      }
    } catch (error) {
      console.warn("Gespeicherte Pointcloud-Imports konnten nicht geladen werden.", error);
    } finally {
      setAdhocPointCloudsHydrated(true);
    }
  }, [addFeature]);
  useEffect(() => {
    if (!adhocPointCloudsHydrated) return;
    const imported = adhocFeatures.filter(isAdhocPointCloudFeature);
    try {
      if (imported.length === 0) {
        localStorage.removeItem(ADHOC_POINTCLOUD_STORAGE_KEY);
      } else {
        localStorage.setItem(
          ADHOC_POINTCLOUD_STORAGE_KEY,
          JSON.stringify({
            type: "FeatureCollection",
            features: imported,
          })
        );
      }
    } catch (error) {
      console.warn("Pointcloud-Imports konnten nicht gespeichert werden.", error);
    }
  }, [adhocFeatures, adhocPointCloudsHydrated]);
  const handlePointCloudDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (!file || (!file.name.endsWith(".json") && !file.name.endsWith(".geojson"))) {
        console.warn("Bitte eine Pointcloud-GeoJSON-Datei ablegen.");
        return;
      }
      try {
        const parsed = parseAdhocPointCloudJson(JSON.parse(await file.text()));
        setImportedCloudAssets((current) => [
          ...current,
          ...parsed.features.map((feature) => {
            const config = pointCloudFeatureToConfig(feature);
            const label =
              feature.metadata?.title ?? config.url.split("/").pop() ?? feature.id;
            const nextAsset: CloudAssetDef = {
              format: config.format,
              id: feature.id,
              label,
              artifactFileName: config.url,
              sourceTag: "Import",
              acquiredOn: null,
              fieldDimensions: config.fields ?? [],
              hasRgb: config.hasRgb ?? false,
              runtimeEnabled: true,
              defaultDatum:
                config.source?.verticalDatum === "ellipsoidal"
                  ? "ellipsoidal"
                  : "dhhn",
              source: config.source,
              transform: config.transform,
              url: config.url,
              registration: undefined,
            };
            setCloudSettings((current) => ({
              ...current,
              [nextAsset.id]: defaultCloudSettings(nextAsset, true),
            }));
            return nextAsset;
          }),
        ]);
        parsed.features.forEach((feature) =>
          addFeature(feature, {
            collectionId: parsed.collection.id,
            collectionTitle: parsed.collection.title,
            collectionMetadata: parsed.collection.metadata,
            layerId: "pointcloud",
          })
        );
      } catch (error) {
        console.error("Pointcloud-Import fehlgeschlagen.", error);
      }
    },
    [addFeature]
  );
  const cloudAssets = useMemo(
    () => [...CLOUD_ASSETS, ...importedCloudAssets],
    [importedCloudAssets]
  );
  useEffect(() => {
    const preventBrowserFileOpen = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("dragover", preventBrowserFileOpen);
    window.addEventListener("drop", preventBrowserFileOpen);
    return () => {
      window.removeEventListener("dragover", preventBrowserFileOpen);
      window.removeEventListener("drop", preventBrowserFileOpen);
    };
  }, []);
  const persistedViewState = useMemo(() => {
    try {
      return readPointcloudViewState(VIEW_STATE_STORAGE_KEY, localStorage);
    } catch {
      return null;
    }
  }, []);
  const persistedCameraRef = useRef<PersistedMapCamera | null>(
    typeof hashView.lat === "number" &&
      typeof hashView.lng === "number" &&
      typeof hashView.zoom === "number"
      ? {
          center: [hashView.lng, hashView.lat],
          zoom: hashView.zoom - 1,
          pitch: typeof hashView.p === "number" ? hashView.p : 0,
          bearing: typeof hashView.b === "number" ? hashView.b : 0,
        }
      : persistedViewState?.camera ?? null
  );
  useEffect(() => {
    if (!map) return;
    const restoredCamera = initialMapView ?? persistedCameraRef.current;
    if (restoredCamera) map.jumpTo(restoredCamera);
  }, [map, initialMapView]);
  useEffect(() => {
    if (!map) return;
    const persistCameraInUrl = () => {
      const center = map.getCenter();
      updateHashState(
        {
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom() + 1,
          b: Math.abs(map.getBearing()) >= 0.01 ? map.getBearing() : undefined,
          p: Math.abs(map.getPitch()) >= 0.01 ? map.getPitch() : undefined,
        },
        { replace: true }
      );
    };
    map.on("moveend", persistCameraInUrl);
    persistCameraInUrl();
    return () => {
      map.off("moveend", persistCameraInUrl);
    };
  }, [map, updateHashState]);

  const [cloudSettings, setCloudSettings] = useState<
    Record<string, CloudSettings>
  >(() => {
    const enabledCloudIds = new Set(
      initialCloudIds ?? [...DEFAULT_PRELOADED_CLOUD_IDS]
    );
    const storedMicroCorrections = readStoredMicroCorrections();
    return Object.fromEntries(
      cloudAssets.map((def) => {
        const persisted = persistedViewState?.cloudSettings[def.id];
        const enabled = initialCloudIds
          ? enabledCloudIds.has(def.id)
          : typeof persisted?.enabled === "boolean"
          ? persisted.enabled
          : enabledCloudIds.has(def.id);
        const defaults = defaultCloudSettings(def, enabled);
        const migratedPersisted =
          def.id === "mls" &&
          persisted?.visualDefaultsVersion !== defaults.visualDefaultsVersion
            ? {
                ...persisted,
                visualDefaultsVersion: defaults.visualDefaultsVersion,
                sizeMode: defaults.sizeMode,
                radiusMeters: defaults.radiusMeters,
                shape: defaults.shape,
                colorization: defaults.colorization,
              }
            : persisted;
        const settings = mergePersistedSettings(defaults, migratedPersisted);
        return [
          def.id,
          {
            ...settings,
            datum: initialCloudDatumById?.[def.id] ?? settings.datum,
            ...initialCloudOffsetById?.[def.id],
            ...storedMicroCorrections[def.id],
          },
        ];
      })
    );
  });
  const [meshSettings, setMeshSettings] = useState<
    Record<string, MeshSettings>
  >(() =>
    Object.fromEntries(
      MESH_ASSETS.map((def) => [
        def.id,
        mergePersistedSettings(
          defaultMeshSettings(def),
          persistedViewState?.meshSettings[def.id]
        ),
      ])
    )
  );
  const [cloudStates, setCloudStates] = useState<Record<string, CloudState>>(
    {}
  );
  const pointMemoryBudget = useMemo(resolvePointMemoryBudget, []);
  const [pointMemoryUsedBytes, setPointMemoryUsedBytes] = useState(0);
  const [targetFrameRate, setTargetFrameRate] = useState(
    initialTargetFrameRate
  );
  const [buildingsEnabled, setBuildingsEnabled] = useState(
    initialBuildingsEnabled
  );
  const [imageryPano, setImageryPano] = useState(initialImageryPano);
  const [imageryOblique, setImageryOblique] = useState(initialImageryOblique);
  const [imageryStatus, setImageryStatus] = useState("");
  const [terrainActive, setTerrainActive] = useState(false);
  const [demId, setDemId] = useState<string>(DEMS[0].id);
  const [pitchLimiterEnabled, setPitchLimiterEnabled] = useState(false);
  const [sceneBackground, setSceneBackground] =
    useState<SceneBackgroundPreset>("gray50");
  const [sceneBackgroundColor, setSceneBackgroundColor] = useState<string>(
    SCENE_BACKGROUND_COLORS.gray50
  );
  const photoMeshEnabled = MESH_ASSETS.some(
    (definition) =>
      definition.replacesBasemap && meshSettings[definition.id]?.enabled
  );
  const basemap = useBasemapMode(photoMeshEnabled ? "off" : "stadtplan");
  const [expanded, setExpanded] = useState(true);
  const [sceneApi, setSceneApi] = useState<SceneApi | null>(null);
  const [cloudOptionsIds, setCloudOptionsIds] = useState<string[]>([]);
  const [meshOptionsIds, setMeshOptionsIds] = useState<string[]>([]);
  const [cloudDetailsOpen, setCloudDetailsOpen] = useState<Record<string, boolean>>({});
  /** Cloud whose colorizer floats as a draggable expert panel */
  const [colorizerCloudId, setColorizerCloudId] = useState<string | null>(null);
  useEffect(() => {
    if (!map) return;
    const applyBackground = () => {
      if (!map.isStyleLoaded()) return;
      const color = sceneBackgroundColor;
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type === "background") {
          map.setPaintProperty(layer.id, "background-color", color);
        }
      }
      map.getCanvas().style.backgroundColor = color;
      map.triggerRepaint();
    };
    applyBackground();
    map.on("styledata", applyBackground);
    return () => {
      map.off("styledata", applyBackground);
    };
  }, [map, sceneBackgroundColor]);
  const libreLayers = useMemo(
    () => [
      ...BUILDINGS_LIBRE_LAYERS,
      ...(fraunhoferGeoJsonUrl
        ? [
            {
              type: "geojson" as const,
              name: "Fraunhofer Klassifikationsgeometrien",
              data: fraunhoferGeoJsonUrl,
            },
          ]
        : []),
    ],
    [fraunhoferGeoJsonUrl]
  );

  const microCorrections = collectMicroCorrections(cloudSettings);
  const microCorrectionsStorageJson = JSON.stringify(
    buildPointCloudMicroCorrectionsDocument(microCorrections)
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        MICRO_CORRECTIONS_STORAGE_KEY,
        microCorrectionsStorageJson
      );
    } catch (error) {
      console.warn(
        "Point-cloud microcorrections could not be persisted",
        error
      );
    }
  }, [microCorrectionsStorageJson]);

  const exportMicroCorrections = () => {
    const exportedAt = new Date().toISOString();
    downloadJson(
      `pointcloud-microcorrections-${exportedAt.replace(/[:.]/g, "-")}.json`,
      buildPointCloudMicroCorrectionsDocument(
        microCorrections,
        CLOUD_ASSET_EXPORT_METADATA,
        exportedAt
      )
    );
  };

  const patchCloud = (id: string, patch: Partial<CloudSettings>) =>
    setCloudSettings((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...patch },
    }));
  const toggleCloudDetails = (id: string) =>
    setCloudDetailsOpen((previous) => ({
      ...previous,
      [id]: !previous[id],
    }));
  const patchMesh = (id: string, patch: Partial<MeshSettings>) => {
    const definition = MESH_ASSETS.find((candidate) => candidate.id === id);
    if (definition?.replacesBasemap && patch.enabled === true) {
      // A photo mesh replaces the draped map. Users can still re-enable the
      // basemap explicitly with the scene-header map button.
      basemap.setMode("off");
    }
    setMeshSettings((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...patch },
    }));
  };
  const resetCloud = (id: string) => {
    const def = CLOUD_ASSETS.find((candidate) => candidate.id === id);
    if (!def) return;
    setCloudSettings((previous) => {
      const defaults = defaultCloudSettings(
        def,
        previous[id]?.enabled ?? false
      );
      return {
        ...previous,
        [id]: {
          ...defaults,
          datum: initialCloudDatumById?.[id] ?? defaults.datum,
          ...initialCloudOffsetById?.[id],
        },
      };
    });
  };
  const resetMesh = (id: string) =>
    setMeshSettings((previous) => ({
      ...previous,
      [id]: {
        ...defaultMeshSettings(MESH_ASSETS.find((def) => def.id === id)),
        enabled: previous[id]?.enabled ?? false,
      },
    }));
  const openCloudOptions = (id: string) =>
    setCloudOptionsIds((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    );
  const openMeshOptions = (id: string) =>
    setMeshOptionsIds((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    );

  const persistViewState = useCallback(
    (camera: PersistedMapCamera | null = persistedCameraRef.current) => {
      persistedCameraRef.current = camera;
      try {
        writePointcloudViewState(
          VIEW_STATE_STORAGE_KEY,
          { camera, cloudSettings, meshSettings },
          localStorage
        );
      } catch (error) {
        console.warn("Pointcloud view state could not be persisted", error);
      }
    },
    [cloudSettings, meshSettings]
  );

  useEffect(() => {
    persistViewState();
  }, [persistViewState]);

  useEffect(() => {
    if (!map) return;
    const persistCamera = () => {
      const center = map.getCenter();
      persistViewState({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    };
    map.on("moveend", persistCamera);
    return () => {
      map.off("moveend", persistCamera);
    };
  }, [map, persistViewState]);

  const handleTerrainChange = useCallback(
    (active: boolean, sourceId?: string) => {
      setTerrainActive(active);
      if (active) setDemId(demIdForSource(sourceId));
    },
    []
  );

  const handleCloudState = useCallback((id: string, state: CloudState) => {
    setCloudStates((previous) => ({ ...previous, [id]: state }));
  }, []);

  const anyLoading = cloudAssets.some(
    (def) => cloudSettings[def.id]?.enabled && cloudStates[def.id]?.loading
  );
  const sceneMemoryAllocation = deriveSceneMemoryAllocation(
    pointMemoryBudget.bytes,
    cloudAssets.filter((def) => cloudSettings[def.id]?.enabled).length,
    MESH_ASSETS.filter((def) => meshSettings[def.id]?.enabled).length
  );
  const pointMemoryPercent = Math.round(
    sceneMemoryAllocation.pointBytes > 0
      ? (pointMemoryUsedBytes / sceneMemoryAllocation.pointBytes) * 100
      : 0
  );

  useEffect(() => {
    map?.setMaxPitch(pitchLimiterEnabled ? 60 : 180);
  }, [map, pitchLimiterEnabled]);

  const cloudItems = cloudAssets.map((def) => {
    const settings = cloudSettings[def.id];
    const state = cloudStates[def.id];
    let datumOffsetMeters: number | null = null;
    if (state?.meta && state.geoidUndulation !== null) {
      try {
        const [lng, lat] = state.meta.centerLngLat;
        const surfaceHeightTerrain =
          terrainActive && map
            ? map.queryTerrainElevation({ lng, lat }) ?? undefined
            : undefined;
        datumOffsetMeters =
          resolveTerrainBaseHeight({
            datum: settings.datum,
            zBase: state.meta.zBase,
            geoidUndulation: state.geoidUndulation,
            surfaceHeightTerrain,
          }) - state.meta.zBase;
      } catch {
        // The mount expression remains visible and explicitly marks the
        // unresolved datum term instead of substituting a silent zero.
      }
    }
    const flyToState = getCloudFlyToButtonState(
      Boolean(settings.enabled),
      Boolean(state?.meta),
      Boolean(state?.loading)
    );
    const isImportedCloud = def.id.startsWith(ADHOC_POINTCLOUD_ID_PREFIX);
    // A 3D Tiles delivery renders baked vertex colours through a plain points
    // material, so the colourizer and the splat shape have nothing to act on
    // and their rows stay hidden rather than silently doing nothing. Point
    // size still applies and keeps its row.
    const isTilesetDelivery = def.delivery === "3d-tiles";
    return {
      key: def.id,
      label: (
        <div className="flex h-8 min-w-0 items-center gap-1 rounded px-1 hover:bg-gray-50">
          <button
            type="button"
            className={`flex size-7 shrink-0 items-center justify-center ${
              settings.enabled ? "text-gray-700" : "text-gray-400"
            }`}
            title={
              settings.enabled ? "Punktwolke ausblenden" : "Punktwolke anzeigen"
            }
            aria-label={
              settings.enabled ? "Punktwolke ausblenden" : "Punktwolke anzeigen"
            }
            onClick={() => patchCloud(def.id, { enabled: !settings.enabled })}
          >
            <FontAwesomeIcon icon={settings.enabled ? faEye : faEyeSlash} />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => openCloudOptions(def.id)}
            title="Punktwolkenoptionen öffnen"
          >
            <span className="truncate">{def.label}</span>
            <span className="shrink-0 rounded-sm bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600">
              {def.sourceTag}
            </span>
            {def.acquiredOn && (
              <span className="shrink-0 text-[10px] tabular-nums text-gray-500">
                {formatPointCloudAcquisitionDate(def.acquiredOn)}
              </span>
            )}
          </button>
          {isImportedCloud && (
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center text-gray-500 hover:text-red-600"
              title="Importierte Punktwolke entfernen"
              aria-label="Importierte Punktwolke entfernen"
              onClick={() => {
                removeFeature(def.id, {
                  collectionId: "pointcloud-imports",
                  layerId: "pointcloud",
                });
                setImportedCloudAssets((current) =>
                  current.filter((asset) => asset.id !== def.id)
                );
                setCloudSettings((current) => {
                  const next = { ...current };
                  delete next[def.id];
                  return next;
                });
              }}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
          <button
            type="button"
            className={`flex size-7 shrink-0 items-center justify-center ${
              flyToState.disabled
                ? "cursor-not-allowed text-gray-300"
                : "text-gray-500 hover:text-blue-600"
            }`}
            title={flyToState.title}
            aria-label={flyToState.ariaLabel}
            disabled={flyToState.disabled}
            onClick={() => {
              if (!state?.meta || flyToState.disabled) return;
              const [lng, lat] = state.meta.centerLngLat;
              const terrainElevation =
                terrainActive && map
                  ? map.queryTerrainElevation({ lng, lat }) ?? undefined
                  : undefined;
              map?.fitBounds(state.meta.boundsLngLat, {
                padding: 60,
                pitch: 50,
                elevation: terrainElevation,
              });
            }}
          >
            <Icon name="search-location" className="size-4 leading-none" />
          </button>
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center text-gray-500 hover:text-gray-900"
            title="Punktwolkenoptionen öffnen"
            aria-label="Punktwolkenoptionen öffnen"
            onClick={() => openCloudOptions(def.id)}
          >
            <FontAwesomeIcon icon={faSliders} className="size-4" />
          </button>
        </div>
      ),
      children: (
        <div className="pl-1">
          {state?.error && (
            <div className="text-xs text-red-600 pb-1">{state.error}</div>
          )}
          {!isTilesetDelivery && (
          <OptionRow label="Punktstil">
            <span className="min-w-[160px] flex-1 truncate text-sm text-gray-700">
              {(() => {
                const source = settings.colorization.layers[0].source;
                return source
                  ? formatColorizerSourceLabel(source)
                  : "nicht konfiguriert";
              })()}
            </span>
            <Button size="small" onClick={() => setColorizerCloudId(def.id)}>
              Bearbeiten
            </Button>
          </OptionRow>
          )}
          <OptionRow label="Punktgröße">
            {!isTilesetDelivery && (
              <Radio.Group
                size="small"
                optionType="button"
                value={settings.sizeMode}
                onChange={(event) =>
                  patchCloud(def.id, { sizeMode: event.target.value })
                }
                options={[
                  { value: POINT_SIZE_MODES.AUTO, label: "auto" },
                  { value: POINT_SIZE_MODES.PIXELS, label: "px" },
                  { value: POINT_SIZE_MODES.METERS, label: "m" },
                ]}
              />
            )}
            {isTilesetDelivery ? (
              <>
                <div className="flex-1 min-w-[70px] pt-1">
                  <Slider
                    min={1}
                    max={8}
                    step={0.5}
                    value={settings.pointSizePx}
                    onChange={(value) =>
                      patchCloud(def.id, { pointSizePx: value })
                    }
                  />
                </div>
                <span className="text-xs w-12 text-right">
                  {settings.pointSizePx.toFixed(1)} px
                </span>
              </>
            ) : settings.sizeMode === POINT_SIZE_MODES.AUTO ? (
              <>
                <div className="flex-1 min-w-[70px] pt-1">
                  <Slider
                    min={0.25}
                    max={4}
                    step={0.25}
                    value={settings.radiusScale}
                    onChange={(value) =>
                      patchCloud(def.id, { radiusScale: value })
                    }
                  />
                </div>
                <span className="text-xs w-12 text-right">
                  ×{settings.radiusScale.toFixed(2)}
                </span>
              </>
            ) : settings.sizeMode === POINT_SIZE_MODES.PIXELS ? (
              <>
                <div className="flex-1 min-w-[70px] pt-1">
                  <Slider
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={settings.pointSizePx}
                    onChange={(value) =>
                      patchCloud(def.id, { pointSizePx: value })
                    }
                  />
                </div>
                <span className="text-xs w-12 text-right">
                  {settings.pointSizePx.toFixed(1)} px
                </span>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-[70px] pt-1">
                  <Slider
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={settings.radiusMeters}
                    onChange={(value) =>
                      patchCloud(def.id, { radiusMeters: value })
                    }
                  />
                </div>
                <span className="text-xs w-12 text-right">
                  {settings.radiusMeters.toFixed(2)} m
                </span>
              </>
            )}
          </OptionRow>
          {!isTilesetDelivery && (
          <OptionRow label="Form">
            <Radio.Group
              size="small"
              optionType="button"
              value={settings.shape}
              onChange={(event) =>
                patchCloud(def.id, { shape: event.target.value })
              }
              options={[
                { value: POINT_SHAPES.SQUARE, label: "Quadrat" },
                { value: POINT_SHAPES.CIRCLE, label: "Kreis" },
                { value: POINT_SHAPES.DOME, label: "Kugel" },
                { value: POINT_SHAPES.SOFT_SPLAT, label: "Gradient" },
              ]}
            />
          </OptionRow>
          )}
          <div>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-1.5 py-1 text-left text-xs font-medium text-gray-600 hover:text-gray-900"
              title="Positions-, Quell- und Registrierungsdetails anzeigen"
              onClick={() => toggleCloudDetails(def.id)}
            >
              <FontAwesomeIcon icon={faCircleInfo} className="w-3" />
              <span className="flex-1">Registrierung · Position</span>
              <FontAwesomeIcon
                icon={cloudDetailsOpen[def.id] ? faChevronUp : faChevronDown}
                className="w-3"
              />
            </button>
            {cloudDetailsOpen[def.id] && (
              <div className="border-t border-gray-200 pb-2">
                {!isTilesetDelivery && (
                  <OptionRow label="Höhen-Datum">
                    <Select
                      size="small"
                      className="w-52"
                      value={settings.datum}
                      onChange={(value) => patchCloud(def.id, { datum: value })}
                      options={[...DATUM_OPTIONS]}
                    />
                  </OptionRow>
                )}
                {!isTilesetDelivery && (
                  <OptionRow label="Debug">
                    <Checkbox
                      checked={settings.nodeBoundsVisible}
                      onChange={(event) =>
                        patchCloud(def.id, {
                          nodeBoundsVisible: event.target.checked,
                        })
                      }
                    >
                      COPC-Knotenboxen
                    </Checkbox>
                  </OptionRow>
                )}
                <div className="pt-1 text-xs font-medium text-gray-600">
                  Positionskorrektur · ENU
                </div>
                <CloudOffsetRow
                  label="Ost"
                  value={settings.offsetEast}
                  onChange={(value) => patchCloud(def.id, { offsetEast: value })}
                />
                <CloudOffsetRow
                  label="Nord"
                  value={settings.offsetNorth}
                  onChange={(value) => patchCloud(def.id, { offsetNorth: value })}
                />
                <CloudOffsetRow
                  label="Oben"
                  value={settings.offsetUp}
                  onChange={(value) => patchCloud(def.id, { offsetUp: value })}
                />
                <div className="pt-1 text-xs font-medium text-gray-600">
                  Euler · ENU
                </div>
                <CloudAngleRow
                  label="Rot. Ost"
                  value={settings.rotationEastDegrees}
                  onChange={(value) =>
                    patchCloud(def.id, { rotationEastDegrees: value })
                  }
                />
                <CloudAngleRow
                  label="Rot. Nord"
                  value={settings.rotationNorthDegrees}
                  onChange={(value) =>
                    patchCloud(def.id, { rotationNorthDegrees: value })
                  }
                />
                <CloudAngleRow
                  label="Rot. Hoch"
                  value={settings.rotationUpDegrees}
                  onChange={(value) =>
                    patchCloud(def.id, { rotationUpDegrees: value })
                  }
                />
                {state?.meta && (
                  <>
                    <div className="pt-1 text-xs text-gray-500">
                      Quelle {def.sourceTag}
                      {def.acquiredOn
                        ? ` · Aufnahme ${formatPointCloudAcquisitionDate(
                            def.acquiredOn
                          )}`
                        : ""}
                    </div>
                    <div className="pt-1 text-xs text-gray-500">
                      Datei {formatCount(state.meta.totalFilePoints)} Punkte ·
                      Höhen {state.meta.zMin.toFixed(1)}–
                      {state.meta.zMax.toFixed(1)} m · Attribute: {" "}
                      {[
                        state.meta.hasRgb ? "RGB" : null,
                        state.meta.hasClassification ? "Klassifikation" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "keine"}
                    </div>
                    {settings.nodeBoundsVisible && state && (
                      <div className="pt-1 text-xs tabular-nums text-orange-700">
                        Knoten: {state.visibleNodes} im Sichtfeld · {state.renderedNodes} gerendert · {state.loadedNodes} geladen
                      </div>
                    )}
                    <CloudMountPose
                      def={def}
                      meta={state.meta}
                      settings={settings}
                      datumOffsetMeters={datumOffsetMeters}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ),
    };
  });

  const meshItems = MESH_ASSETS.map((def) => {
    const settings = meshSettings[def.id];
    return {
      key: def.id,
      label: (
        <div className="flex h-8 min-w-0 items-center gap-1 rounded px-1 hover:bg-gray-50">
          <button
            type="button"
            className={`flex size-7 shrink-0 items-center justify-center ${
              settings.enabled ? "text-gray-700" : "text-gray-400"
            }`}
            title={settings.enabled ? "Mesh ausblenden" : "Mesh anzeigen"}
            aria-label={settings.enabled ? "Mesh ausblenden" : "Mesh anzeigen"}
            onClick={() => patchMesh(def.id, { enabled: !settings.enabled })}
          >
            <FontAwesomeIcon icon={settings.enabled ? faEye : faEyeSlash} />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => openMeshOptions(def.id)}
            title="Meshoptionen öffnen"
          >
            <span className="truncate">{def.label}</span>
          </button>
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center text-xs text-gray-500 hover:text-gray-900"
            title="Meshoptionen öffnen"
            aria-label="Meshoptionen öffnen"
            onClick={() => openMeshOptions(def.id)}
          >
            <FontAwesomeIcon icon={faSliders} />
          </button>
        </div>
      ),
      children: (
        <div className="pl-1">
          <OptionRow label="Shader">
                      <OptionRow label="Clay-Farbe">
                        <input
                          aria-label="Clay-Farbe"
                          type="color"
                          value={settings.clayColor}
                          onChange={(event) =>
                            patchMesh(def.id, { clayColor: event.target.value })
                          }
                          className="h-7 w-12 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5"
                        />
                      </OptionRow>
            <Radio.Group
              size="small"
              optionType="button"
              value={settings.white ? "white" : "textured"}
              onChange={(event) =>
                patchMesh(def.id, { white: event.target.value === "white" })
              }
              options={[
                { value: "textured", label: "Textur" },
                { value: "white", label: "Clay" },
              ]}
            />
          </OptionRow>
          <OptionRow label="Deckkraft">
            <div className="min-w-[100px] flex-1 pt-1">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={settings.opacity}
                onChange={(value) => patchMesh(def.id, { opacity: value })}
              />
            </div>
            <span className="w-12 text-right text-xs tabular-nums">
              {Math.round(settings.opacity * 100)}%
            </span>
          </OptionRow>
          <OptionRow label="z-Offset">
            <div className="flex-1 min-w-[70px] pt-1">
              <Slider
                min={-60}
                max={60}
                step={0.5}
                value={settings.zOffset}
                onChange={(value) => patchMesh(def.id, { zOffset: value })}
              />
            </div>
            <span className="text-xs w-14 text-right">
              {settings.zOffset > 0 ? "+" : ""}
              {settings.zOffset} m
            </span>
          </OptionRow>
          <OptionRow label="Screen-Space-Fehler">
            <div className="flex-1 min-w-[70px] pt-1">
              <Slider
                min={TILES_ERROR_TARGET_MIN_PIXELS}
                max={TILES_ERROR_TARGET_MAX_PIXELS}
                step={0.1}
                value={settings.errorTarget}
                tooltip={{
                  formatter: (value) =>
                    value === undefined ? null : `${value.toFixed(1)} px`,
                }}
                onChange={(value) =>
                  patchMesh(def.id, {
                    errorTarget: value,
                  })
                }
              />
            </div>
            <span
              className="text-xs w-14 text-right tabular-nums"
              title="Kleinerer Wert = mehr Detail"
            >
              {settings.errorTarget.toFixed(1)} px
            </span>
          </OptionRow>
          <OptionRow label="Debug">
            <Checkbox
              checked={settings.wireframe}
              onChange={(event) =>
                patchMesh(def.id, { wireframe: event.target.checked })
              }
            >
              Wireframe
            </Checkbox>
            <Checkbox
              checked={settings.tileBoundsVisible}
              onChange={(event) =>
                patchMesh(def.id, {
                  tileBoundsVisible: event.target.checked,
                })
              }
            >
              Tile-Boxen
            </Checkbox>
          </OptionRow>
        </div>
      ),
    };
  });
  return (
    <div
      className="relative w-full h-full"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handlePointCloudDrop}
    >
      <CarmaMap
        appKey={APP_KEY}
        mapEngine="maplibre"
        exposeMapToWindow={showScenePanel}
        fullScreenControl={showMapControls}
        gazetteerSearchControl={showMapControls}
        locatorControl={showMapControls}
        terrainControl={showMapControls}
        zoomControls={showMapControls}
        maxPitch={180}
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        libreLayers={libreLayers}
        threeRuntimeParams={BUILDINGS_RUNTIME_PARAMS}
      />
      <SceneManager
        cloudAssets={cloudAssets}
        cloudSettings={cloudSettings}
        meshSettings={meshSettings}
        pointMemoryBudget={pointMemoryBudget}
        targetFrameRate={targetFrameRate}
        basemapMode={basemap.mode}
        demId={demId}
        buildingsEnabled={buildingsEnabled}
        imageryPano={imageryPano}
        imageryOblique={imageryOblique}
        onImageryStatus={setImageryStatus}
        onCloudState={handleCloudState}
        onPointMemoryUsage={setPointMemoryUsedBytes}
        onTerrainChange={handleTerrainChange}
        onApi={setSceneApi}
      />
      {showScenePanel && (
        <div className="absolute top-0 left-0 w-full pt-3 pointer-events-none z-10">
          <div className="flex items-center justify-center w-full">
            <div
              className={`pointer-events-auto min-w-[280px] w-fit max-w-[calc(100vw-24px)] max-h-[80vh] overflow-y-auto bg-white rounded-[10px] ${CARD_SHADOW} flex flex-col gap-1 py-2 transition-all duration-300`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handlePointCloudDrop}
            >
              <div className="flex items-center w-full h-8 shrink-0 gap-3 px-6">
                <label className="mb-0 text-base truncate">Szene</label>
                <button
                  type="button"
                  className={`flex size-7 items-center justify-center rounded transition-colors ${
                    basemap.mode === "off"
                      ? "bg-gray-200 text-gray-500"
                      : basemap.mode === "luftbild"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                  aria-label={
                    basemap.mode === "stadtplan"
                      ? "Luftbildkarte anzeigen"
                      : basemap.mode === "luftbild"
                      ? "Basemap ausblenden"
                      : "Stadtplan anzeigen"
                  }
                  title={
                    basemap.mode === "stadtplan"
                      ? "Luftbildkarte anzeigen"
                      : basemap.mode === "luftbild"
                      ? "Basemap ausblenden"
                      : "Stadtplan anzeigen"
                  }
                  onClick={basemap.cycle}
                >
                  <FontAwesomeIcon icon={faMap} />
                </button>
                <span
                  className="ml-auto text-sm whitespace-nowrap text-gray-600"
                  title={`Geschätzter Szenen-Speicher: Punktwolken ${formatMebibytes(
                    pointMemoryUsedBytes
                  )} / ${formatMebibytes(
                    sceneMemoryAllocation.pointBytes
                  )} · Mesh-Reserve ${formatMebibytes(
                    sceneMemoryAllocation.meshBytesPerLayer
                  )} je aktivem Mesh · gesamt ${formatMebibytes(
                    pointMemoryBudget.bytes
                  )} aus ${formatPointMemoryBudgetSource(
                    pointMemoryBudget.source
                  )}`}
                >
                  {anyLoading ? "Lädt… " : ""}
                  Speicher {pointMemoryPercent} %
                </span>
                <button
                  className="text-base flex items-center justify-center hover:text-neutral-600"
                  onClick={() => setExpanded(!expanded)}
                  title={expanded ? "Optionen einklappen" : "Optionen anzeigen"}
                >
                  <FontAwesomeIcon
                    icon={expanded ? faChevronUp : faChevronDown}
                  />
                </button>
              </div>
              {expanded && (
                <div className="px-4">
                  <Tabs
                    size="small"
                    defaultActiveKey="pointclouds"
                    tabBarStyle={{ borderBottom: "none", marginBottom: 0 }}
                    items={[
                        {
                          key: "pointclouds",
                          label: `Punktwolken (${
                            cloudAssets.filter(
                              (def) => cloudSettings[def.id]?.enabled
                            ).length
                          }/${cloudAssets.length})`,
                          children: (
                            <div className="flex min-w-[360px] flex-col pb-1">
                              {cloudItems.map((item) => (
                                <div key={item.key}>{item.label}</div>
                              ))}
                            </div>
                          ),
                        },
                        {
                          key: "meshes",
                          label: `3D-Meshes (${
                            MESH_ASSETS.filter(
                              (def) => meshSettings[def.id]?.enabled
                            ).length
                          }/${MESH_ASSETS.length})`,
                          children: (
                            <div className="flex min-w-[360px] flex-col">
                              {meshItems.map((item) => (
                                <div key={item.key}>{item.label}</div>
                              ))}
                              <div className="border-t border-gray-200 px-2 pt-1 pb-2">
                                <OptionRow label="Gebäude (LOD)">
                                  <Switch
                                    size="small"
                                    checked={buildingsEnabled}
                                    onChange={setBuildingsEnabled}
                                  />
                                  <span className="text-xs text-gray-500">
                                    ALKIS-Extrusion via Gelände
                                  </span>
                                </OptionRow>
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: "scene",
                          label: "Szene",
                          children: (
                            <div className="flex flex-col gap-1 px-2 pb-2">
                              <OptionRow label="Pitch-Limit">
                                <Switch
                                  size="small"
                                  checked={pitchLimiterEnabled}
                                  onChange={setPitchLimiterEnabled}
                                />
                                <span className="text-xs text-gray-500">
                                  {pitchLimiterEnabled ? "60°" : "frei"}
                                </span>
                              </OptionRow>
                              <OptionRow label="Ziel-Bildrate">
                                <div className="min-w-[120px] flex-1 pt-1">
                                  <Slider
                                    min={15}
                                    max={60}
                                    step={5}
                                    value={targetFrameRate}
                                    onChange={setTargetFrameRate}
                                    tooltip={{
                                      formatter: (value) => `${value ?? 0} FPS`,
                                    }}
                                  />
                                </div>
                                <span className="w-14 text-right text-xs tabular-nums">
                                  {targetFrameRate} FPS
                                </span>
                              </OptionRow>
                              <OptionRow label="Hintergrund">
                                <div className="flex items-center gap-1">
                                  {(
                                    [
                                      ["white", "Weiß"],
                                      ["black", "Schwarz"],
                                      ["gray50", "50 % Grau"],
                                    ] as const
                                  ).map(([preset, label]) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      aria-label={label}
                                      title={label}
                                      className={`size-6 rounded border-2 ${
                                        sceneBackground === preset
                                          ? "border-blue-600"
                                          : "border-gray-300"
                                      }`}
                                      style={{
                                        backgroundColor:
                                          SCENE_BACKGROUND_COLORS[preset],
                                      }}
                                      onClick={() => {
                                        setSceneBackground(preset);
                                        setSceneBackgroundColor(
                                          SCENE_BACKGROUND_COLORS[preset]
                                        );
                                      }}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    aria-label="Benutzerdefinierte Hintergrundfarbe"
                                    title="Benutzerdefinierte Hintergrundfarbe"
                                    value={sceneBackgroundColor}
                                    onChange={(event) => {
                                      setSceneBackground("gray50");
                                      setSceneBackgroundColor(event.target.value);
                                    }}
                                    className="size-7 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5"
                                  />
                                </div>
                              </OptionRow>
                              <OptionRow label="JSON-Export">
                                <Button size="small" onClick={exportMicroCorrections}>
                                  JSON exportieren
                                </Button>
                              </OptionRow>
                              <OptionRow label="Gelände-DEM">
                                <Select
                                  size="small"
                                  className="w-52"
                                  value={demId}
                                  disabled={!terrainActive}
                                  onChange={setDemId}
                                  options={DEMS.map((dem) => ({
                                    value: dem.id,
                                    label: dem.label,
                                  }))}
                                />
                                {!terrainActive && (
                                  <span className="text-xs text-gray-500">
                                    Gelände über den Berg-Button links
                                  </span>
                                )}
                              </OptionRow>
                            </div>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {showScenePanel &&
        cloudOptionsIds.map((cloudId, index) => {
          const options = cloudItems.find((item) => item.key === cloudId);
          const def = cloudAssets.find(
            (candidate) => candidate.id === cloudId
          );
          if (!options || !def) return null;
          const settings = cloudSettings[cloudId];
          const state = cloudStates[cloudId];
          return (
            <FloatingPanel
              key={cloudId}
              title={`Punktwolke — ${def.label}`}
              headerStart={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`flex size-6 shrink-0 items-center justify-center ${
                      settings.enabled ? "text-gray-700" : "text-gray-400"
                    }`}
                    title={
                      settings.enabled
                        ? "Punktwolke ausblenden"
                        : "Punktwolke anzeigen"
                    }
                    aria-label={
                      settings.enabled
                        ? "Punktwolke ausblenden"
                        : "Punktwolke anzeigen"
                    }
                    onClick={() =>
                      patchCloud(cloudId, { enabled: !settings.enabled })
                    }
                  >
                    <FontAwesomeIcon
                      icon={settings.enabled ? faEye : faEyeSlash}
                    />
                  </button>
                  {(() => {
                    const flyToState = getCloudFlyToButtonState(
                      Boolean(settings.enabled),
                      Boolean(state?.meta),
                      Boolean(state?.loading)
                    );
                    return (
                      <button
                        type="button"
                        className={`flex size-6 shrink-0 items-center justify-center ${
                          flyToState.disabled
                            ? "cursor-not-allowed text-gray-300"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                        title={flyToState.title}
                        aria-label={flyToState.ariaLabel}
                        disabled={flyToState.disabled}
                        onClick={() => {
                          if (!state?.meta || flyToState.disabled) return;
                          const [lng, lat] = state.meta.centerLngLat;
                          const terrainElevation =
                            terrainActive && map
                              ? map.queryTerrainElevation({ lng, lat }) ?? undefined
                              : undefined;
                          map?.fitBounds(state.meta.boundsLngLat, {
                            padding: 60,
                            pitch: 50,
                            elevation: terrainElevation,
                          });
                        }}
                      >
                        <Icon name="search-location" className="size-4 leading-none" />
                      </button>
                    );
                  })()}
                </div>
              }
              headerActions={
                <button
                  type="button"
                  className="flex size-6 shrink-0 items-center justify-center text-gray-600 hover:text-gray-900"
                  title="Punktwolkenoptionen zurücksetzen"
                  aria-label="Punktwolkenoptionen zurücksetzen"
                  onClick={() => resetCloud(cloudId)}
                >
                  <FontAwesomeIcon icon={faRotateLeft} className="size-3" />
                </button>
              }
              initial={getSecondaryPanelPosition(index)}
              zIndex={30 + index}
              onClose={() => {
                if (colorizerCloudId === cloudId) {
                  setColorizerCloudId(null);
                }
                setCloudOptionsIds((previous) =>
                  previous.filter((id) => id !== cloudId)
                );
              }}
            >
              {options.children}
            </FloatingPanel>
          );
        })}

      {showScenePanel &&
        meshOptionsIds.map((meshId, index) => {
          const options = meshItems.find((item) => item.key === meshId);
          const def = MESH_ASSETS.find((candidate) => candidate.id === meshId);
          if (!options || !def) return null;
          const settings = meshSettings[meshId];
          return (
            <FloatingPanel
              key={meshId}
              title={`3D-Mesh — ${def.label}`}
              headerStart={
                <button
                  type="button"
                  className={`flex size-6 shrink-0 items-center justify-center ${
                    settings.enabled ? "text-gray-700" : "text-gray-400"
                  }`}
                  title={settings.enabled ? "Mesh ausblenden" : "Mesh anzeigen"}
                  aria-label={
                    settings.enabled ? "Mesh ausblenden" : "Mesh anzeigen"
                  }
                  onClick={() =>
                    patchMesh(meshId, { enabled: !settings.enabled })
                  }
                >
                  <FontAwesomeIcon
                    icon={settings.enabled ? faEye : faEyeSlash}
                  />
                </button>
              }
              headerActions={
                <button
                  type="button"
                  className="flex size-6 shrink-0 items-center justify-center text-gray-600 hover:text-gray-900"
                  title="Meshoptionen zurücksetzen"
                  aria-label="Meshoptionen zurücksetzen"
                  onClick={() => resetMesh(meshId)}
                >
                  <FontAwesomeIcon icon={faRotateLeft} />
                </button>
              }
              initial={getSecondaryPanelPosition(cloudOptionsIds.length + index)}
              zIndex={30 + cloudOptionsIds.length + index}
              onClose={() =>
                setMeshOptionsIds((previous) =>
                  previous.filter((id) => id !== meshId)
                )
              }
            >
              {options.children}
            </FloatingPanel>
          );
        })}

      {showScenePanel &&
        colorizerCloudId &&
        cloudSettings[colorizerCloudId] && (
          <FloatingPanel
            title={`Colorizer — ${
              cloudAssets.find((def) => def.id === colorizerCloudId)?.label ??
              colorizerCloudId
            }`}
            initial={getSecondaryPanelPosition(
              cloudOptionsIds.length + meshOptionsIds.length
            )}
            zIndex={40}
            onClose={() => setColorizerCloudId(null)}
          >
            <PointColorizer
              fields={cloudStates[colorizerCloudId]?.fields ?? []}
              lazyFieldNames={[TERRAIN_RELATIVE_HEIGHT_FIELD]}
              hasRgb={cloudStates[colorizerCloudId]?.meta?.hasRgb ?? false}
              value={cloudSettings[colorizerCloudId].colorization}
              classificationLabels={
                CLOUD_CLASSIFICATION_LABELS[colorizerCloudId]
              }
              onChange={(colorization) =>
                patchCloud(colorizerCloudId, { colorization })
              }
              onDeriveField={
                sceneApi
                  ? (name, expression) =>
                      sceneApi.deriveField(colorizerCloudId, name, expression)
                  : undefined
              }
              storageKey="carma-pointcloud-color-presets"
            />
          </FloatingPanel>
        )}
    </div>
  );
}
