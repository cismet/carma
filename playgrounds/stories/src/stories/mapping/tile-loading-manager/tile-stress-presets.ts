import wupperBankRaw from "./data/wupper-barmen-north-bank.geojson?raw";
import wupperWaterRaw from "./data/wupper-barmen-water-surface.geojson?raw";
import { WUPPERTAL_HKW_CHIMNEY } from "@carma-commons/resources";

export type StressPresetEvidence = "measured" | "reference" | "approximate";

export type StressVerticalWindow = {
  minElevation: number;
  maxElevation: number;
  evidence: StressPresetEvidence;
  note: string;
};

/** Scenario data only; camera and loading behavior live in the engine library. */
export const TILE_STRESS_PRESETS = {
  "Wupper north bank / Barmen": {
    center: [7.1979, 51.2696] as [number, number],
    elevation: 165,
    elevationEvidence: "approximate" as const,
    elevationNote:
      "145–185 m display window for river, Schwebebahn supports and bridges; estimated, not surveyed. The bank source is 2D.",
    verticalWindow: {
      minElevation: 145,
      maxElevation: 185,
      evidence: "approximate",
      note: "River-to-rail envelope, excluding the upper floors of riverbank blocks.",
    } satisfies StressVerticalWindow,
    zoom: 16,
  },
  Toelleturm: {
    center: [7.20158, 51.25656] as [number, number],
    elevation: 361.3477,
    elevationEvidence: "reference" as const,
    elevationNote:
      "Virtual eye 3 m above the preserved 358.3477 m reference point, clearing the mesh parapet; not a surveyed camera pose.",
    zoom: 15,
  },
  "Rathaus Barmen": {
    center: [7.19995, 51.27214] as [number, number],
    elevation: 154.88,
    elevationEvidence: "approximate" as const,
    elevationNote:
      "Local DGM sample near the Rathaus; the facade envelope is not surveyed.",
    verticalWindow: {
      minElevation: 154,
      maxElevation: 225,
      evidence: "approximate",
      note: "Ground-to-tower window estimated for visual framing, not a survey.",
    } satisfies StressVerticalWindow,
    zoom: 17,
  },
  // Foot/top measurements: data/sample-measurements.geojson, points 7/6.
  "HKW chimney": {
    center: [
      WUPPERTAL_HKW_CHIMNEY.longitude,
      WUPPERTAL_HKW_CHIMNEY.latitude,
    ] as [number, number],
    elevation: WUPPERTAL_HKW_CHIMNEY.footHeight,
    elevationEvidence: "measured" as const,
    elevationNote: "Measured chimney wall foot (fixture point 7).",
    verticalWindow: {
      minElevation: WUPPERTAL_HKW_CHIMNEY.footHeight,
      maxElevation: WUPPERTAL_HKW_CHIMNEY.topHeight,
      evidence: "measured",
      note: "Fixture points 7 (wall foot) and 6 (chimney top centre).",
    } satisfies StressVerticalWindow,
    zoom: 15.5,
  },
  "HKW chimney-top virtual eye": {
    center: [7.1187535929060015, 51.2484226583406] as [number, number],
    elevation: 339.7485597810839,
    elevationEvidence: "reference" as const,
    elevationNote:
      "Synthetic eye 1.7 m above measured fixture point 6; not an accessible platform.",
    verticalWindow: {
      minElevation: 139.81504433381122,
      maxElevation: 338.0485597810839,
      evidence: "measured",
      note: "Measured chimney wall-foot to top-centre landmark window.",
    } satisfies StressVerticalWindow,
    zoom: 16,
  },
  "Rathaus roof virtual eye": {
    center: [7.19995, 51.27214] as [number, number],
    elevation: 190,
    elevationEvidence: "approximate" as const,
    elevationNote:
      "Approximate virtual roof eye for visual inspection; not a surveyed or access-certified position.",
    verticalWindow: {
      minElevation: 154,
      maxElevation: 225,
      evidence: "approximate",
      note: "Ground-to-tower window estimated for visual framing, not a survey.",
    } satisfies StressVerticalWindow,
    zoom: 17,
  },
} as const;

/**
 * Convex hull of ALKIS main Rathaus feature DENW29AL1000AzKQ,
 * Johannes-Rau-Platz 1–3, in cesium/public/data/geojson/buildings.json.
 * It spans recesses/courtyards; not the complete cadastral building footprint.
 */
export const RATHAUS_PERIMETER = [
  [7.19901439, 51.27233618],
  [7.1991793, 51.27205369],
  [7.19931605, 51.27184526],
  [7.19938618, 51.2717384],
  [7.1996697, 51.27168625],
  [7.20064624, 51.27189755],
  [7.200688, 51.27190802],
  [7.20079221, 51.27193415],
  [7.20089031, 51.27215118],
  [7.20087555, 51.27217917],
  [7.2006694, 51.27229262],
  [7.19965511, 51.27259582],
  [7.19962166, 51.27258707],
];

/** Replaces the rail-centreline fixture; derivation lives beside the source. */
export const WUPPER_BARMEN_NORTH_BANK = (
  JSON.parse(wupperBankRaw) as { geometry: { coordinates: number[][] } }
).geometry.coordinates;

/** Both banks including under-bridge water, from the same basemap.de snapshot. */
export const WUPPER_BARMEN_WATER_BOUNDARY = (
  JSON.parse(wupperWaterRaw) as { geometry: { coordinates: number[][][] } }
).geometry.coordinates[0];

export const TILE_STRESS_DEFAULT_ARGS = {
  scenario: "panorama" as const,
  source: "mesh" as const,
  preset: "Toelleturm" as const,
  cameraCount: 12,
  mode: "panorama" as const,
  path: "perimeter" as const,
  closed: true,
  customSpine: [] as number[][],
  side: 1 as const,
  elevation: 0,
  radius: 80,
  viewHeight: 40,
  cameraOffset: 20,
  referenceSurfaceOffset: 0,
  clipBeforeSurface: 2,
  clipping: false,
  showImagePlanes: true,
  far: 2500,
  pixelError: 8,
  segmentPixels: 256,
  previewUpdatesPerSecond: 10,
  panoramaVerticalFovDegrees: 60,
  panoramaPitchDegrees: -8,
  fitVertical: true,
  spineMergeAngleDegrees: 0,
  verticalPadding: 5,
  animate: true,
  lightCount: 12,
  lightIntensity: 40000,
  lightRange: 500,
  shadowMapSize: 512,
  shadowLightLimit: 4,
  shadowUpdatesPerSecond: 5,
  lightMinHeight: 20,
  lightMaxHeight: 198,
  orbitSeconds: 40,
  mastHeight: 8,
  normalBias: 0.15,
  showLightViews: false,
  viewLightIndex: 0,
};

export const PUBLIC_BELIS_LIGHT_STYLE =
  "https://tiles.cismet.de/leuchten/style.json";
export const REFERENCE_MESH_2024 =
  "https://wupp-3d-datax.cismet.de/mesh2024/tileset.json";
