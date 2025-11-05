/**
 * MapFrameworkSwitcherContext - Centralized state management for 2D/3D map transitions
 *
 * This replaces app-specific Redux state (e.g., isMode2d) with a reusable context
 * that works across any app using Leaflet ↔ Cesium transitions.
 */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, type Scene } from "@carma/cesium";
import type { Radians } from "@carma/units/types";

import {
  transitionToCesium,
  transitionToLeaflet,
  TransitionStage,
} from "@carma-mapping/engines-interop";
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
  cesium?: {
    heading: Radians;
    pitch: Radians;
  };
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
  getResolutionScale: () => number | undefined;
}

export interface MapFrameworkSwitcherContextValue {
  // State
  activeFramework: CarmaMapFramework;
  isTransitioning: boolean;
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
}

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
}

export const MapFrameworkSwitcherProvider = ({
  children,
  initialFramework = CARMA_MAP_FRAMEWORKS.LEAFLET,
}: MapFrameworkSwitcherProviderProps) => {
  // Core state
  const [activeFramework, setActiveFramework] =
    useState<CarmaMapFramework>(initialFramework);
  const [isTransitioning, setIsTransitioning] = useState(false);
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

  // Keep refs in sync with state
  activeFrameworkRef.current = activeFramework;
  isLeafletRef.current = isLeaflet;
  isCesiumRef.current = isCesium;
  isTransitioningRef.current = isTransitioning;

  // Refs for map engines and containers
  const refsRef = useRef<MapFrameworkSwitcherRefs>({
    getLeafletMap: () => null,
    getCesiumScene: () => null,
    getCesiumContainer: () => null,
    getCesiumTerrainProviders: () => ({
      TERRAIN: null as unknown as CesiumTerrainProvider,
      SURFACE: null as unknown as CesiumTerrainProvider,
    }),
    getResolutionScale: () => undefined,
  });

  // Register refs from app (called by app-specific hooks)
  const registerRefs = useCallback(
    (refs: Partial<MapFrameworkSwitcherRefs>) => {
      refsRef.current = {
        ...refsRef.current,
        ...refs,
      };

      // Check if all required refs are now available
      const nowReady =
        !!refsRef.current.getLeafletMap() &&
        !!refsRef.current.getCesiumScene() &&
        !!refsRef.current.getCesiumContainer();

      setIsReady(nowReady);

      // Apply initial visibility to Cesium container based on active framework
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

      console.log("[FRAMEWORK-SWITCHER-CONTEXT] Refs registered:", {
        hasLeafletMap: !!refsRef.current.getLeafletMap(),
        hasCesiumScene: !!refsRef.current.getCesiumScene(),
        hasCesiumContainer: !!refsRef.current.getCesiumContainer(),
        containerVisibility: isLeaflet ? "hidden" : "visible",
        nowReady,
      });
    },
    [isLeaflet, isCesium]
  );

  // Stable getter functions - NEVER change reference, safe to use in useCallback deps
  // These read from refs, so they always return current value without triggering re-renders
  const getActiveFramework = useCallback(() => activeFrameworkRef.current, []);
  const getIsLeaflet = useCallback(() => isLeafletRef.current, []);
  const getIsCesium = useCallback(() => isCesiumRef.current, []);
  const getIsTransitioning = useCallback(() => isTransitioningRef.current, []);

  // Track engine-specific state for transitions (e.g., camera orientation)
  const lastEngineStateRef = useRef<EngineState>({});

  // Transition to Cesium
  const requestTransitionToCesium = useCallback(async () => {
    if (isTransitioning || !isReady) {
      console.warn(
        "[FRAMEWORK-SWITCHER] Cannot transition - not ready or already transitioning"
      );
      return;
    }

    const leaflet = refsRef.current.getLeafletMap();
    const scene = refsRef.current.getCesiumScene();
    const cesiumContainer = refsRef.current.getCesiumContainer();
    const resolutionScale = refsRef.current.getResolutionScale();
    const terrainProviders = refsRef.current.getCesiumTerrainProviders();

    const hasValidRequirements = validateRequirements(
      scene,
      cesiumContainer,
      resolutionScale,
      leaflet
    );

    if (!hasValidRequirements) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO3D] leaflet or cesium not available no transition possible [zoom]"
      );
      return;
    }

    try {
      setIsTransitioning(true);

      await transitionToCesium(
        scene,
        leaflet,
        cesiumContainer,
        resolutionScale || 1.0,
        terrainProviders,
        lastEngineStateRef.current.cesium,
        (stage: TransitionStage, message: string) => {
          console.debug(`[CESIUM] Transition stage: ${stage} - ${message}`);
        },
        () => {
          setActiveFrameworkCesium();
          setIsTransitioning(false);
        },
        (error: Error) => {
          console.error("[CESIUM] Transition error:", error);
          setIsTransitioning(false);
        }
      );
    } catch (error) {
      console.error("[CESIUM] Transition to 3D failed:", error);
      setIsTransitioning(false);
      setActiveFrameworkLeaflet();
    }
  }, [
    isTransitioning,
    isReady,
    setActiveFrameworkCesium,
    setActiveFrameworkLeaflet,
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
    const resolutionScale = refsRef.current.getResolutionScale();
    const terrainProviders = refsRef.current.getCesiumTerrainProviders();

    const hasValidRequirements = validateRequirements(
      scene,
      cesiumContainer,
      resolutionScale,
      leaflet
    );

    if (!hasValidRequirements) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO3D] leaflet or cesium not available no transition possible [zoom]"
      );
      return;
    }

    try {
      setIsTransitioning(true);

      const result = await transitionToLeaflet(
        scene,
        leaflet,
        cesiumContainer,
        resolutionScale || 1.0,
        terrainProviders,
        (stage: TransitionStage, message: string) => {
          console.debug(`[CESIUM] Transition stage: ${stage} - ${message}`);
        },
        () => {
          setActiveFrameworkLeaflet();
          setIsTransitioning(false);
        },
        (error: Error) => {
          console.error("[CESIUM] Transition error:", error);
          setIsTransitioning(false);
        }
      );

      // Store cesium camera state for when we return to 3D
      if (result.targetHeadingPitch) {
        lastEngineStateRef.current.cesium = {
          heading: result.targetHeadingPitch.heading as Radians,
          pitch: result.targetHeadingPitch.pitch as Radians,
        };
      }
    } catch (error) {
      console.error("[CESIUM] Transition to Leaflet failed:", error);
      setIsTransitioning(false);
      setActiveFrameworkCesium();
    }
  }, [
    isTransitioning,
    isReady,
    setActiveFrameworkCesium,
    setActiveFrameworkLeaflet,
  ]);

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

  const value: MapFrameworkSwitcherContextValue = {
    activeFramework,
    isTransitioning,
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
    refs: refsRef.current,
  };

  console.log("[FRAMEWORK-SWITCHER-CONTEXT] Provider render:", {
    activeFramework,
    isTransitioning,
    isReady,
    hasToggle: !!toggle,
  });

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
