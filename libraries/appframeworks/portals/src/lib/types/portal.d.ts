import type { ManagedEngineKeys, MapStyleKey } from "../constants";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { TransitionConfig } from "@carma-mapping/map-transition-2d-3d";
import type { GazDataConfig } from "@carma-commons/gazetteer";
import type { HashStateConfig } from "./HashStateProvider";
import type { LeafletConfig } from "@carma/types";

/**
 * Portal-specific types for context providers and configuration
 */

export type MapEngine =
  (typeof ManagedEngineKeys)[keyof typeof ManagedEngineKeys];

export type MapPosition2D = {
  latitude: number;
  longitude: number;
  zoom: number;
};

// Object centric camera location for possible synce with Maplibre 3d camera location description
export type CameraLocation = {
  latitude: number;
  longitude: number;
  altitude?: number;
  heading?: number;
  pitch?: number;
  range?: number; // distance from the camera to the point of interest
};

export type MapStyleConfig = {
  defaultStyle: MapStyleKey;
  availableStyles: readonly MapStyleKey[];
};

export type TopicMapConfig = {
  infoBoxPixelWidth?: number;
};

export type MapStyleMappings = {
  cesium: Record<MapStyleKey, string>;
};

export type PortalConfig = {
  hashConfig: HashStateConfig;
  styleConfig: MapStyleConfig;
  defaultPosition: MapPosition2D;
  defaultCameraLocation: CameraLocation;
  homePosition: MapPosition2D;
  homePose3d: CameraLocation;
  mapStyleMappings: MapStyleMappings;
  cesium: CesiumConfig;
  leaflet: LeafletConfig;
  gazData: GazDataConfig;
  overlay: {
    transparency: number;
    color: string;
  };
  transitions: TransitionConfig;
  topicMap: TopicMapConfig;
  // App configuration
  appBasePath: string;
  iconPrefix: string;
  configBaseUrl: string;
  minMobileWidth: number;
};

export interface PortalProviderProps {
  children: React.ReactNode;
  config: PortalConfig;
}
