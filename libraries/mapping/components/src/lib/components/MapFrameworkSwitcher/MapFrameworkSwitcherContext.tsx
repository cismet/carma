/**
 * MapFrameworkSwitcherContext - Centralized state management for 2D/3D map transitions
 *
 * This replaces app-specific Redux state (e.g., isMode2d) with a reusable context
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  startTransition,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import {
  CesiumTerrainProvider,
  type Scene,
  type SerializedCameraStateHeadingPitchRoll,
  waitForRenderFrames,
} from "@carma/cesium";

import {
  transitionToCesium,
  transitionToLeaflet,
  TransitionStage,
  type TransitionOptions,
} from "@carma-mapping/engines-interop/leaflet-cesium";
import { validateRequirements } from "./utils/validate-requirements";

export const CARMA_MAP_FRAMEWORKS = {
  LEAFLET: "leaflet",
  CESIUM: "cesium",
} as const;

type FrameworkMap = typeof CARMA_MAP_FRAMEWORKS;
export type CarmaMapFramework = FrameworkMap[keyof FrameworkMap];

/**
 * Per-engine state preservation for (partially) restoring last state if that was ephemeral
 * add more as needed
 */
export interface EngineState {
  cesium?: SerializedCameraStateHeadingPitchRoll;
}

export interface MapFrameworkSwitcherState {
  activeFramework: CarmaMapFramework;
  isTransitioning: boolean;
  isReady: boolean;
}

export interface MapFrameworkSwitcherRefs {
  getLeafletMap: () => LeafletMap | null | undefined;
  getCesiumScene: () => Scene | null | undefined;
  getCesiumContainer: () => HTMLElement | null | undefined;
  getCesiumTerrainProviders: () => {
    TERRAIN: CesiumTerrainProvider;
    SURFACE: CesiumTerrainProvider;
  };
}

export interface MapFrameworkSwitcherCallbacks {
  onEnsureCesiumReady?: () => Promise<void> | void;
  onBeforeTransitionToCesium?: () => Promise<void> | void;
  onAfterTransitionToCesium?: () => void;
  onLeafletViewSet?: (params: {
    center: { lat: number; lng: number };
    zoom: number;
  }) => void;
}

export interface MapFrameworkSwitcherContextValue {
  // State
  activeFramework: CarmaMapFramework;
  isTransitioning: boolean;
  isPreparingCesiumTransition: boolean;
  preparingCesiumMessage: string | null;
  isReady: boolean;

  // Computed helpers (no need to redefine everywhere)
  isLeaflet: boolean;
  isCesium: boolean;

  // Stable getters for use in callbacks (avoid recreating handlers on framework change)
  // These return current values without triggering re-renders when used in useCallback deps
  getActiveFramework: () => CarmaMapFramework;
  getIsLeaflet: () => boolean;
  getIsCesium: () => boolean;
  getIsTransitioning: () => boolean;

  // Actions
  setActiveFramework: (framework: CarmaMapFramework) => void;
  setActiveFrameworkCesium: () => void;
  setActiveFrameworkLeaflet: () => void;
  setIsTransitioning: (isTransitioning: boolean) => void;

  // Transition functions (built into context)
  requestTransitionToCesium: () => Promise<void>;
  requestTransitionToLeaflet: () => Promise<void>;
  toggle: () => Promise<void>;

  // Refs setup
  registerRefs: (refs: Partial<MapFrameworkSwitcherRefs>) => void;
  refs: MapFrameworkSwitcherRefs;

  registerCallbacks: (
    callbacks: Partial<MapFrameworkSwitcherCallbacks>
  ) => void;
}

const CESIUM_RUNTIME_READY_TIMEOUT_MS = 10_000;

const readHasLeafletRuntime = (refs: MapFrameworkSwitcherRefs): boolean =>
  Boolean(refs.getLeafletMap());

const readHasCesiumRuntime = (refs: MapFrameworkSwitcherRefs): boolean =>
  Boolean(refs.getCesiumScene() && refs.getCesiumContainer());

const readCanInitializeCesiumOnDemand = (
  callbacks: MapFrameworkSwitcherCallbacks
): boolean => Boolean(callbacks.onEnsureCesiumReady);

const readIsFrameworkSwitcherReady = ({
  activeFramework,
  refs,
  callbacks,
}: {
  activeFramework: CarmaMapFramework;
  refs: MapFrameworkSwitcherRefs;
  callbacks: MapFrameworkSwitcherCallbacks;
}): boolean => {
  const hasLeafletRuntime = readHasLeafletRuntime(refs);
  const hasCesiumRuntime = readHasCesiumRuntime(refs);

  if (activeFramework === CARMA_MAP_FRAMEWORKS.LEAFLET) {
    return (
      hasLeafletRuntime &&
      (hasCesiumRuntime || readCanInitializeCesiumOnDemand(callbacks))
    );
  }

  return hasLeafletRuntime && hasCesiumRuntime;
};

const waitForCesiumRuntime = async ({
  refsRef,
  timeoutMs = CESIUM_RUNTIME_READY_TIMEOUT_MS,
}: {
  refsRef: MutableRefObject<MapFrameworkSwitcherRefs>;
  timeoutMs?: number;
}): Promise<void> => {
  const startTimeMs = performance.now();

  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (readHasCesiumRuntime(refsRef.current)) {
        resolve();
        return;
      }

      if (performance.now() - startTimeMs >= timeoutMs) {
        reject(new Error("Timed out while waiting for Cesium runtime."));
        return;
      }

      window.requestAnimationFrame(tick);
    };

    tick();
  });
};

// ============================================================================
// Context
// ============================================================================

const MapFrameworkSwitcherContext =
  createContext<MapFrameworkSwitcherContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface MapFrameworkSwitcherProviderProps {
  children: ReactNode;
  initialFramework?: CarmaMapFramework;
  transitionOptions?: TransitionOptions;
}

export const MapFrameworkSwitcherProvider = ({
  children,
  initialFramework = CARMA_MAP_FRAMEWORKS.LEAFLET,
  transitionOptions = {},
}: MapFrameworkSwitcherProviderProps) => {
  // Core state
  const [activeFramework, setActiveFramework] =
    useState<CarmaMapFramework>(initialFramework);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPreparingCesiumTransition, setIsPreparingCesiumTransition] =
    useState(false);
  const [preparingCesiumMessage, setPreparingCesiumMessage] = useState<
    string | null
  >(null);
  const [isReady, setIsReady] = useState(false);

  // derived setters
  const setActiveFrameworkCesium = useCallback(
    () => setActiveFramework(CARMA_MAP_FRAMEWORKS.CESIUM),
    [setActiveFramework]
  );

  const setActiveFrameworkLeaflet = useCallback(
    () => setActiveFramework(CARMA_MAP_FRAMEWORKS.LEAFLET),
    [setActiveFramework]
  );

  // derived state
  const isCesium = activeFramework === CARMA_MAP_FRAMEWORKS.CESIUM;
  const isLeaflet = activeFramework === CARMA_MAP_FRAMEWORKS.LEAFLET;

  // Refs to track current state for stable getters
  const activeFrameworkRef = useRef(activeFramework);
  const isLeafletRef = useRef(isLeaflet);
  const isCesiumRef = useRef(isCesium);
  const isTransitioningRef = useRef(isTransitioning);
  const isPreparingCesiumTransitionRef = useRef(isPreparingCesiumTransition);

  // Keep refs in sync with state
  activeFrameworkRef.current = activeFramework;
  isLeafletRef.current = isLeaflet;
  isCesiumRef.current = isCesium;
  isTransitioningRef.current = isTransitioning;
  isPreparingCesiumTransitionRef.current = isPreparingCesiumTransition;

  // Refs for map engines and containers
  const refsRef = useRef<MapFrameworkSwitcherRefs>({
    getLeafletMap: () => null,
    getCesiumScene: () => null,
    getCesiumContainer: () => null,
    getCesiumTerrainProviders: () => ({
      TERRAIN: null as unknown as CesiumTerrainProvider,
      SURFACE: null as unknown as CesiumTerrainProvider,
    }),
  });

  // Refs for callbacks (rerender-free)
  const callbacksRef = useRef<MapFrameworkSwitcherCallbacks>({});
  const stagedCesiumSceneRef = useRef<Scene | null>(null);
  const cesiumStagingPromiseRef = useRef<Promise<void> | null>(null);

  const syncReadyState = useCallback(() => {
    const nowReady = readIsFrameworkSwitcherReady({
      activeFramework: activeFrameworkRef.current,
      refs: refsRef.current,
      callbacks: callbacksRef.current,
    });

    startTransition(() => {
      setIsReady((previous) => (previous === nowReady ? previous : nowReady));
    });
  }, []);

  // Register callbacks from app (rerender-free)
  const registerCallbacks = useCallback(
    (callbacks: Partial<MapFrameworkSwitcherCallbacks>) => {
      callbacksRef.current = {
        ...callbacksRef.current,
        ...callbacks,
      };
      syncReadyState();
    },
    [syncReadyState]
  );

  // Register refs from app (called by app-specific hooks)
  const registerRefs = useCallback(
    (refs: Partial<MapFrameworkSwitcherRefs>) => {
      refsRef.current = {
        ...refsRef.current,
        ...refs,
      };

      syncReadyState();

      // Apply initial visibility to Cesium container based on active framework
      // This is urgent visual feedback, keep outside startTransition
      const container = refsRef.current.getCesiumContainer();
      if (container) {
        if (isLeaflet) {
          container.style.opacity = "0";
          container.style.pointerEvents = "none";
        } else if (isCesium) {
          container.style.opacity = "1";
          container.style.pointerEvents = "auto";
        }
      }
    },
    [isLeaflet, isCesium, syncReadyState]
  );

  useEffect(() => {
    syncReadyState();
  }, [activeFramework, syncReadyState]);

  // Stable getter functions - NEVER change reference, safe to use in useCallback deps
  // These read from refs, so they always return current value without triggering re-renders
  const getActiveFramework = useCallback(() => activeFrameworkRef.current, []);
  const getIsLeaflet = useCallback(() => isLeafletRef.current, []);
  const getIsCesium = useCallback(() => isCesiumRef.current, []);
  const getIsTransitioning = useCallback(() => isTransitioningRef.current, []);

  // Track engine-specific state for transitions (e.g., camera orientation)
  const lastEngineStateRef = useRef<EngineState>({});

  const ensureCesiumSceneStaged = useCallback(async (scene: Scene) => {
    setIsPreparingCesiumTransition(true);
    setPreparingCesiumMessage("3D Modelle werden geladen");

    // Always allow app-level pre-transition staging for dynamic content
    // (for example adhoc models/primitives added while staying in 2D).
    const beforeTransition = callbacksRef.current.onBeforeTransitionToCesium;
    try {
      if (beforeTransition) {
        setPreparingCesiumMessage("3D Modelle werden geladen");
        await beforeTransition();
      }

      const isSameLiveScene =
        stagedCesiumSceneRef.current === scene && !scene.isDestroyed();
      if (isSameLiveScene) {
        console.debug("[FRAMEWORK-SWITCHER] Cesium scene already staged");
        return;
      }

      if (cesiumStagingPromiseRef.current) {
        await cesiumStagingPromiseRef.current;
        return;
      }

      const stagingPromise = (async () => {
        console.debug("[FRAMEWORK-SWITCHER] Cesium staging start");
        setPreparingCesiumMessage("3D Modelle werden geladen");
        // Ensure Cesium has completed a few render cycles before first fade/animation.
        await waitForRenderFrames(scene, 5);

        if (!scene.isDestroyed()) {
          stagedCesiumSceneRef.current = scene;
        }
        console.debug("[FRAMEWORK-SWITCHER] Cesium staging complete");
      })();

      cesiumStagingPromiseRef.current = stagingPromise;
      try {
        await stagingPromise;
      } finally {
        if (cesiumStagingPromiseRef.current === stagingPromise) {
          cesiumStagingPromiseRef.current = null;
        }
      }
    } finally {
      setIsPreparingCesiumTransition(false);
      setPreparingCesiumMessage(null);
    }
  }, []);

  // Transition to Cesium
  const requestTransitionToCesium = useCallback(async () => {
    if (isTransitioning || isPreparingCesiumTransitionRef.current) {
      console.warn(
        "[FRAMEWORK-SWITCHER] Cannot transition - not ready or already transitioning"
      );
      return;
    }

    if (
      !readIsFrameworkSwitcherReady({
        activeFramework: activeFrameworkRef.current,
        refs: refsRef.current,
        callbacks: callbacksRef.current,
      })
    ) {
      console.warn(
        "[FRAMEWORK-SWITCHER] Cannot transition - required runtimes are not available"
      );
      return;
    }

    try {
      let leaflet = refsRef.current.getLeafletMap();
      let scene = refsRef.current.getCesiumScene();
      let cesiumContainer = refsRef.current.getCesiumContainer();
      let terrainProviders = refsRef.current.getCesiumTerrainProviders();

      if (
        (!scene || !cesiumContainer) &&
        callbacksRef.current.onEnsureCesiumReady
      ) {
        try {
          setIsPreparingCesiumTransition(true);
          setPreparingCesiumMessage("3D Ansicht wird initialisiert");
          await callbacksRef.current.onEnsureCesiumReady();
          await waitForCesiumRuntime({ refsRef });
        } finally {
          setIsPreparingCesiumTransition(false);
          setPreparingCesiumMessage(null);
        }

        leaflet = refsRef.current.getLeafletMap();
        scene = refsRef.current.getCesiumScene();
        cesiumContainer = refsRef.current.getCesiumContainer();
        terrainProviders = refsRef.current.getCesiumTerrainProviders();
      }

      const hasValidRequirements = validateRequirements(
        scene,
        cesiumContainer,
        leaflet
      );

      if (!hasValidRequirements) {
        console.warn(
          "[CESIUM] [CESIUM|2D3D|TO3D] leaflet or cesium not available no transition possible [zoom]"
        );
        return;
      }

      // Explicit first-request staging step (and scene-change restaging) before transition starts.
      await ensureCesiumSceneStaged(scene);

      // Keep a short preflight wait for every 2D->3D transition attempt.
      await waitForRenderFrames(scene, 2);

      setIsTransitioning(true);

      await transitionToCesium(
        scene,
        leaflet,
        cesiumContainer,
        terrainProviders,
        lastEngineStateRef.current.cesium,
        {
          onStageChange: () => {
            // required by transition callback contract
          },
          onComplete: () => {
            setActiveFrameworkCesium();
            setIsTransitioning(false);
            callbacksRef.current.onAfterTransitionToCesium?.();
          },
          onError: (error: Error) => {
            console.error("[CESIUM] Transition error:", error);
            // Fall back to Leaflet since we assume it's always available
            setActiveFrameworkLeaflet();
            setIsTransitioning(false);
          },
        },
        transitionOptions?.toCesium || {}
      );
    } catch (error) {
      console.error("[CESIUM] Transition to 3D failed:", error);
      setIsTransitioning(false);
      setActiveFrameworkLeaflet();
    }
  }, [
    ensureCesiumSceneStaged,
    isTransitioning,
    setActiveFrameworkCesium,
    setActiveFrameworkLeaflet,
    transitionOptions,
  ]);

  // Transition to Leaflet
  const requestTransitionToLeaflet = useCallback(async () => {
    if (isTransitioning || !isReady) {
      console.warn(
        "[FRAMEWORK-SWITCHER] Cannot transition - not ready or already transitioning"
      );
      return;
    }

    const scene = refsRef.current.getCesiumScene();
    const leaflet = refsRef.current.getLeafletMap();
    const cesiumContainer = refsRef.current.getCesiumContainer();
    const terrainProviders = refsRef.current.getCesiumTerrainProviders();

    const hasValidRequirements = validateRequirements(
      scene,
      cesiumContainer,
      leaflet
    );

    if (!hasValidRequirements) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO3D] leaflet or cesium not available no transition possible [zoom]"
      );
      return;
    }

    try {
      // Wait for Cesium to complete render cycles after React re-renders
      // This ensures WebGL state is stable before picking operations
      // See: https://github.com/CesiumGS/cesium/issues/11427
      // pickTranslucentDepth can cause "destroyed object" errors during tile processing
      await waitForRenderFrames(scene, 2);

      setIsTransitioning(true);

      const lastCameraState = await transitionToLeaflet(
        scene,
        leaflet,
        cesiumContainer,
        terrainProviders,
        {
          onStageChange: (stage: TransitionStage, message: string) => {
            console.debug(`[CESIUM] Transition stage: ${stage} - ${message}`);
          },
          onComplete: () => {
            setActiveFrameworkLeaflet();
            setIsTransitioning(false);
          },
          onError: (error: Error) => {
            console.error("[CESIUM] Transition error:", error);
            // CRITICAL: Assume Leaflet is always available as fallback
            // The error handler in transitionToLeaflet hides Cesium and falls back to Leaflet
            setActiveFrameworkLeaflet();
            setIsTransitioning(false);
          },
          onLeafletViewSet: callbacksRef.current.onLeafletViewSet,
        },
        transitionOptions?.toLeaflet || {}
      );

      // Store cesium camera state for when we return to 3D
      if (lastCameraState) {
        lastEngineStateRef.current.cesium = lastCameraState;
      }
    } catch (error) {
      console.error("[CESIUM] Transition to Leaflet failed:", error);
      setIsTransitioning(false);
      // CRITICAL: Fall back to Leaflet since we assume it's always available
      // The container has already been hidden by the error handler
      setActiveFrameworkLeaflet();
    }
  }, [isTransitioning, isReady, setActiveFrameworkLeaflet, transitionOptions]);

  // Toggle between frameworks
  const toggle = useCallback(async () => {
    if (isLeaflet) {
      console.debug("toggle transition to Cesium requested");
      await requestTransitionToCesium();
    } else if (isCesium) {
      console.debug("toggle transition to Leaflet requested");
      await requestTransitionToLeaflet();
    }
  }, [
    isLeaflet,
    isCesium,
    requestTransitionToCesium,
    requestTransitionToLeaflet,
  ]);

  const value: MapFrameworkSwitcherContextValue = useMemo(
    () => ({
      activeFramework,
      isTransitioning,
      isPreparingCesiumTransition,
      preparingCesiumMessage,
      isReady,
      // Computed helpers
      isLeaflet,
      isCesium,
      // Stable getters
      getActiveFramework,
      getIsLeaflet,
      getIsCesium,
      getIsTransitioning,
      setActiveFramework,
      setActiveFrameworkCesium,
      setActiveFrameworkLeaflet,
      setIsTransitioning,
      // Transition functions
      requestTransitionToCesium,
      requestTransitionToLeaflet,
      toggle,
      registerRefs,
      registerCallbacks,
      refs: refsRef.current,
    }),
    [
      activeFramework,
      isTransitioning,
      isPreparingCesiumTransition,
      preparingCesiumMessage,
      isReady,
      isLeaflet,
      isCesium,
      getActiveFramework,
      getIsLeaflet,
      getIsCesium,
      getIsTransitioning,
      setActiveFramework,
      setActiveFrameworkCesium,
      setActiveFrameworkLeaflet,
      setIsTransitioning,
      requestTransitionToCesium,
      requestTransitionToLeaflet,
      toggle,
      registerRefs,
      registerCallbacks,
    ]
  );

  return (
    <MapFrameworkSwitcherContext.Provider value={value}>
      {children}
    </MapFrameworkSwitcherContext.Provider>
  );
};

// ============================================================================
// Consumer Hook
// ============================================================================

export const useMapFrameworkSwitcherContext = () => {
  const context = useContext(MapFrameworkSwitcherContext);
  if (!context) {
    throw new Error(
      "useMapFrameworkSwitcherContext must be used within MapFrameworkSwitcherProvider"
    );
  }
  return context;
};
