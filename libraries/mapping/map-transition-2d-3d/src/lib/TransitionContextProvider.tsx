import { useMemo, useRef, type ReactNode } from "react";

import {
  TransitionContext,
  type TransitionContextType,
  type TransitionConfig,
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
}

/**
 * Minimal transition context provider - just config and isTransitioning flag
 * All transition logic lives in transition-to-2d.ts and transition-to-3d.ts
 */
export const TransitionContextProvider = ({
  children,
  config = {},
}: TransitionContextProviderProps) => {
  const isTransitioningRef = useRef<boolean>(false);

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
    }),
    [mergedConfig]
  );

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export default TransitionContextProvider;
