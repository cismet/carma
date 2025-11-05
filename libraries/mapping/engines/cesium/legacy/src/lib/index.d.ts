import type { Cartesian3Json, ColorConstructorArgs } from "@carma/cesium";
import type { ModelConfig } from "@carma-commons/resources";

import type { ProviderConfig } from "./utils/cesiumProviders";
import type { TilesetConfigs } from "./utils/cesiumTilesetProviders";

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
} from "./extensions/markers";

export type CesiumOptions = {
  markerAsset: MarkerModelAsset;
  isPrimaryStyle: boolean;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
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
  backgroundColor: ColorConstructorArgs;
  globe: {
    baseColor: ColorConstructorArgs;
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
export interface CesiumState {
  isAnimating?: boolean;
  currentTransition?: VIEWER_TRANSITION_STATE;
  currentSceneStyle?: keyof SceneStyles;
  homePosition: null | Cartesian3Json;
  homeOffset: null | Cartesian3Json;
  showPrimaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap
  showSecondaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap

  sceneSpaceCameraController: {
    enableCollisionDetection: boolean;
    minimumZoomDistance: number; // default is 1.0
    maximumZoomDistance: number; // default is Infinity
  };
  sceneStyles?: SceneStyles;
  // TODO move to per tileset styling
  styling: {
    tileset: {
      opacity: number;
    };
  };
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
  isSecondaryStyle?: boolean;
  zoom?: number;
};
