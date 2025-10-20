/**
 * Cesium Engine Snapshot Types
 *
 * Frozen from commit: d408bffde572947e3237479db590d90bba2e97d0
 * Date: October 2025
 * Source: origin/dev libraries/mapping/engines/cesium/src/index.d.ts
 *
 * These types are internal to the snapshot and were part of the old architecture.
 * They are deprecated outside of this snapshot package.
 *
 * DO NOT MODIFY - This is a historical snapshot for reference only.
 */

import type { ColorRgbaArray } from "@carma/types";

// Snapshot types - these were removed from @carma/types in the refactor
export type MarkerModelAsset = {
  key?: string;
  uri: string;
  url?: string;
  scale?: number;
  rotation?: boolean;
  isCameraFacing?: boolean;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  stemline?: {
    color: [number, number, number, number];
    width: number;
    gap: number;
    glow: boolean;
  };
};

export type ParsedMarkerModelAsset = MarkerModelAsset & {
  model?: any; // Cesium.Model
};

export type ModelConfig = {
  position: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  orientation?: {
    heading?: number;
    pitch?: number;
    roll?: number;
  };
  model: {
    uri: string;
    scale?: number | { x: number; y: number; z: number };
    show?: boolean;
  };
};

export type SceneStyleConfig = {
  id?: string;
  backgroundColor?: ColorRgbaArray;
  globe?: {
    baseColor?: ColorRgbaArray;
  };
};

// Old CesiumConfig structure from snapshot
export type CesiumConfig = {
  models?: ModelConfig[];
  tilesets?: any[];
  homePosition?: PlainCartesian3;
  homeOffset?: PlainCartesian3;
  cameraController?: {
    enableCollisionDetection?: boolean;
    minimumZoomDistance?: number;
    maximumZoomDistance?: number;
  };
  sceneStyles?: SceneStyleConfig[];
  [key: string]: any;
};

export type PlainCartesian3 = { x: number; y: number; z: number };

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

export interface CesiumState {
  isAnimating?: boolean;
  currentTransition?: number;
  currentSceneStyle?: keyof SceneStyles;
  isMode2d: boolean;
  homePosition: null | PlainCartesian3;
  homeOffset: null | PlainCartesian3;
  showPrimaryTileset: boolean;
  showSecondaryTileset: boolean;
  sceneSpaceCameraController: {
    enableCollisionDetection: boolean;
    minimumZoomDistance: number;
    maximumZoomDistance: number;
  };
  sceneStyles?: SceneStyles;
  styling: {
    tileset: {
      opacity: number;
    };
  };
  dataSources?: Record<string, any>;
  models?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
}

export type RootState = {
  cesium: CesiumState;
};

// Note: CesiumConfig is defined above with the snapshot structure
