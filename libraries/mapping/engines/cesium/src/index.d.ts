// TODO consolidate with rest of libs

import { hashcodecs } from "./lib/CustomViewer/utils";

type Translation = {
  x: number;
  y: number;
  z: number;
};

export type LatLngRecord = {
  latitude: number;
  longitude: number;
};

export type LatLngRadians = {
  latRad: number;
  lngRad: number;
};

export type ColorRgbaArray = [number, number, number, number];

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

export interface NumericResult {
  value: number | null;
  error?: string;
}

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
export type ModelAsset = {
  uri: string;
  scale: number;
  isCameraFacing?: boolean;
  rotation?: boolean | number;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  hasAnimation?: boolean;
};

//

type PlainCartesian3 = {
  x: number;
  y: number;
  z: number;
};

export type TilesetConfig = {
  url: string;
  name?: string;
  translation?: PlainCartesian3;
  idProperty?: string;
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

export type SceneStyleDescription = {
  globe: {
    baseColor: ColorRgbaArray;
  };
};

export type SceneStyles = {
  default: SceneStyleDescription;
  primary?: Partial<SceneStyleDescription>;
  secondary?: Partial<SceneStyleDescription>;
};

export interface CesiumState {
  isAnimating: boolean;
  isMode2d: boolean;
  homePosition: null | PlainCartesian3;
  homeOffset: null | PlainCartesian3;
  showPrimaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap
  showSecondaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap

  /*
    quality: {
      msaaSamples: number;
      useBrowserRecommendedResolution: boolean;
  
    }
    */
  // TODO move to per tileset styling
  styling: {
    tileset: {
      opacity: number;
    };
  };
  sceneStyles: SceneStyles;
  dataSources: {
    footprintGeoJson: null | GeoJsonConfig;
    tilesets: {
      primary: null | TilesetConfig;
      secondary: null | TilesetConfig;
    };
  };
  terrainProvider: null | TerrainProviderConfig;
  imageryProvider: null | ImageryProviderConfig;
  models?: Record<string, ModelAsset>; // TODO should theseassets and providers be in this part of the state?
}

export type RootState = {
  cesium: CesiumState;
};

export type ColorInput = ColorRgbaArray | Color;

// from Hash

type HashKey = keyof typeof hashcodecs;

type CodecKeys = {
  [K in HashKey]: (typeof hashcodecs)[K]["key"];
};

export type FlatDecodedSceneHash = {
  [K in CodecKeys[keyof CodecKeys]]?: ReturnType<
    (typeof hashcodecs)[HashKey]["decode"]
  >;
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

export type EncodedSceneParams = {
  hashParams: Record<string, string>;
  state: SceneStateDescription;
};
