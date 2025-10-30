import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  Camera,
  captureCurrentCameraState,
  type CameraState,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import {
  CesiumContext,
  type CesiumContextType,
  type CesiumInstanceRecord,
} from "./CesiumContext";
import { setupCesiumEnvironment } from "../scene/environment";

// Event bus hooks removed - using direct refs and callbacks instead

import type { CesiumConfig } from "@carma/cesium/types";
import type { AnimationMap } from "@carma/types";

import { initAnimationMap } from "../scene/camera/animations";
import { sceneRequestRender } from "../scene/scene-request-render";
import { validateSceneStyle } from "./validation";

/**
 * CesiumContextProvider Architecture Rules
 *
 * ## No Re-renders Paradigm
 * - Provider uses refs and callbacks exclusively - NO state changes that cause re-renders
 * - Config is STATIC after initialization - should never change during component lifetime
 * - All dynamic values stored in refs (sceneRef, cameraRef, etc.)
 * - Context value is memoized and stable
 *
 * ## Scene Initialization Flow (2D → 3D Transition)
 *
 * ### Portal Must Set Prerequisites BEFORE Scene Activation
 * 
 **/

export type CesiumContextProviderProps = {
  children: ReactNode;
  config: CesiumConfig;
};

export const CesiumContextProvider = ({
  children,
  config,
}: CesiumContextProviderProps): React.ReactElement => {
  // Auto-setup Cesium environment if not already done
  // This ensures window.CESIUM_BASE_URL is set without requiring app-level setup
  if (
    !(window as typeof window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL
  ) {
    setupCesiumEnvironment(config);
  }

  const { screenSpaceCameraController } = config;

  // Remount key for error recovery - incrementing this will force widget re-initialization
  const [remountKey] = useState(0);

  // Use refs for Cesium instances to prevent re-renders
  const widgetRef = useRef<CesiumWidget | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const animationMapRef = useRef<AnimationMap | null>(initAnimationMap());

  // Camera state tracking - TWO separate refs:
  // 1. currentCameraRef: Updated every frame for crash recovery and live display
  // is CameraStateHeadingPitchRoll.rad when set from init
  const cameraRef = useRef<CameraState | null>(null);
  // 2. moveendCameraRef: Updated when camera stops moving (like Leaflet moveend)
  const moveendCameraRef = useRef<CameraState | null>(null);

  // Current scene style ID (e.g., "lod2", "mesh-2024")
  // Portal must set this BEFORE scene initialization
  // Scene reads this value on mount to apply initial style
  const currentSceneStyleRef = useRef<string | undefined>(undefined);

  // Internal scene coordination: Scene updates these refs on mount
  // Available style IDs from scene configuration
  const availableSceneStylesRef = useRef<string[]>([]);

  // Scene registers its style applier function here
  // Context calls this when external consumers emit SetSceneStyle/ToggleSceneStyle events
  const sceneStyleApplierRef = useRef<((styleId: string) => void) | null>(null);

  // Scene registers its camera tracker function here
  // Context can call this to start/stop camera tracking
  const sceneCameraTrackerRef = useRef<
    ((action: "start" | "stop") => void) | null
  >(null);

  // Scene style readiness coordination (internal, ref-based)
  // SceneStyleManager reports when all resources for current style are loaded
  const sceneStyleReadyStateRef = useRef<{
    currentStyle: string | null;
    isReady: boolean;
    requiredResources: string[];
    readyResources: string[];
  }>({
    currentStyle: null,
    isReady: false,
    requiredResources: [],
    readyResources: [],
  });

  // Accessors created using helper pattern

  // Callback for context to receive style ready notifications from SceneStyleManager
  // Context can use this to coordinate transitions
  const sceneStyleReadyCallbackRef = useRef<
    ((isReady: boolean, styleId: string) => void) | null
  >((isReady: boolean, styleId: string) => {
    console.log(
      "[CesiumContext|StyleReady] Style readiness callback:",
      styleId,
      isReady
    );
  });

  // Callback accessor created using helper pattern

  // Animation state - internal to Cesium, exposed via getter/setter
  const isAnimatingRef = useRef(false);

  // Other state refs removed - now managed by PortalContext or transition provider
  // - transitionStateRef -> transition provider logic
  // - suspendSSCCRef, shouldSuspendPitchLimiterRef, shouldSuspendCameraLimitersRef -> removed for now

  // Camera controller settings from config
  const minZoomDistanceRef = useRef<number>(
    screenSpaceCameraController?.minimumZoomDistance ?? 1
  );
  const maxZoomDistanceRef = useRef<number>(
    screenSpaceCameraController?.maximumZoomDistance ?? 20000
  );
  const enableCollisionDetectionRef = useRef<boolean>(
    screenSpaceCameraController?.enableCollisionDetection ?? true
  );

  // Config validation removed - using direct refs and callbacks instead

  // Camera tracking moved to PortalContext - no refs needed here

  // Cesium widget instance lifecycle history
  // Tracks each time a Cesium widget instance was created (3D mode activation)
  const [cesiumInstances] = useState<CesiumInstanceRecord[]>([]);

  // Manual getter/setter methods for all refs
  const getCurrentSceneStyle = useCallback(() => currentSceneStyleRef.current, []);
  const setCurrentSceneStyle = useCallback((style: string | undefined) => {
    currentSceneStyleRef.current = style;
  }, []);

  const getAvailableSceneStyles = useCallback(() => availableSceneStylesRef.current, []);
  const setAvailableSceneStyles = useCallback((styles: string[]) => {
    availableSceneStylesRef.current = styles;
  }, []);

  const getSceneStyleApplier = useCallback(() => sceneStyleApplierRef.current, []);
  const setSceneStyleApplier = useCallback((applier: ((styleId: string) => void) | null) => {
    sceneStyleApplierRef.current = applier;
  }, []);

  const getSceneCameraTracker = useCallback(() => sceneCameraTrackerRef.current, []);
  const setSceneCameraTracker = useCallback((tracker: ((action: "start" | "stop") => void) | null) => {
    sceneCameraTrackerRef.current = tracker;
  }, []);

  const getSceneStyleReadyState = useCallback(() => sceneStyleReadyStateRef.current, []);
  const setSceneStyleReadyState = useCallback((state: {
    currentStyle: string | null;
    isReady: boolean;
    requiredResources: string[];
    readyResources: string[];
  }) => {
    sceneStyleReadyStateRef.current = state;
  }, []);

  const getSceneStyleReadyCallback = useCallback(() => sceneStyleReadyCallbackRef.current, []);
  const setSceneStyleReadyCallback = useCallback((callback: ((isReady: boolean, styleId: string) => void) | null) => {
    sceneStyleReadyCallbackRef.current = callback;
  }, []);

  const getIsAnimating = useCallback(() => isAnimatingRef.current, []);
  const setIsAnimating = useCallback((value: boolean) => {
    isAnimatingRef.current = value;
  }, []);

  // Camera getters/setters with specialized handling for Camera instances
  const getCamera = useCallback(() => cameraRef.current, []);
  const setCamera = useCallback((cameraOrCameraState: CameraState | Camera | null) => {
    if (cameraOrCameraState instanceof Camera) {
      cameraRef.current = captureCurrentCameraState(cameraOrCameraState, true);
    } else {
      cameraRef.current = cameraOrCameraState;
    }
  }, []);

  const getMoveEndCamera = useCallback(() => moveendCameraRef.current, []);
  const setMoveEndCamera = useCallback((cameraOrCameraState: CameraState | Camera | null) => {
    if (cameraOrCameraState instanceof Camera) {
      moveendCameraRef.current = captureCurrentCameraState(cameraOrCameraState, true);
    } else {
      moveendCameraRef.current = cameraOrCameraState;
    }
  }, []);

  // Portal callback coordination (matches TopicMapContext pattern)
  const onCameraUpdateRef = useRef<(() => void) | null>(null);
  const onFovChangeCallbackRef = useRef<((fov: number) => void) | null>(null);

  // Portal scene ready callback - Portal sets this to be notified when scene initializes
  const onSceneReadyCallbackRef = useRef<(() => void) | null>(null);
  const hasNotifiedSceneReadyRef = useRef(false);

  // Notify portal when scene is ready
  useEffect(() => {
    if (
      sceneRef.current &&
      !sceneRef.current.isDestroyed() &&
      !hasNotifiedSceneReadyRef.current &&
      onSceneReadyCallbackRef.current
    ) {
      console.log("[CesiumContext] Scene ready - notifying portal");
      hasNotifiedSceneReadyRef.current = true;
      const callback = onSceneReadyCallbackRef.current;
      onSceneReadyCallbackRef.current = null; // Clear after calling
      callback();
    }
  });

  // Camera tracking moved to CesiumSceneComponent (scene-level hook)
  // Scene component now updates context's currentCameraRef

  const requestRender = useCallback(() => {
    sceneRef.current && sceneRequestRender(sceneRef.current);
  }, [sceneRef]);

  // Portal callback setter - Portal registers its callback here
  const onCameraUpdate = useCallback((callback: () => void) => {
    onCameraUpdateRef.current = callback;
    console.log("[CesiumContext] Camera update callback registered");
  }, []);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      widgetRef,
      sceneRef,
      minZoomDistanceRef,
      maxZoomDistanceRef,
      enableCollisionDetectionRef,
      getCurrentSceneStyle,
      setCurrentSceneStyle,
      getAvailableSceneStyles,
      setAvailableSceneStyles,
      getSceneStyleApplier,
      setSceneStyleApplier,
      getSceneCameraTracker,
      setSceneCameraTracker,
      getSceneStyleReadyState,
      setSceneStyleReadyState,
      getSceneStyleReadyCallback,
      setSceneStyleReadyCallback,
      getIsAnimating,
      setIsAnimating,
      getCamera,
      setCamera,
      getMoveEndCamera,
      setMoveEndCamera,
      onCameraUpdate,
      requestRender,
      animationMapRef,
      onFovChangeCallbackRef,
      onSceneReadyCallbackRef,
      config,
      cesiumInstances,
    }),
    [
      getCurrentSceneStyle,
      setCurrentSceneStyle,
      getAvailableSceneStyles,
      setAvailableSceneStyles,
      getSceneStyleApplier,
      setSceneStyleApplier,
      getSceneCameraTracker,
      setSceneCameraTracker,
      getSceneStyleReadyState,
      setSceneStyleReadyState,
      getSceneStyleReadyCallback,
      setSceneStyleReadyCallback,
      getIsAnimating,
      setIsAnimating,
      getCamera,
      setCamera,
      getMoveEndCamera,
      setMoveEndCamera,
      onCameraUpdate,
      requestRender,
      config,
      cesiumInstances,
    ]
  );

  // Auto-recovery from Cesium errors - using direct refs instead of event bus

  // Reduced logging - only log on actual prop changes
  const prevConfigRef = useRef(config);
  if (prevConfigRef.current !== config) {
    console.debug("CesiumContextProvider Config changed");
    prevConfigRef.current = config;
  }

  return (
    <CesiumContext.Provider value={contextValue} key={remountKey}>
      {children}
    </CesiumContext.Provider>
  );
};

export default React.memo(CesiumContextProvider);
