import { createContext, type MutableRefObject } from "react";
import type {
  CesiumWidget,
  Scene,
  ImageryLayer,
  CesiumTerrainProvider,
  Cesium3DTileset,
  Model,
} from "@carma/cesium";

import {
  EmitCesiumCtxFn,
  SubscribeCesiumCtxFn,
} from "./cesium-context-event-map";
import { DelayedRenderOptions } from "@carma-commons/dom/window";
import type { AnimationMap } from "@carma/types";
import type { CesiumConfig } from "@carma/cesium/types";
import type {
  CameraStateHeadingPitchRoll,
  CameraPoseHeadingPitchRoll,
  CameraPrimitive,
  CameraPoseDegrees,
} from "@carma/cesium";

export type CesiumInstanceTrigger = {
  source: string;
  component?: string;
  reason?: string;
};

// Cesium widget instance record
export interface CesiumInstanceRecord {
  instanceId: string;
  timestamp: number;
  contextAgeMs: number;
  widgetRef: MutableRefObject<CesiumWidget | null>;
  config: CesiumConfig;
  // Metadata about what triggered the initialization
  trigger?: CesiumInstanceTrigger;
  // Last known camera state (for crash recovery)
  lastCameraState?: CameraStateHeadingPitchRoll;
}

// Provider ref types for managing arbitrary numbers of providers
export type ProviderRef<T> = {
  key: string;
  provider: T;
};

export interface CesiumContextType {
  widgetRef: MutableRefObject<CesiumWidget | null>;
  sceneRef: MutableRefObject<Scene | null>;

  // Last known camera state (updated on camera changes, used for crash recovery)
  lastCameraStateRef: MutableRefObject<CameraStateHeadingPitchRoll | null>;

  // Provider refs - support arbitrary numbers per type
  terrainProvidersRef: MutableRefObject<Map<string, CesiumTerrainProvider>>;
  imageryLayersRef: MutableRefObject<Map<string, ImageryLayer>>;
  tilesetsRef: MutableRefObject<Map<string, Cesium3DTileset>>;
  modelsRef: MutableRefObject<Map<string, Model>>;

  // Core state refs
  isSuspendedRef: MutableRefObject<boolean>;
  homeCameraRef: MutableRefObject<CameraPoseDegrees | null>;
  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;

  // Event bus
  subscribe: SubscribeCesiumCtxFn;
  emit: EmitCesiumCtxFn;

  // Animation and transition state
  isAnimatingRef: MutableRefObject<boolean>;
  transitionStateRef: MutableRefObject<string | null>;
  suspendSSCCRef: MutableRefObject<boolean>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;

  // Render control
  requestRender: (opts?: DelayedRenderOptions) => void;
  animationMapRef: MutableRefObject<AnimationMap | null>;

  // Original config (immutable after initialization)
  config: CesiumConfig;

  // Cesium widget instance lifecycle history
  // Tracks each time a Cesium widget instance was created (3D mode activation)
  cesiumInstances: CesiumInstanceRecord[];
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
CesiumContext.displayName = "CesiumContext";
