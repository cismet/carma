import { useContext } from "react";
import {
  TransitionContext,
  type TransitionContextType,
} from "./TransitionContext";

/**
 * Hook to access the map transition context.
 * Provides access to transition state and event bus.
 * Throws if used outside TransitionContextProvider.
 */
export const useTransitionContext = (): TransitionContextType => {
  const context = useContext(TransitionContext);

  if (!context) {
    throw new Error(
      "useTransitionContext must be used within TransitionContextProvider"
    );
  }

  return context;
};

export default useTransitionContext;
