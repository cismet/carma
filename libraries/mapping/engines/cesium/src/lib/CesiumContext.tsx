import { createContext, MutableRefObject } from "react";

import type {
  Camera,
  Cesium3DTileset,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  EntityCollection,
  ImageryLayer,
  Scene,
  Viewer,
} from "cesium";

import type { AnimationMap } from "./utils/animationMap";
import {
  type MapStateType,
  type MapTransitionLifecycle,
} from "./hooks/useMapTransition";
import type {
  EmitCesiumCtxFn,
  SubscribeCesiumCtxFn,
} from "./cesiumContextEventMap";
import type {
  CameraCallback,
  CanvasCallback,
  EllipsoidTerrainProviderCallback,
  EntitiesCallback,
  ImageryLayerCallback,
  SceneCallback,
  TerrainProviderCallback,
  TilesetCallback,
  ViewerCallback,
  WithCallback,
  WithAsyncCallback,
  WithElevationProvidersAsyncCallback,
  TerrainProviderAsyncCallback,
} from "./hooks/useValidInstances";
import { DelayedRenderOptions } from "@carma-commons/utils";

export interface CesiumContextType {
  viewerRef: MutableRefObject<Viewer | null>;
  // shorthand for viewer.scene
  sceneRef: MutableRefObject<Scene | null>;
  animationMapRef: MutableRefObject<AnimationMap | null>;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  // state for transitions for other map engines
  transitionStateRef: MutableRefObject<keyof MapStateType>;
  transitionLifecycleRef: MutableRefObject<MapTransitionLifecycle>;
  isViewerReady: boolean;
  setIsViewerReady: (flag: boolean) => void;
  // null: not started determining; false: determining/applying; true: settled
  initialCameraSettled: boolean | null;
  setInitialCameraSettled: (flag: boolean | null) => void;
  // Monotonic counter that increments each time an initial camera apply sequence starts
  initialCameraEpoch: number;
  bumpInitialCameraEpoch: () => void;
  // Generic, typed event bus for Cesium context
  subscribe: SubscribeCesiumCtxFn;
  emit: EmitCesiumCtxFn;
  requestRender: (opts?: DelayedRenderOptions) => void;
  // Shorthands for viewer validation
  isValidViewer: () => boolean;
  withViewer: WithCallback<ViewerCallback>;
  withCamera: WithCallback<CameraCallback>;
  withCanvas: WithCallback<CanvasCallback>;
  withScene: WithCallback<SceneCallback>;
  withEntities: WithCallback<EntitiesCallback>;
  withImageryLayer: WithCallback<ImageryLayerCallback>;
  withPrimaryTileset: WithCallback<TilesetCallback>;
  withSecondaryTileset: WithCallback<TilesetCallback>;
  withEllipsoidTerrainProvider: WithCallback<EllipsoidTerrainProviderCallback>;
  withTerrainProvider: WithCallback<TerrainProviderCallback>;
  withSurfaceProvider: WithCallback<TerrainProviderCallback>;
  withTerrainProviderAsync: WithAsyncCallback<TerrainProviderAsyncCallback>;
  withSurfaceProviderAsync: WithAsyncCallback<TerrainProviderAsyncCallback>;
  withElevationProvidersAsync: WithElevationProvidersAsyncCallback;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
