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

import {
  type MapStateType,
  type MapTransitionLifecycle,
} from "./hooks/useMapTransition";
import { ViewerAnimationMap } from "./utils/viewerAnimationMap";
import type {
  EmitCesiumCtxFn,
  SubscribeCesiumCtxFn,
} from "./cesiumContextEventMap";

export interface CesiumContextType {
  viewerRef: MutableRefObject<Viewer | null>;
  viewerAnimationMapRef: MutableRefObject<ViewerAnimationMap | null>;
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
  requestRender: (opts?: {
    delay?: number; // ms
    repeat?: number; // times
    repeatInterval?: number; // ms
  }) => void;
  // Shorthands for viewer validation
  isValidViewer: () => boolean;
  withViewer: (cb: (viewer: Viewer) => void) => boolean;
  withCamera: (cb: (camera: Camera, viewer: Viewer) => void) => boolean;
  withCanvas: (
    cb: (canvas: HTMLCanvasElement, viewer: Viewer) => void
  ) => boolean;
  withScene: (cb: (scene: Scene, viewer: Viewer) => void) => boolean;
  withEntities: (
    cb: (entities: EntityCollection, viewer: Viewer) => void
  ) => boolean;
  withImageryLayer: (
    cb: (imageryLayer: ImageryLayer, viewer: Viewer) => void
  ) => boolean;
  withPrimaryTileset: (
    cb: (tileset: Cesium3DTileset, viewer: Viewer) => void
  ) => boolean;
  withSecondaryTileset: (
    cb: (tileset: Cesium3DTileset, viewer: Viewer) => void
  ) => boolean;
  withEllipsoidTerrainProvider: (
    cb: (provider: EllipsoidTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
