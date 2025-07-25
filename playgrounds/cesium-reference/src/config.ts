import { ConstantProperty, SceneMode, Viewer } from "cesium";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

const WUPP_MESH_2024_BASE = "https://wupp-3d-data.cismet.de/mesh2024";

const OBLIQUE_BASE = `${WUPP_MESH_2024_BASE}/oblique`;

export const POSITIONS_GEOJSON_URI = `${OBLIQUE_BASE}/waypoints.geojson`; // `${ _BASE_PATH}data/waypoints.geojson`;
export const FOOTPRINTS_SAMPLE_URI = `${OBLIQUE_BASE}/footprints_sample.geojson`;
export const PREVIEW_PATH = `${OBLIQUE_BASE}/preview`;

export enum PreviewLevel {
  ORIGINAL = "0",
  L1 = "1",
  L2 = "2",
  L3 = "3",
}

export enum PreviewLevelHQ {
  L1 = "1-hq",
  L2 = "2-hq",
  L3 = "3-hq",
}

export enum PreviewLevelAVIF10Bit {
  //L1 = "1-hq-avif-10bit",
  L2 = "2-hq-avif-10bit",
  L3 = "3-hq-avif-10bit",
}

export const DEFAULT_PREVIEW_LEVEL = PreviewLevelHQ.L2;

const baseOptions: Viewer.ConstructorOptions = {
  msaaSamples: 4,
  requestRenderMode: true,
  scene3DOnly: true,
  sceneMode: SceneMode.SCENE3D,
  selectionIndicator: false,
  targetFrameRate: 60,
  useBrowserRecommendedResolution: false,
  contextOptions: {
    webgl: {
      //alpha: true,
      powerPreference: "high-performance" as WebGLPowerPreference,
    },
  },

  // Hide UI components
  animation: false,
  timeline: false,
  baseLayer: false, // This is correct - false is allowed
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
  sceneModePicker: false,
  creditContainer: document.createElement("div"),
};

export const cesiumConstructorOptions = {
  ...baseOptions,
};

export const NORMAL_PIXEL_SIZE = new ConstantProperty(5);
export const SELECTED_PIXEL_SIZE = new ConstantProperty(20);
