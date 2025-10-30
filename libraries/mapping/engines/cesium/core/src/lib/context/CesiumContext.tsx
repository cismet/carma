import { createContext, type MutableRefObject } from "react";
import type {
  CesiumWidget,
  Scene,
  CameraState,
  Camera,
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
  cameraState?: CameraState;
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

  // Camera tracking - handled by PortalContext
  // Note: Suspension state is now managed by PortalContext, not here
  // moveendCameraRef: Updated when camera stops moving (like Leaflet's moveend/zoomend)
  //    Used for URL hash updates and other actions triggered on camera settle
  getMoveEndCamera: () => CameraState | null;
  setMoveEndCamera: (camera: CameraState | null) => void;
  getCamera: () => CameraState | null;
  setCamera: (cameraOrCameraState: CameraState | Camera) => void;

  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;

  // Internal scene coordination (getters/setters)
  getCurrentSceneStyle: () => string | undefined;
  setCurrentSceneStyle: (style: string | undefined) => void;
  getAvailableSceneStyles: () => string[];
  setAvailableSceneStyles: (styles: string[]) => void;
  getSceneStyleApplier: () => ((styleId: string) => void) | null;
  setSceneStyleApplier: (applier: ((styleId: string) => void) | null) => void;
  getSceneCameraTracker: () => ((action: "start" | "stop") => void) | null;
  setSceneCameraTracker: (tracker: ((action: "start" | "stop") => void) | null) => void;
  getSceneStyleReadyState: () => {
    currentStyle: string | null;
    isReady: boolean;
    requiredResources: string[];
    readyResources: string[];
  };
  setSceneStyleReadyState: (state: {
    currentStyle: string | null;
    isReady: boolean;
    requiredResources: string[];
    readyResources: string[];
  }) => void;
  getSceneStyleReadyCallback: () => ((isReady: boolean, styleId: string) => void) | null;
  setSceneStyleReadyCallback: (callback: ((isReady: boolean, styleId: string) => void) | null) => void;

  // Portal callback coordination (matches TopicMapContext pattern)
  // Portal registers callback to be notified of camera updates
  onCameraUpdate: (callback: () => void) => void;

  // Portal callback registration for scene ready notification
  // Portal sets this callback to be notified when scene initializes
  onSceneReadyCallbackRef: MutableRefObject<(() => void) | null>;

  // Animation state - internal to Cesium, exposed via getter/setter (not ref)
  getIsAnimating: () => boolean;
  setIsAnimating: (value: boolean) => void;

  // Other state removed - now managed by PortalContext/transition provider
  // - transitionStateRef -> transition provider logic
  // - suspendSSCCRef, shouldSuspendPitchLimiterRef, shouldSuspendCameraLimitersRef -> removed

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
