import type { CssPixels, Milliseconds, Ratio } from "@carma-units";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";

import type { LeafletConfig } from "@carma-mapping/engines/leaflet";
import {
  filterAddonsByAvailability,
  getAddonKind,
  type AddonEntry,
  type AddonKind,
} from "@carma-mapping/addons";
import {
  ANNOTATION_TYPES,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import {
  type AreaOcclusionStyleOptions,
  type AnnotationLineStyleOptions,
  type AnnotationReferenceObjectSizingOptions,
} from "@carma-mapping/annotations/runtime";
import {
  DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS,
  STABLE_ANNOTATION_TOOL_IDS,
  type AnnotationInfoBoxLayoutProps,
} from "@carma-mapping/annotations/ui";

import { availabilityContext } from "./availability";
import { APP_KEY } from "./index";
import { STORE_APP_KEY } from "../store/app-key";
import { MEASUREMENT3D_AVAILABILITY } from "./measurement3d-availability";
import { defaultWorkflowAddons } from "../constants/default-workflows";
import { MODEL_BOUNDS_3857, RELAY_BASE_URL } from "../constants/relay";

/** The stored 3D measurement set, per appKey namespace like the layer state; the key name predates the MapLibre 3D view. */
export const GEOPORTAL_ANNOTATIONS_STORAGE_KEY = `@${
  STORE_APP_KEY || APP_KEY
}.app.cesium-annotations`;

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";

export const MIN_MOBILE_WIDTH = 600;
export const DEFAULT_CAMERA_FOV_DEG = 60;

/**
 * What the MapLibre map shows where nothing is drawn: outside a standalone
 * tileset's coverage, or before its tiles arrive. A neutral midday tone
 * rather than black or the page background.
 */
export const MAP_BACKGROUND_COLOR = "#d8dde3";

/**
 * Addons every route gets. A route declaring the same addon replaces the entry
 * here, see `withDefaultAddons`.
 *
 * `cameraRestriction` keeps the MapLibre camera north-up and flat everywhere,
 * which is the app's long-standing behaviour, except while a 3D layer is on the
 * map: buildings, trees and tilesets only show up in a tilted view. The mode
 * asks the map what it is drawing rather than matching layer names, so a new 3D
 * style is covered the day it is published. A route that wants different rules
 * declares the addon itself with a config of its own.
 *
 * `libreTerrain` follows the restriction the engine ends up with rather than
 * the layers: whenever the camera is free the terrain is on, and it goes off
 * again the moment the camera locks. There is no button to it; the app
 * switches CarmaMap's own terrain button off as well (`terrainControl={false}`),
 * so relief is never a choice the user has to make.
 *
 * `attribution` shows the credits the visible styles declare on their sources
 * (e.g. © OpenStreetMap for the Shortbread background) for five seconds, then
 * removes them, as the OSMF attribution guidelines allow as long as the
 * licence stays findable elsewhere (the menu).
 * Backgrounds without a source attribution show nothing. It sits below the
 * infobox in the bottom right corner.
 *
 * `tiltedModels` shows the 3D model an object layer declares (the BUGA bridge,
 * say) in place of its footprint whenever the MapLibre map is tilted. It never
 * frees the camera on its own: a model alone leaves the map flat.
 */
export const DEFAULT_ADDONS: AddonEntry[] = [
  {
    addon: "cameraRestriction",
    config: { mode: "unless3dLayersActive" },
  },
  {
    addon: "libreTerrain",
    config: { appKey: "geoportal", mode: "whileCameraFree" },
  },
  {
    addon: "attribution",
    config: { mode: "transient", hideAfterSeconds: 5 },
  },
  "tiltedModels",
  {
    // 3D measurements on the MapLibre view while a mesh or tileset is drawn,
    // stored as one set with the Cesium view; not on the live geoportal yet
    addon: "measurement3d",
    config: {
      storageKey: GEOPORTAL_ANNOTATIONS_STORAGE_KEY,
      referenceObjectSizing: {
        discSizing: {
          targetScreenRadiusCssPx: 64 as CssPixels,
          minimumScreenRadiusCssPx: 10 as CssPixels,
          maximumViewportRadiusRatio: 0.5 as Ratio,
          sceneResizeFactor: 10 as Ratio,
          resizeHysteresisRatio: 0.15 as Ratio,
          radiusLabelVisibleDurationMs: 3000 as Milliseconds,
          radiusLabelFadeDurationMs: 250 as Milliseconds,
          resizeAnimationDurationMs: 200 as Milliseconds,
          snapAnimationDurationMs: 300 as Milliseconds,
          centerCircleDiameterCssPx: 10 as CssPixels,
          crosshairHalo: true,
        },
      },
    },
    availability: MEASUREMENT3D_AVAILABILITY,
  },
];

/**
 * The plain geoportal's own addons, which no Fachzwilling gets: following a
 * show with `?relay=<CODE>` (pm-show's link "Geoportal folgt der Show"). Both
 * idle without a code. The page takes the presenter's layers for the
 * `geoportal` target and writes its view and selection as the `geoportal`
 * writer, which the outlet reads.
 */
const PLAIN_GEOPORTAL_ADDONS: AddonEntry[] = [
  {
    addon: "mapRelay",
    config: { relayBaseUrl: RELAY_BASE_URL, writeAs: "geoportal" },
    availability: { deployments: ["localDev", "dev", "pr"] },
  },
  {
    addon: "relayFollower",
    config: { modelBounds3857: MODEL_BOUNDS_3857 },
    availability: { deployments: ["localDev", "dev", "pr"] },
  },
];

export const plainGeoportalAddons = (): AddonEntry[] =>
  filterAddonsByAvailability(PLAIN_GEOPORTAL_ADDONS, availabilityContext);

/**
 * The app's defaults, with the route's own declarations taking precedence.
 * A default addon may carry an `availability` like a route addon; a feature
 * flag used there must be in the base feature flag config (featureFlags.ts).
 * The route's addons arrive already filtered, see constants/fachzwillinge.
 *
 * The default workflows join the defaults as ordinary addon entries, each
 * carrying the definition it launches at mount, see constants/default-workflows.
 * They follow the same precedence rule, so a route that declares the same kind
 * takes the engine over and the default workflow does not run there.
 * Kinds in `excluded` are left out without a replacement.
 */
export const withDefaultAddons = (
  addons?: AddonEntry[],
  excluded: AddonKind[] = []
): AddonEntry[] => {
  const skipped = new Set<AddonKind>([
    ...(addons ?? []).map(getAddonKind),
    ...excluded,
  ]);
  return [
    ...[
      ...filterAddonsByAvailability(DEFAULT_ADDONS, availabilityContext),
      ...defaultWorkflowAddons(),
    ].filter((addon) => !skipped.has(getAddonKind(addon))),
    ...(addons ?? []),
  ];
};

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
  referenceObjectSizing: AnnotationReferenceObjectSizingOptions;
  tools: {
    defaultToolId: AnnotationToolId;
    allToolIds: readonly AnnotationToolId[];
    stableToolIds: readonly AnnotationToolId[];
  };
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
  referenceObjectSizing: {
    scalingMode: REFERENCE_OBJECT_SCALING_MODES.WORLD,
    worldRadiusMeters: 3,
    targetScreenRadiusCssPx: 48,
    resizeWorldRadiusToScreenTarget: true,
    resizeStepFactor: 4,
    quantizeWorldRadius: false,
  },
  tools: {
    defaultToolId: ANNOTATION_TYPES.DISTANCE,
    allToolIds: DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS,
    stableToolIds: STABLE_ANNOTATION_TOOL_IDS,
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
  shadowSimulation: "shadow",
} as const;
