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
const MODEL_SELECTION_OUTLINE_STYLE = {
  color: "#000000",
  opacity: 0.5,
  widthPx: 2,
} as const;

export type GeoportalAnnotationInfoBoxConfig = Pick<
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
  infoBox: GeoportalAnnotationInfoBoxConfig;
  tools: {
    defaultToolId: AnnotationToolId;
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
  model: {
    hover: {
      enabled: false,
      fadeDurationMs: 220,
      clearDelayMs: 40,
    },
    highlight: {
      style: {
        type: "silhouette",
        fill: {
          color: "#6666ff",
        },
        outline: MODEL_SELECTION_OUTLINE_STYLE,
      },
    },
    selection: {
      style: {
        type: "silhouette",
        fill: {
          color: "#ffff00",
        },
        outline: MODEL_SELECTION_OUTLINE_STYLE,
      },
      flash: {
        color: "#ffffff",
        opacity: 1,
        durationMs: 50,
      },
    },
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
    pixelWidth: 350,
    fitContentWidth: false,
    controlOrder: 12,
  },
  tools: {
    defaultToolId: "distance",
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
  measurements: "mm",
} as const;
