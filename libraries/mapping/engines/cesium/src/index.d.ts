import type { TerrainProvider } from "cesium";
import type { PlainCartesian3 } from "@carma-commons/types";
import type { ColorRgbaArray } from "@carma-commons/types";

import type { ProviderConfig } from "./lib/utils/cesiumProviders";
import type { TilesetConfigs } from "./lib/utils/cesiumTilesetProviders";

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

// MODELS

export interface MarkerData {
  position: [number, number] | [number, number, number];
  image?: string;
  scale?: number;
  model?: ModelAsset;
}

export interface Marker3dData extends Omit<MarkerData, "model"> {
  model: ModelAsset;
  modelMatrix: Matrix4;
  animatedModelMatrix?: Matrix4;
}

export type PolylineConfig = {
  color?: ColorRgbaArray;
  width?: number;
  gap?: number;
  glow?: boolean;
};

export type ModelAsset = {
  uri: string;
  scale?: number;
  isCameraFacing?: boolean;
  rotation?: boolean | number;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  hasAnimation?: boolean;
  stemline?: Partial<PolylineConfig>;
};

export type ParsedModelAsset = {
  isParsed: true;
  uri: string;
  scale: number;
  isCameraFacing: boolean;
  rotation: boolean | number;
  fixedScale: boolean;
  anchorOffset: { x: number; y: number; z: number };
  hasAnimation: boolean;
  model: Model;
};

export type EntityData = {
  id: string;
  modelMatrix: Matrix4 | null;
  animatedModelMatrix: Matrix4 | null;
  modelConfig: ModelAsset | null;
  stemline?: Polyline | null;
  lastRenderTime?: number;
  animationSpeed?: number;
  model: Model | null;
  onPreUpdate?: Function;
  cleanup?: Function;
};

// as used for marker creation and fuzzy search
export type CesiumOptions = {
  markerAsset: ModelAsset;
  isPrimaryStyle: boolean;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
  terrainProviderRef: MutableRefObject<TerrainProvider | null>;
  surfaceProviderRef: MutableRefObject<TerrainProvider | null>;
};

export type GeoJsonConfig = {
  url: string;
  name?: string;
  idProperty?: string;
};

export type TerrainProviderConfig = {
  url: string;
};

export type ImageryProviderConfig = {
  url: string;
  layers: string;
  parameters: { transparent: boolean; format: string };
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
};
export interface CesiumState {
  isAnimating?: boolean;
  currentTransition?: VIEWER_TRANSITION_STATE;
  currentSceneStyle?: keyof SceneStyles;
  isMode2d: boolean;
  homePosition: null | PlainCartesian3;
  homeOffset: null | PlainCartesian3;
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
  models?: Record<string, ModelAsset | ParsedModelAsset>;
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
