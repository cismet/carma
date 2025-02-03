import { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "@carma-mapping/cesium-engine";
import { ConstantProperty } from "cesium";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

export const POSITIONS_GEOJSON_URI = `${APP_BASE_PATH}data/Aufnahmeorte.2024.wgs84.geojson`;
export const FOOTPRINTS_SAMPLE_URI = `${APP_BASE_PATH}data/footprints_sample_all.geojson`;

export const cesiumConstructorOptions = {
  ...DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  creditContainer: document.createElement("div"),
};

export const NORMAL_PIXEL_SIZE = new ConstantProperty(5);
export const SELECTED_PIXEL_SIZE = new ConstantProperty(20);