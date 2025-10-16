/**
 * CesiumConfig Type Snapshot
 *
 * Frozen from commit: d408bffde572947e3237479db590d90bba2e97d0
 * Date: October 2025
 * Source: libraries/types/src/lib/cesium/cesium-config.d.ts
 *
 * This type definition is preserved to document the expected config structure
 * for the cesium-engine-snapshot in this floodingmap version.
 *
 * DO NOT MODIFY - This is a historical snapshot for reference only.
 */

import type {
  TerrainProviderConfig,
  TerrainType,
  ImageryProviderConfig,
  TilesetConfig,
  SceneStyleConfig,
  SceneStyles,
  CesiumMarkerOptions,
  ModelConfig,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
} from "@carma/types";

export type TerrainProviderRecord = {
  key: string;
  type: TerrainType;
  config: TerrainProviderConfig;
};

export type ImageryProviderRecord = {
  key: string;
  config: ImageryProviderConfig;
};

export type TilesetRecord = {
  key: string;
  config: TilesetConfig;
};

export type CesiumConfigSnapshot = {
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

  imageryProviders?: ImageryProviderRecord[];
  terrainProviders?: TerrainProviderRecord[];
  tilesets?: TilesetRecord[];
  sceneStyles?: SceneStyleConfig[] | SceneStyles;

  markers?: CesiumMarkerOptions[];
  models?: ModelConfig[];
  homePosition?: { x: number; y: number; z: number };
  homeOffset?: { x: number; y: number; z: number };
  cameraController?: {
    enableCollisionDetection?: boolean;
    maximumZoomDistance?: number;
    minimumZoomDistance?: number;
  };
  modelAssets?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
};
