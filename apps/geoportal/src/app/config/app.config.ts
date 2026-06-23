import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import type { CesiumConfig } from "@carma-mapping/engines/cesium/react/runtime";
import type { CesiumModelConfig } from "@carma-mapping/engines/cesium/core";
import type { LeafletConfig } from "@carma-mapping/engines/leaflet";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  type AreaOcclusionStyleOptions,
  type AnnotationLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import {
  DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS,
  type AnnotationInfoBoxLayoutProps,
} from "@carma-mapping/annotations/ui";
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
export const CESIUM_TILESET_IDS = {
  MESH_2024: "wupp-mesh-2024",
  LOD2: "wupp-lod2",
} as const;
export const CESIUM_TERRAIN_PROVIDER_IDS = {
  TERRAIN_2020: "terrain-2020",
  DSM_MESH_2024_1M: "dsm-mesh-2024-1m",
} as const;
export const CESIUM_IMAGERY_LAYER_IDS = {
  BASEMAP_GRAUBLAU: "basemap-graublau",
} as const;
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
  style: {
    lines: AnnotationLineStyleOptions;
    areaOcclusion: AreaOcclusionStyleOptions;
  };
  infoBox: GeoportalAnnotationInfoBoxConfig;
  tools: {
    defaultToolId: AnnotationToolId;
    allToolIds: readonly AnnotationToolId[];
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
    terrainProviders: {
      [CESIUM_TERRAIN_PROVIDER_IDS.TERRAIN_2020]: WUPP_TERRAIN_PROVIDER,
      [CESIUM_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M]:
        WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
    },
    imageryProviders: {
      [CESIUM_IMAGERY_LAYER_IDS.BASEMAP_GRAUBLAU]: {
        ...BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
        rectangle: METROPOLE_RUHR_GRAUBLAU_RECTANGLE,
      },
    },
  },
  tilesetConfigs: {
    [CESIUM_TILESET_IDS.MESH_2024]: WUPP_MESH_2024,
    [CESIUM_TILESET_IDS.LOD2]: WUPP_LOD2_TILESET,
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
  style: {
    lines: {
      strokeWidthPx: 1.5,
      overlayDashPattern: "8 8",
    },
    areaOcclusion: {
      fill: {
        overlay: true,
        overlayAlphaMultiplier: 0.5,
      },
      line: {
        overlayDashed: true,
      },
    },
  },
  infoBox: {
    pixelWidth: 350,
    fitContentWidth: false,
    controlOrder: 12,
  },
  tools: {
    defaultToolId: ANNOTATION_TYPES.DISTANCE,
    allToolIds: DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS,
    stableToolIds: [
      ANNOTATION_SELECT_TOOL_ID,
      ANNOTATION_TYPES.POINT,
      ANNOTATION_TYPES.DISTANCE,
    ],
  },
} satisfies GeoportalCesiumAnnotationConfig;

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

// URL hash parameter keys for runtime state
export const URL_PARAM_KEYS = {
  mapStyle: "m",
  measurements: "mm",
} as const;
