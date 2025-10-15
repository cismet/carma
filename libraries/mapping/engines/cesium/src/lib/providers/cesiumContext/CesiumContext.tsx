import { createContext, type MutableRefObject } from "react";
import { type Viewer, type Scene, CesiumTerrainProvider } from "cesium";

import {
  EmitCesiumCtxFn,
  SubscribeCesiumCtxFn,
} from "../../cesiumContextEventMap";
import { DelayedRenderOptions } from "@carma-commons/dom/window";
import type { AnimationMap } from "@carma/types";

// Provider ref types for managing arbitrary numbers of providers
export type ProviderRef<T> = {
  key: string;
  provider: T;
};

export interface CesiumContextType {
  widgetRef: MutableRefObject<Viewer | null>;
  sceneRef: MutableRefObject<Scene | null>;

  // Provider refs - support arbitrary numbers per type
  terrainProvidersRef: MutableRefObject<Map<string, CesiumTerrainProvider>>;
  imageryLayersRef: MutableRefObject<Map<string, any>>;
  tilesetsRef: MutableRefObject<Map<string, any>>;
  modelsRef: MutableRefObject<Map<string, any>>;

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
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
CesiumContext.displayName = "CesiumContext";
