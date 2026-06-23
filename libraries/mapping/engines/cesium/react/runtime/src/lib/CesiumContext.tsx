import { createContext, MutableRefObject } from "react";

import type {
  Camera,
  CesiumWidget,
  Cesium3DTileset,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Scene,
} from "@carma-cesium";
import type { SceneAnimationMap } from "@carma-mapping/engines/cesium/core";

export type CesiumRuntime = CesiumWidget;

export interface CesiumContextType {
  runtimeRef: MutableRefObject<CesiumRuntime | null>;
  sceneAnimationMapRef: MutableRefObject<SceneAnimationMap | null>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  isRuntimeReady: boolean;
  setIsRuntimeReady: (flag: boolean) => void;
  providersReady: boolean;
  // Track when initial camera view from URL has been applied
  initialViewApplied: boolean;
  setInitialViewApplied: (flag: boolean) => void;
  requestRender: (opts?: {
    delay?: number; // ms
    repeat?: number; // times
    repeatInterval?: number; // ms
  }) => void;
  // Shorthands for runtime validation
  isValidRuntime: () => boolean;
  withRuntime: (cb: (runtime: CesiumRuntime) => void) => boolean;
  withCamera: (cb: (camera: Camera, runtime: CesiumRuntime) => void) => boolean;
  withCanvas: (
    cb: (canvas: HTMLCanvasElement, runtime: CesiumRuntime) => void
  ) => boolean;
  withScene: (cb: (scene: Scene, runtime: CesiumRuntime) => void) => boolean;
  withImageryLayer: (
    cb: (imageryLayer: ImageryLayer, scene: Scene) => void
  ) => boolean;
  withPrimaryTileset: (
    cb: (tileset: Cesium3DTileset, runtime: CesiumRuntime) => void
  ) => boolean;
  withSecondaryTileset: (
    cb: (tileset: Cesium3DTileset, runtime: CesiumRuntime) => void
  ) => boolean;
  withEllipsoidTerrainProvider: (
    cb: (provider: EllipsoidTerrainProvider, runtime: CesiumRuntime) => void
  ) => boolean;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => void
  ) => boolean;
  // Direct getters for terrain providers (don't require runtime)
  getTerrainProvider: () => CesiumTerrainProvider | null;
  getSurfaceProvider: () => CesiumTerrainProvider | null;
  getImageryLayer: () => ImageryLayer | null;
  getScene: () => Scene | null;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
