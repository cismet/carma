import { useMemo, useRef, type ReactNode } from "react";
import { createEventBus } from "@carma/providers/event-bus";

import {
  TransitionContext,
  MapTransitionState,
  type TransitionContextType,
} from "./TransitionContext";
import type { TransitionContextEventMap } from "./transition-context-event-map";

export interface TransitionContextProviderProps {
  children: ReactNode;
}

/**
 * Provides transition coordination context for 2D/3D map transitions.
 * Manages transition state and emits/subscribes to transition events.
 *
 * NOTE: CesiumContext also exposes transitionStateRef and transitionLifecycleRef.
 * This is intentional to avoid circular dependencies:
 * - TransitionContext (here) is the source of truth for transition logic
 * - CesiumContext exposes refs for Cesium-specific hooks
 * - useMapTransition synchronizes between both contexts
 *
 * See CesiumContextProvider for detailed explanation.
 */
export const TransitionContextProvider = ({
  children,
}: TransitionContextProviderProps) => {
  const transitionStateRef = useRef<MapTransitionState>(
    MapTransitionState.mode2d
  );
  const transitionLifecycleRef = useRef({});

  // Event bus for the Transition context
  const { subscribe, emit } = useMemo(
    () => createEventBus<TransitionContextEventMap>(),
    []
  );

  const contextValue = useMemo<TransitionContextType>(
    () => ({
      transitionStateRef,
      transitionLifecycleRef,
      subscribe,
      emit,
    }),
    [subscribe, emit]
  );

  console.debug("[TransitionContextProvider] Rendered", contextValue);

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export default TransitionContextProvider;
