import { createContext, type MutableRefObject } from "react";
import {
  type CesiumWidget,
  type Scene,
  type ImageryLayer,
  type CesiumTerrainProvider,
  type Cesium3DTileset,
  type Model,
} from "cesium";

import { EmitCesiumCtxFn, SubscribeCesiumCtxFn } from "./cesiumContextEventMap";
import { DelayedRenderOptions } from "@carma-commons/dom/window";
import type { AnimationMap, CesiumConfig } from "@carma/types";

// Provider ref types for managing arbitrary numbers of providers
export type ProviderRef<T> = {
  key: string;
  provider: T;
};

export interface CesiumContextType {
  widgetRef: MutableRefObject<CesiumWidget | null>;
  sceneRef: MutableRefObject<Scene | null>;

  // Provider refs - support arbitrary numbers per type
  terrainProvidersRef: MutableRefObject<Map<string, CesiumTerrainProvider>>;
  imageryLayersRef: MutableRefObject<Map<string, ImageryLayer>>;
  tilesetsRef: MutableRefObject<Map<string, Cesium3DTileset>>;
  modelsRef: MutableRefObject<Map<string, Model>>;

  // Core state refs
  isSuspendedRef: MutableRefObject<boolean>;
  homePositionRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
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

  // Original config for reference
  config: CesiumConfig;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
CesiumContext.displayName = "CesiumContext";
