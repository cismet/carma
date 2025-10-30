import { useRef, useState, useEffect, useMemo, type ReactNode } from "react";

import {
  type TransitionConfig,
} from "@carma-mapping/map-transition-2d-3d";

import {
  TransitionContext,
  type TransitionContextType,
  type GetEnginesFn,
  type UpdateEngineFn,
} from "./TransitionContext";

const DEFAULT_TRANSITION_CONFIG: Required<TransitionConfig> = {
  modeTo3d: {
    step1_prepare2dViewMaxZoom: 20,
    step1_zoomOutDurationMs: 700,
    step2_initialRenderTimeoutMs: 500,
    step3_resourceWaitTimeoutMs: 2000,
    step4_fallbackGroundElevationM: 10000,
    step5_cssFadeInDurationMs: 1000,
    step6_cameraAnimationDurationMs: 2000,
  },
  modeTo2d: {
    step2_cameraTiltDurationFactorDeviationMs: 1.5,
    step2_cameraTiltDurationFactorZoomMs: 500,
    step2_cameraTiltMaxDurationMs: 2000,
    step3_cssFadeOutDurationMs: 1000,
  },
};

export interface TransitionContextProviderProps {
  children: ReactNode;
  config?: TransitionConfig;

  // Engine state management - injected from portal layer (PURE ENGINES PARADIGM)
  getEngines: GetEnginesFn;
  updateEngine: UpdateEngineFn;

  // Optional - for determining initial mode
  isCesiumSuspended?: boolean;
}

/**
 * Transition context provider with config, mode state, and callback registrations
 * Uses PURE ENGINES PARADIGM - instances accessed via getEngines()
 * All transition logic lives in transition-to-2d.ts and transition-to-3d.ts
 */
export const TransitionContextProvider = ({
  children,
  config = {},
  getEngines,
  updateEngine,
  isCesiumSuspended,
}: TransitionContextProviderProps) => {
  const isTransitioningRef = useRef<boolean>(false);
  const onCesiumFadeInRef = useRef<(() => void) | null>(null);
  const onCesiumFadeOutRef = useRef<(() => void) | null>(null);

  // Derive currentMode from engine suspension state (single source of truth)
  // Use state to make it reactive to engine updates
  const [currentMode, setCurrentMode] = useState<"2d" | "3d">(() => {
    const engines = getEngines();
    const cesiumEngine = engines.find(e => e.engine === "cesium3d");
    const isCesiumActive = cesiumEngine?.isSuspended === false;
    return isCesiumActive ? "3d" : "2d";
  });

  // Poll engine state and update currentMode when suspension changes
  useEffect(() => {
    const checkEngineState = () => {
      const engines = getEngines();
      const cesiumEngine = engines.find(e => e.engine === "cesium3d");
      const isCesiumActive = cesiumEngine?.isSuspended === false;
      const newMode = isCesiumActive ? "3d" : "2d";
      
      if (newMode !== currentMode) {
        console.log(`[TransitionContext] Mode changed: ${currentMode} → ${newMode}`);
        setCurrentMode(newMode);
      }
    };

    // Check immediately
    checkEngineState();

    // Poll every 100ms to detect engine state changes
    // This ensures UI updates even if context doesn't get notified directly
    const interval = setInterval(checkEngineState, 100);
    return () => clearInterval(interval);
  }, [getEngines, currentMode]);

  // Extract getContainer from Cesium engine and create fade-in/out functions
  useEffect(() => {
    const engines = getEngines();
    const cesiumEngine = engines.find(e => e.engine === "cesium3d") as any;
    if (cesiumEngine?.getContainer) {
      onCesiumFadeInRef.current = () => {
        const container = cesiumEngine.getContainer();
        if (container) {
          // Trigger CSS fade-in by setting opacity to 1
          container.style.opacity = '1';
        }
      };
      onCesiumFadeOutRef.current = () => {
        const container = cesiumEngine.getContainer();
        if (container) {
          // Trigger CSS fade-out by setting opacity to 0
          container.style.opacity = '0';
        }
      };
    }
  }, [getEngines]);

  const mergedConfig = useMemo<Required<TransitionConfig>>(
    () => ({
      modeTo3d: {
        ...DEFAULT_TRANSITION_CONFIG.modeTo3d,
        ...config.modeTo3d,
      },
      modeTo2d: {
        ...DEFAULT_TRANSITION_CONFIG.modeTo2d,
        ...config.modeTo2d,
      },
    }),
    [config]
  );

  const contextValue = useMemo<TransitionContextType>(
    () => ({
      config: mergedConfig,
      isTransitioningRef,
      currentMode, // Derived, updates automatically when engine suspension changes
      onCesiumFadeInRef,
      onCesiumFadeOutRef,

      // Engine state management - pass through from portal layer (PURE ENGINES PARADIGM)
      getEngines,
      updateEngine,
    }),
    [mergedConfig, currentMode, getEngines, updateEngine]
  );

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export default TransitionContextProvider;
