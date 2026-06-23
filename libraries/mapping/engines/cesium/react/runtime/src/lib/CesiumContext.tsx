import { createContext, MutableRefObject } from "react";

import type {
  Camera,
  CesiumWidget,
  Cesium3DTileset,
  CesiumTerrainProvider,
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
  // Guarded, return-value-first runtime access. Each runs cb only when the
  // runtime (and requested resource) is valid and returns the callback's value,
  // or undefined when invalid. SYNCHRONOUS-ENTRY-ONLY: validity is not held
  // across an await — for async work re-acquire after each await and bail on
  // undefined. Use getScene()/getX():T|null for plain value reads.
  isValidRuntime: () => boolean;
  withRuntime: <T>(cb: (runtime: CesiumRuntime) => T) => T | undefined;
  withScene: <T>(
    cb: (scene: Scene, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withCamera: <T>(
    cb: (camera: Camera, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withImageryLayer: <T>(
    cb: (imageryLayer: ImageryLayer, scene: Scene) => T
  ) => T | undefined;
  withPrimaryTileset: <T>(
    cb: (tileset: Cesium3DTileset, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withSecondaryTileset: <T>(
    cb: (tileset: Cesium3DTileset, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withTerrainProvider: <T>(
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withSurfaceProvider: <T>(
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => T
  ) => T | undefined;
  // Direct getters for terrain providers (don't require runtime)
  getTerrainProvider: () => CesiumTerrainProvider | null;
  getSurfaceProvider: () => CesiumTerrainProvider | null;
  getImageryLayer: () => ImageryLayer | null;
  getScene: () => Scene | null;

  // --- Runtime UI state (formerly the `cesium` redux slice) ---
  // 2D <-> 3D transition
  currentTransition: CESIUM_RUNTIME_TRANSITION_STATE;
  isTransitioning: boolean;
  clearTransition: () => void;
  // scene styles: static config + current selection
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
  // screen-space camera controller bounds (read-only config)
  ssccMinimumZoomDistance: number;
  ssccMaximumZoomDistance: number;
  ssccEnableCollisionDetection: boolean;
  // Camera animation flag. Plain reactive state — flips per-episode (limiter
  // flyTo / orbit toggle), not per-frame, so re-renders are negligible.
  // (Future: derive from a unified animation registry — see
  // .dev-local/specs/2026-06-23-unified-animation-camera-controller-inventory.md)
  isAnimating: boolean;
  setIsAnimating: (value: boolean) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
