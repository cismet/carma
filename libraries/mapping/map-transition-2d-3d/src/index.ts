export {
  TransitionContext,
  MapTransitionState,
  type TransitionContextType,
  type MapTransitionLifecycle,
} from "./lib/TransitionContext";

export {
  TransitionContextProvider,
  type TransitionContextProviderProps,
} from "./lib/TransitionContextProvider";

export { useTransitionContext } from "./lib/useTransitionContext";

export {
  TransitionCtxEvent,
  type TransitionContextEventMap,
  type SubscribeTransitionCtxFn,
  type EmitTransitionCtxFn,
} from "./lib/transitionContextEventMap";

// Re-export helper functions
export {
  addMapTransitionLifecycleHandler,
  runTransitionLifecycleHandlers,
} from "./lib/transitionLifecycleHelpers";

// Main transition hook
export {
  useMapTransition,
  isTransitionState,
  shouldBlockUserInput,
} from "./lib/useMapTransition";

// High-level mode toggle hook
export {
  useMapModeToggle,
  type MapModeToggleOptions,
} from "./lib/useMapModeToggle";
