import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";

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

  // Get initial mode from Cesium suspension state (suspended = 2d, active = 3d)
  const initialMode = useMemo(() => {
    return isCesiumSuspended ?? true ? "2d" : "3d";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [currentMode, setCurrentMode] = useState<"2d" | "3d">(initialMode);

  // Extract getContainer from Cesium engine and create fade-in function
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
      currentMode,
      setCurrentMode,
      onCesiumFadeInRef,

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
