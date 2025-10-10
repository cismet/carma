import type { ModelConfig } from "@carma-commons/resources";
import type { ColorRgbaArray } from "@carma/types";

import type { ProviderConfig } from "./lib/utils/cesiumProviders";
import type { TilesetConfigs } from "./lib/utils/cesiumTilesetProviders";

export type { StringifiedCameraState } from "./lib/utils/cesiumHashParamsCodec";

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

// MARKERS
export type {
  MarkerData,
  Marker3dData,
  MarkerPrimitiveData,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
} from "./lib/extensions/markers";

export type CesiumOptions = {
  markerAsset: MarkerModelAsset;
  isPrimaryStyle: boolean;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
};

export type GeoJsonConfig = {
  url: string;
  name?: string;
  idProperty?: string;
};

export type TerrainProviderConfig = {
  url: string;
};

export type SceneStyle = {
  backgroundColor: ColorRgbaArray;
  globe: {
    baseColor: ColorRgbaArray;
  };
};

export type SceneStyles = {
  primary?: Partial<SceneStyle>;
  secondary?: Partial<SceneStyle>;
};

export type CesiumConfig = {
  transitions: {
    mapMode: {
      duration: number;
    };
  };
  camera: {
    minPitch: number;
    minPitchRange: number;
  };
  markerKey?: string;
  markerAnchorHeight?: number;
  baseUrl: string;
  pathName: string;
  tilesetConfigs: TilesetConfigs;
  providerConfig: ProviderConfig;
  models?: ModelConfig[];
};
// Minimal Redux state for static Cesium configuration only
// All runtime state (visibility, opacity, home position, etc.) is now managed via CesiumContext
export interface CesiumState {
  dataSources?: Record<string, GeoJsonConfig>;
  models?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
}

export type RootState = {
  cesium: CesiumState;
};

export type SceneStateDescription = {
  camera: {
    longitude?: number | null;
    latitude?: number | null;
    height?: number | null;
    heading?: number | null;
    pitch?: number | null;
  };
  zoom?: number | null;
  isAnimating?: boolean | null;
  isSecondaryStyle?: boolean | null;
};

export type AppState = {
  isAnimating?: boolean;
  isMode2d?: boolean;
  isSecondaryStyle?: boolean;
  zoom?: number;
};
