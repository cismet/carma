import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import type { CesiumConfig } from "@carma-mapping/engines/cesium/legacy";
import type { CesiumModelConfig } from "@carma-mapping/engines/cesium/core";
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
const MODEL_SHADER_CONFIG_DEFAULTS = {
  hover: {
    clearDelayMs: 40,
    enabled: false,
    fade: {
      durationMs: 220,
    },
  },
  outline: {
    color: "#000000",
    opacity: 0.5,
    widthPx: 2,
  },
  sampling: {
    enabled: false,
    fade: {
      durationMs: 180,
    },
    opacity: 0.8,
  },
  flash: {
    selection: {
      color: "#ffffff",
      inDurationMs: 50,
      opacity: 1,
      outDurationMs: 800,
    },
    highlight: {
      color: "#6666ff",
      inDurationMs: 50,
      opacity: 1,
      outDurationMs: 800,
    },
  },
} as const;

export type GeoportalAnnotationInfoBoxConfig = Pick<
  AnnotationInfoBoxLayoutProps,
  "controlOrder" | "fitContentWidth" | "pixelWidth"
>;

export type GeoportalCesiumAnnotationConfig = {
  measurementLineStyle: MeasurementLineStyleOptions;
  areaOcclusionStyle: AreaOcclusionStyleOptions;
  infoBox: GeoportalAnnotationInfoBoxConfig;
  tools: {
    defaultToolId: AnnotationToolId;
    stableToolIds: readonly AnnotationToolId[];
  };
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
  model: {
    hover: MODEL_SHADER_CONFIG_DEFAULTS.hover,
    highlight: {
      style: {
        type: "silhouette",
        fill: {
          color: "#6666ff",
        },
        outline: MODEL_SHADER_CONFIG_DEFAULTS.outline,
      },
    },
    sampling: MODEL_SHADER_CONFIG_DEFAULTS.sampling,
    selection: {
      style: {
        type: "silhouette",
        fill: {
          color: "#ffff00",
        },
        outline: MODEL_SHADER_CONFIG_DEFAULTS.outline,
      },
      flash: MODEL_SHADER_CONFIG_DEFAULTS.flash,
    },
  } satisfies CesiumModelConfig,
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
    pixelWidth: 350,
    fitContentWidth: false,
    controlOrder: 12,
  },
  tools: {
    defaultToolId: "distance",
    stableToolIds: ["select", "point", "distance"],
  },
} satisfies GeoportalCesiumAnnotationConfig;

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

export type FeatureInfoRectangleConfig = {
  upperleftX: number;
  upperleftY: number;
  pixelsize: number;
};

// Raster grid for the implicit-feature-info rectangle on the 2D Leaflet map.
// Values are taken from the Wuppertal rain hazard map depth raster (gdalinfo on
// the depth3857.tif: upper-left corner and pixel size in EPSG:3857).
export const FEATURE_INFO_RECTANGLE_CONFIG: FeatureInfoRectangleConfig = {
  upperleftX: 780160.203,
  upperleftY: 6678245.042,
  pixelsize: 1.595781324768881,
};

// URL hash parameter keys for viewer state
export const URL_PARAM_KEYS = {
  mapStyle: "m",
  measurements: "mm",
} as const;
