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

import { CESIUM_RUNTIME_TRANSITION_STATE } from "./runtime-transition-state";
import type { CesiumState, SceneStyle, SceneStyles } from "./index.d";

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

  // --- Runtime UI state (formerly the `cesium` redux slice) ---
  // 2D <-> 3D transition
  currentTransition: CESIUM_RUNTIME_TRANSITION_STATE;
  isTransitioning: boolean;
  setTransitionTo2d: () => void;
  setTransitionTo3d: () => void;
  clearTransition: () => void;
  // scene styles: static config + current selection
  sceneStyles: SceneStyles | undefined;
  sceneStylePrimary: Partial<SceneStyle> | undefined;
  sceneStyleSecondary: Partial<SceneStyle> | undefined;
  currentSceneStyle: keyof SceneStyles | undefined;
  setCurrentSceneStyle: (style: keyof SceneStyles) => void;
  toggleCurrentSceneStyle: () => void;
  models: CesiumState["models"];
  // tilesets
  showPrimaryTileset: boolean;
  showSecondaryTileset: boolean;
  setShowPrimaryTileset: (show: boolean) => void;
  setShowSecondaryTileset: (show: boolean) => void;
  tilesetOpacity: number;
  setTilesetOpacity: (opacity: number) => void;
  // screen-space camera controller bounds
  ssccMinimumZoomDistance: number;
  ssccMaximumZoomDistance: number;
  ssccEnableCollisionDetection: boolean;
  setSsccMinimumZoomDistance: (distance: number) => void;
  setSsccMaximumZoomDistance: (distance: number) => void;
  setSsccEnableCollisionDetection: (enabled: boolean) => void;
  // Camera animation flag. Plain reactive state — flips per-episode (limiter
  // flyTo / orbit toggle), not per-frame, so re-renders are negligible.
  // (Future: derive from a unified animation registry — see
  // .dev-local/specs/2026-06-23-unified-animation-camera-controller-inventory.md)
  isAnimating: boolean;
  setIsAnimating: (value: boolean) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
