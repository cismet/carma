import { createContext, type MutableRefObject } from "react";
import type {
  CesiumWidget,
  Scene,
  CameraPrimitive,
  CameraPoseRadians,
} from "@carma/cesium";

// Event bus removed - using direct refs and callbacks instead
import type { DelayedRenderOptions } from "@carma-commons/dom/window";
import type { AnimationMap } from "@carma/types";
import type { CesiumConfig } from "@carma/cesium/types";

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
  // Last known camera state (for crash recovery) - internal Cesium state
  cameraState?: CameraPrimitive;
}

// Provider ref types for managing arbitrary numbers of providers
export type ProviderRef<T> = {
  key: string;
  provider: T;
};

export interface CesiumContextType {
  widgetRef: MutableRefObject<CesiumWidget | null>;
  sceneRef: MutableRefObject<Scene | null>;

  // NOTE: Provider refs (terrain, imagery, tilesets, models) moved to CesiumSceneComponent
  // These are scene-owned resources, not context-level shared state

  // Core state refs
  isSuspendedRef: MutableRefObject<boolean>;
  homeCamera: MutableRefObject<CameraPoseRadians | null>;

  // Camera tracking - TWO separate states:
  // 1. currentCameraRef: Updated every frame for crash recovery and live display
  // 2. moveendCameraRef: Updated when camera stops moving (like Leaflet's moveend/zoomend)
  //    Used for URL hash updates and other actions triggered on camera settle
  currentCameraRef: MutableRefObject<CameraPrimitive | null>;
  moveendCameraRef: MutableRefObject<CameraPrimitive | null>;

  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;

  // Internal scene coordination (refs + callbacks, NOT event bus)
  // Scene updates these refs and registers callbacks on mount
  availableSceneStylesRef: MutableRefObject<string[]>;
  sceneStyleApplierRef: MutableRefObject<((styleId: string) => void) | null>;
  sceneCameraTrackerRef: MutableRefObject<
    ((action: "start" | "stop") => void) | null
  >;

  // Scene style readiness coordination (internal, ref-based)
  // SceneStyleManager reports when all resources for current style are loaded
  sceneStyleReadyStateRef: MutableRefObject<{
    currentStyle: string | null;
    isReady: boolean;
    requiredResources: string[];
    readyResources: string[];
  }>;
  sceneStyleReadyCallbackRef: MutableRefObject<
    ((isReady: boolean, styleId: string) => void) | null
  >;

  // Portal callback coordination (matches TopicMapContext pattern)
  // Portal registers callback to be notified of camera updates
  onCameraUpdate: (callback: () => void) => void;
  // Portal calls this to trigger fly home animation
  flyHome: () => void;

  // Scene initialization gate (synchronous validation)
  // Wrapper calls this to prepare refs before mounting scene
  // cameraState: Optional CameraPrimitive (internal Cesium format: position, direction, up, right, fov)
  prepareSceneInit: (
    style: string,
    cameraState?: CameraPrimitive | null
  ) => boolean;

  // Animation and transition state
  isAnimatingRef: MutableRefObject<boolean>;
  transitionStateRef: MutableRefObject<string | null>;
  suspendSSCCRef: MutableRefObject<boolean>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;

  // Render control
  requestRender: (opts?: DelayedRenderOptions) => void;
  animationMapRef: MutableRefObject<AnimationMap | null>;

  // FOV change callback for external consumers (e.g., ObliqueProvider overlay)
  // Note: This is NOT for Portal coordination, but for UI overlays that need FOV updates
  onFovChangeCallbackRef: MutableRefObject<((fov: number) => void) | null>;

  // Original config (immutable after initialization)
  config: CesiumConfig;

  // Cesium widget instance lifecycle history
  // Tracks each time a Cesium widget instance was created (3D mode activation)
  cesiumInstances: CesiumInstanceRecord[];
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
CesiumContext.displayName = "CesiumContext";
