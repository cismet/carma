import type { PortalConfig } from "@carma-appframeworks/portals";
import { defaultHashCodecs } from "@carma-appframeworks/portals";
import { backgroundSettings } from "@carma-collab/wuppertal/geoportal";
import { geoportalMapStyleConfig } from "./mapStyleConfig";
import {
  CESIUM_CONFIG,
  TRANSITIONS_CONFIG,
  DEFAULT_MAP_POSITION,
  DEFAULT_CESIUM_CAMERA,
} from "./app.config";

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
    { hashParamKey: 'lat', codec: defaultHashCodecs.lat },
    { hashParamKey: 'lng', codec: defaultHashCodecs.lng },
    { hashParamKey: 'zoom', codec: defaultHashCodecs.zoom },
    
    // Map style: 'm' in URL → 'mapStyle' in code
    // Values: '0' = topo, '1' = aerial
    { 
      hashParamKey: 'm',
      propertyName: 'mapStyle',
      codec: defaultHashCodecs.mapStyle
    },
    
    // Engine mode: 'is3d' in URL → 'engine' in code
    // Values: '1' = cesium3d, undefined/absent = leaflet2d
    { 
      hashParamKey: 'is3d',
      propertyName: 'engine',
      codec: defaultHashCodecs.engine
    },
    
    // 3D camera parameters
    { hashParamKey: 'h' }, // altitude
    { hashParamKey: 'heading', codec: defaultHashCodecs.heading },
    { hashParamKey: 'pitch', codec: defaultHashCodecs.pitch },
    { hashParamKey: 'range' }, // distance from target
];

/**
 * Complete portal configuration for Geoportal
 * Single config object that contains all map/portal state configuration
 */
export const portalConfig: PortalConfig = {
  portalConfig: {
    hashConfig,
    
    // Map style configuration
    styleConfig: geoportalMapStyleConfig,
    
    // Default map position (2D)
    defaultPosition: DEFAULT_MAP_POSITION,
    
    // Default camera location (3D)
    defaultCameraLocation: DEFAULT_CESIUM_CAMERA,
    
    // Cesium 3D engine configuration
    cesiumConfig: CESIUM_CONFIG,
    
    // Overlay UI configuration
    overlayConfig: {
      transparency: backgroundSettings.transparency,
      color: backgroundSettings.color,
    },
    
    // 2D↔3D transition configuration
    transitionsConfig: TRANSITIONS_CONFIG,
  }
};
