import { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "@carma-mapping/cesium-engine";
import { ConstantProperty } from "cesium";

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

export const cesiumConstructorOptions = {
  ...DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  creditContainer: document.createElement("div"),
};

export const NORMAL_PIXEL_SIZE = new ConstantProperty(5);
export const SELECTED_PIXEL_SIZE = new ConstantProperty(20);
