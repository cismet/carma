import { createContext, type MutableRefObject } from "react";
import type { TransitionConfig } from "@carma-mapping/map-transition-2d-3d";
import type { MapEngine } from "../../types/portal";

// Type for engine state getter - injected from portal layer
export type GetEnginesFn = () => Array<{
  engineType?: string;
  engine?: string;
  isReady?: boolean;
  isSuspended?: boolean;
  instance?: any; // Contains leafletMap, widget, scene, etc.
}>;

// Type for engine updater - injected from portal layer
// Uses MapEngine type for type safety
export type UpdateEngineFn = (
  engineType: MapEngine,
  updates: Record<string, unknown>
) => void;

/**
 * Transition context with config, state, and callback registrations
 * Uses pure engines paradigm - all instances accessed via getEngines()
 */
export interface TransitionContextType {
  config: Required<TransitionConfig>;
  isTransitioningRef: MutableRefObject<boolean>;
  currentMode: "2d" | "3d"; // Derived from engine suspension state
  onCesiumFadeInRef: MutableRefObject<(() => void) | null>;
  onCesiumFadeOutRef: MutableRefObject<(() => void) | null>;
  
  // Engine state management - injected from portal layer (PURE ENGINES PARADIGM)
  getEngines: GetEnginesFn;
  updateEngine: UpdateEngineFn;
}

export const TransitionContext = createContext<TransitionContextType | null>(
  null
);
