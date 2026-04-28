import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import type { CesiumConfig } from "@carma-mapping/engines/cesium/legacy";
import type { LeafletConfig } from "@carma-mapping/engines/leaflet";
import type {
  AreaOcclusionStyleOptions,
  AnnotationToolId,
  MeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationInfoBoxLayoutProps } from "@carma-mapping/annotations/ui";
import { Rectangle } from "cesium";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";

export const MIN_MOBILE_WIDTH = 600;
export const DEFAULT_CAMERA_FOV_DEG = 60;

const CESIUM_PATHNAME = "__cesium__";
const METROPOLE_RUHR_GRAUBLAU_RECTANGLE = Rectangle.fromDegrees(4, 48, 10, 52);

export type GeoportalCesiumAnnotationInfoBoxConfig = Pick<
  AnnotationInfoBoxLayoutProps,
  "controlOrder" | "fitContentWidth" | "pixelWidth"
>;

export type GeoportalCesiumAnnotationLabelTextModalConfig = {
  title: string;
  okText: string;
  cancelText: string;
  inputAriaLabel: string;
  inputPlaceholder: string;
  suggestionButtonSize: "small" | "middle" | "large";
};

export type GeoportalCesiumAnnotationConfig = {
  measurementLineStyle: MeasurementLineStyleOptions;
  areaOcclusionStyle: AreaOcclusionStyleOptions;
  infoBox: GeoportalCesiumAnnotationInfoBoxConfig;
  tools: {
    stableToolIds: readonly AnnotationToolId[];
  };
  labelTextModal: GeoportalCesiumAnnotationLabelTextModalConfig;
};

export const CESIUM_CONFIG: CesiumConfig = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {},
  markerKey: "MarkerGlowLine",
  markerAnchorHeight: 10,
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  pathName: CESIUM_PATHNAME,
  providerConfig: {
    terrainProvider: WUPP_TERRAIN_PROVIDER,
    surfaceProvider: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
    imageryProvider: {
      ...BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
      rectangle: METROPOLE_RUHR_GRAUBLAU_RECTANGLE,
    },
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
    secondary: WUPP_LOD2_TILESET,
  },
};

export const CESIUM_ANNOTATION_CONFIG = {
  measurementLineStyle: {
    strokeWidthPx: 1.5,
    overlayDashPattern: "8 8",
  },
  areaOcclusionStyle: {
    fill: {
      overlay: true,
      overlayAlphaMultiplier: 0.5,
    },
    line: {
      overlayDashed: true,
    },
  },
  infoBox: {
    pixelWidth: 430,
    fitContentWidth: false,
    controlOrder: 12,
  },
  tools: {
    stableToolIds: ["select", "point", "distance"],
  },
  labelTextModal: {
    title: "Beschriftung hinzufügen",
    okText: "Hinzufügen",
    cancelText: "Abbrechen",
    inputAriaLabel: "Text der Beschriftung",
    inputPlaceholder: "Text der Beschriftung",
    suggestionButtonSize: "small",
  },
} satisfies GeoportalCesiumAnnotationConfig;

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

// URL hash parameter keys for viewer state
export const URL_PARAM_KEYS = {
  mapStyle: "m",
  measurements3d: "mm",
} as const;
