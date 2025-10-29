import type { ManagedEngineKeys, MapStyleKey } from "../constants";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { TransitionConfig } from "@carma-mapping/map-transition-2d-3d";
import type { GazDataConfig } from "@carma-commons/gazetteer";
import type { HashStateConfig } from "./HashStateProvider";
import type { LeafletConfig } from "@carma/types";
import type { CameraStateHeadingPitchRoll } from "@carma/cesium";

/**
 * Portal-specific types for context providers and configuration
 */

export type MapEngine =
  (typeof ManagedEngineKeys)[keyof typeof ManagedEngineKeys];

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
  // keep close to LeafletConfig and CesiumConfig
  defaultView: MapView;
  defaultCamera: CameraStateHeadingPitchRoll.deg;
  homeView: MapView;
  homeCamera: CameraStateHeadingPitchRoll.deg;
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

// Re-export MapEngineRecord from map-engines.d.ts
export type { MapEngineRecord } from "./map-engines";
