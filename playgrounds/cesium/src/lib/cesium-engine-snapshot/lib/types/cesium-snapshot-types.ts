/**
 * Cesium Engine Snapshot Types
 *
 * Frozen from commit: e31fb3d59f73e044f99c823739f8710efd840021
 * Date: January 2025
 * Source: origin/dev libraries/mapping/engines/cesium/src/index.d.ts
 *
 * These types are internal to the snapshot and were part of the old architecture.
 * They are deprecated outside of this snapshot package.
 *
 * DO NOT MODIFY - This is a historical snapshot for reference only.
 */

import type { ColorRgbaArray } from "@carma/types";
import type {
  MarkerModelAsset,
  ParsedMarkerModelAsset,
} from "../../src/lib/types/tileset-snapshot-types";

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
