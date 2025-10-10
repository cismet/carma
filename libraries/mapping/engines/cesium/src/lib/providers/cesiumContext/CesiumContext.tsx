import { createContext, type MutableRefObject } from "react";
import {
  type Viewer,
  type Scene,
  CesiumTerrainProvider,
  Cesium3DTileset,
} from "cesium";

import {
  EmitCesiumCtxFn,
  SubscribeCesiumCtxFn,
} from "../../cesiumContextEventMap";
import type {
  CameraCallback,
  EntitiesCallback,
  SceneCallback,
  TerrainProviderCallback,
  TilesetCallback,
  ViewerCallback,
  WithCallback,
  WithElevationProvidersCallback,
} from "../../hooks/useValidInstances";
import type { AnimationMap } from "../../utils/animationMap";
import type { GeoJsonConfig } from "../../..";
import type {
  MarkerModelAsset,
  ParsedMarkerModelAsset,
} from "../../extensions/markers";
import { DelayedRenderOptions } from "@carma-commons/dom/window";

export interface CesiumContextType {
  viewerRef: MutableRefObject<Viewer | null>;
  // shorthand for viewer.scene
  sceneRef: MutableRefObject<Scene | null>;
  animationMapRef: MutableRefObject<AnimationMap | null>;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  isSuspendedRef: MutableRefObject<boolean>;
  isAnimatingRef: MutableRefObject<boolean>;
  suspendSSCCRef: MutableRefObject<boolean>;
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>;
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>;
  transitionStateRef: MutableRefObject<string>;
  transitionLifecycleRef: MutableRefObject<
    Record<string, () => void | Promise<void>>
  >;
  // Camera controller settings
  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;
  // Scene style settings
  currentSceneStyleRef: MutableRefObject<string | undefined>;
  tilesetVisibilityRef: MutableRefObject<Map<string, boolean>>;
  tilesetOpacityRef: MutableRefObject<Map<string, number>>;
  // Home position
  homePositionRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  homeOffsetRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  // Static configuration (immutable after init)
  dataSources: MutableRefObject<Record<string, GeoJsonConfig> | null>;
  models: MutableRefObject<Record<
    string,
    MarkerModelAsset | ParsedMarkerModelAsset
  > | null>;
  // Tri-state: null = not started, false = applying, true = settled
  initialCameraSettled: boolean | null;
  setInitialCameraSettled: (value: boolean | null) => void;
  initialCameraEpoch: number;
  setInitialCameraEpoch: (epoch: number) => void;
  // For forcing Cesium re-renders (not React re-renders)
  requestRender: (opts?: DelayedRenderOptions) => void;
  isViewerReady: boolean;
  setIsViewerReady: (ready: boolean) => void;
  isValidViewer: () => boolean;
  // Event bus
  subscribe: SubscribeCesiumCtxFn;
  emit: EmitCesiumCtxFn;
  // Shorthands for viewer validation
  withViewer: WithCallback<ViewerCallback>;
  withScene: WithCallback<SceneCallback>;
  withCamera: WithCallback<CameraCallback>;
  withEntities: WithCallback<EntitiesCallback>;
  withPrimaryTileset: WithCallback<TilesetCallback>;
  withSecondaryTileset: WithCallback<TilesetCallback>;
  withTerrainProvider: WithCallback<TerrainProviderCallback>;
  withSurfaceProvider: WithCallback<TerrainProviderCallback>;
  withElevationProviders: WithElevationProvidersCallback;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
