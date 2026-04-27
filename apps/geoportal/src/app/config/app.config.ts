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

export type GeoportalCesiumAnnotationToolbarClassNames = {
  wrapper: string;
  toolButtonBase: string;
  toolButtonActive: string;
  toolButtonInactive: string;
  toolGroup: string;
  toolButtonShell: string;
  actionGroup: string;
  toolButtonPrimaryAction: string;
  smallActionButton: string;
  toolButtonIcon: string;
  toolButtonBadge: string;
};

export type GeoportalCesiumAnnotationToolbarMetrics = {
  toolButtonWidthPx: number;
  smallActionButtonWidthPx: number;
  selectionActionButtonCount: number;
  actionGroupWidthTransitionMs: number;
};

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
  toolbar: {
    metrics: GeoportalCesiumAnnotationToolbarMetrics;
    classNames: GeoportalCesiumAnnotationToolbarClassNames;
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
  toolbar: {
    metrics: {
      toolButtonWidthPx: 48,
      smallActionButtonWidthPx: 32,
      selectionActionButtonCount: 3,
      actionGroupWidthTransitionMs: 180,
    },
    classNames: {
      wrapper: "w-fit max-w-full flex items-start gap-2 overflow-visible",
      toolButtonBase:
        "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 text-gray-700 button-shadow transition-colors hover:text-gray-900",
      toolButtonActive: "text-[#1677ff]",
      toolButtonInactive: "",
      toolGroup: "relative flex min-w-12 items-center overflow-visible",
      toolButtonShell: "relative overflow-visible",
      actionGroup:
        "flex h-8 min-w-12 items-center justify-start overflow-hidden rounded-[10px] bg-white text-gray-700 button-shadow transition-[width] ease-in-out",
      toolButtonPrimaryAction:
        "flex h-8 w-12 min-w-12 items-center justify-center px-2 transition-colors hover:text-gray-900",
      smallActionButton:
        "flex h-8 w-8 min-w-8 items-center justify-center rounded-[10px] text-gray-600 transition-colors hover:text-gray-900",
      toolButtonIcon:
        "inline-flex items-center justify-center text-base leading-none",
      toolButtonBadge:
        "absolute right-0 top-0 z-10 inline-flex h-5 min-w-5 translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-[#4b5563] px-1 text-[12px] font-medium leading-none text-white shadow-sm",
    },
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
