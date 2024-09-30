import { CesiumConfig } from "types/cesium-config";
import { LeafletConfig } from "types/leaflet-config";

export const APP_BASE_PATH = import.meta.env.BASE_URL;

const CESIUM_PATHNAME = "__cesium__";

export const CESIUM_CONFIG: CesiumConfig = {
  transitions: {
    mapMode: {
      duration: 100,
    },
  },
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  pathName: CESIUM_PATHNAME,
};

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 0.5,
  zoomDelta: 0.5,
};
