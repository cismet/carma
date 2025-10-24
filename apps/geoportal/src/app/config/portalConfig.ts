import {
  type MapStyleConfig,
  type PortalConfig,
  defaultHashCodecs,
  MapStyleKeys,
} from "@carma-appframeworks/portals";
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";
import { CESIUM_CONFIG, GeoportalCesiumStyleKeys } from "./cesium.config";
import type { TransitionConfig } from "@carma/mapping/map-transition-2d-3d";
import { LEAFLET_CONFIG } from "./leaflet";
import { WUPPERTAL } from "@carma/resources";
import { Altitude, Degrees, Latitude, Meters } from "@carma/geo/types";

// App configuration constants
export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";
export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";
export const MIN_MOBILE_WIDTH = 600;

const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: MapStyleKeys.TOPO,
  availableStyles: [MapStyleKeys.TOPO, MapStyleKeys.AERIAL] as const,
};

/**
 * Complete Cesium configuration for Geoportal
 * Uses new SceneStyleConfig format with sources and styles
 * Style IDs use GeoportalCesiumStyleKeys:
 *   - luftbild (aerial) → GeoportalCesiumStyleKeys.MESH ("mesh-2024")
 *   - karte (topo) → GeoportalCesiumStyleKeys.LOD2 ("lod2")
 */
// Transition configuration for 2D↔3D mode switching
export const TRANSITIONS_CONFIG: TransitionConfig = {
  modeTo3d: {
    // Wuppertal-specific: Max elevation ~400m (Barmen hills)
    // Used when terrain provider not yet available during transition
    fallbackGroundElevationM: 400,
    
    step1_prepare2dView: {
      maxZoom: 20,
      zoomOutDurationMs: 700,
      zoomOutTimeoutBufferMs: 100,
    },
    step2_initialRender: {
      timeoutMs: 500,
    },
    step3_waitForResources: {
      timeoutMs: 2000,
    },
    // step4_positionCamera: synchronous, no config needed
    step5_cssFadeIn: {
      durationMs: 1000,
    },
    step6_cameraAnimation: {
      durationMs: 2000,
    },
  },
  modeTo2d: {
    step2_cameraTiltAnimation: {
      durationFactorCameraDeviationMs: 1500,
      durationFactorZoomDiffMs: 500,
      maxDurationMs: 2000,
    },
    step3_cssFadeOut: {
      durationMs: 1000,
    },
  },
};

// Default 2D map position (for Leaflet, MapLibre)
// Note: NOT yet unified across all engines - see https://github.com/cismet/carma/issues/214
export const DEFAULT_MAP_POSITION = {
  latitude: WUPPERTAL.position.latitude as Degrees,
  longitude: WUPPERTAL.position.longitude as Degrees,
  zoom: 15, // Leaflet/MapLibre zoom level
};

export const HOME_POSITION = {
  latitude: WUPPERTAL.position.latitude as Degrees,
  longitude: WUPPERTAL.position.longitude as Degrees,
  zoom: 18, // Leaflet/MapLibre zoom level
};

// Default Cesium 3D camera location (Portal format: altitude + degrees)
// Camera-centric: Camera position in absolute coordinates
export const DEFAULT_CESIUM_CAMERA = {
  latitude: WUPPERTAL.position.latitude as Degrees,
  longitude: WUPPERTAL.position.longitude as Degrees,
  altitude: 10000 as Altitude.EllipsoidalWGS84Meters, // Camera altitude above sea level
  heading: 0 as Degrees, // North
  pitch: -90 as Degrees, // Looking straight down (nadir)
  roll: 0 as Degrees,
};

// Home Cesium camera with HPR offset (heading/pitch/range)
// Object-centric: Look at target point with offset
// Note: This format uses 'range' (distance from target) instead of 'altitude'
export const HOME_CESIUM_CAMERA = {
  latitude: WUPPERTAL.position.latitude as Degrees,
  longitude: WUPPERTAL.position.longitude as Degrees,
  altitude: WUPPERTAL.position.altitude as Altitude.EllipsoidalWGS84Meters, // Target point altitude
  heading: 0 as Degrees, // North
  pitch: -90 as Degrees, // Looking down
  range: 500 as Meters, // Distance from target (object-centric)
};

/**
 * Complete portal configuration for Geoportal
 * Single config object that contains all map/portal state configuration
 *
 * TODO: Eventually move all Redux sync logic into PortalProvider callbacks
 * Currently Redux is used for UI state sync, but this should be consolidated
 * into the portal context to avoid importing Redux everywhere above TopicMapComponentWrapper
 */

// Hash URL configuration
const hashConfig = [
  // Position fields
  { hashParamKey: "lat", codec: defaultHashCodecs.lat },
  { hashParamKey: "lng", codec: defaultHashCodecs.lng },
  { hashParamKey: "zoom", codec: defaultHashCodecs.zoom },

  // Map style: 'm' in URL → 'mapStyle' in code
  // Values: '0' = topo, '1' = aerial
  {
    hashParamKey: "m",
    propertyName: "mapStyle",
    codec: defaultHashCodecs.mapStyle,
  },

  // Engine mode: 'is3d' in URL → 'engine' in code
  // Values: '1' = cesium3d, undefined/absent = leaflet2d
  {
    hashParamKey: "is3d",
    propertyName: "engine",
    codec: defaultHashCodecs.engine,
  },

  // 3D camera parameters
  { hashParamKey: "h" }, // altitude
  { hashParamKey: "heading", codec: defaultHashCodecs.heading },
  { hashParamKey: "pitch", codec: defaultHashCodecs.pitch },
  { hashParamKey: "range" }, // distance from target
];

/**
 * Complete portal configuration for Geoportal
 * Single config object that contains all map/portal state configuration
 */
export const portalConfig: PortalConfig = {
  hashConfig,

  // Map style configuration
  styleConfig: geoportalMapStyleConfig,
  
  // Mapping from portal map styles to Cesium scene styles
  mapStyleToCesiumStyleMapping: {
    [MapStyleKeys.TOPO]: GeoportalCesiumStyleKeys.LOD2,      // "karte" → "lod2"
    [MapStyleKeys.AERIAL]: GeoportalCesiumStyleKeys.MESH,    // "luftbild" → "mesh-2024"
  },

  // Default map position (2D)
  defaultPosition: DEFAULT_MAP_POSITION,
  // Default camera location (3D)
  defaultCameraLocation: DEFAULT_CESIUM_CAMERA,
  homePosition: DEFAULT_MAP_POSITION,
  homePose3d: DEFAULT_CESIUM_CAMERA,
  leafletConfig: LEAFLET_CONFIG,
  cesiumConfig: CESIUM_CONFIG,

  overlayConfig: {
    transparency: backgroundSettings.transparency,
    color: backgroundSettings.color,
  },

  // 2D↔3D transition configuration
  transitionsConfig: TRANSITIONS_CONFIG,

  // App configuration
  appBasePath: APP_BASE_PATH,
  iconPrefix: ICON_PREFIX,
  configBaseUrl: CONFIG_BASE_URL,
  minMobileWidth: MIN_MOBILE_WIDTH,
};
