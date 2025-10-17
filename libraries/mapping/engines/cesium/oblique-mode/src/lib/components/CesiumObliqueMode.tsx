// TODO: Implementation - see .dev-local/specs/oblique-mode-simplification/oblique-mode-architecture-simplification.md
// @experimental - DO NOT COMMIT without approval
// Cesium oblique mode component with scoped provider
// Provider is constrained within this component and its children
// Controlled component - state managed by app-level event bus

import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import type { Scene, Camera } from "cesium";
import { ObliqueProvider } from "../context/ObliqueProvider";
import { ObliqueControls } from "./ObliqueControls";
import type { ObliqueDataProviderConfig } from "../types";
import { useObliqueInitializer } from "../hooks/useObliqueInitializer";

export interface CesiumObliqueModeProps {
  config: ObliqueDataProviderConfig;
  isActive: boolean;
}

/**
 * Cesium Oblique Mode Component
 * - Controlled component (state managed externally via app-level event bus)
 * - Scoped provider pattern (provider constrained to this component tree)
 * - Can be lazy loaded
 * - Contains ObliqueProvider and ObliqueControls internally
 *
 * Architecture:
 * - CesiumObliqueMode (controlled by isActive prop)
 *   └─ ObliqueProvider (scoped context, only for oblique children)
 *      ├─ ObliqueInitializer (camera controls, FOV zoom)
 *      └─ ObliqueControls (UI and interaction)
 *
 * This keeps the provider pattern but scopes it to just oblique mode,
 * not the entire application.
 */
export function CesiumObliqueMode({
  config,
  isActive,
}: CesiumObliqueModeProps) {
  // Don't render anything if not in oblique mode
  if (!isActive) return null;

  return (
    // Provider scoped to oblique mode - not wrapping entire app
    // Provider manages data loading and provides loading state to children
    <ObliqueProvider config={config}>
      {/* Initialize oblique mode effects (camera controls, FOV zoom, etc) */}
      <ObliqueInitializer />
      {/* All oblique UI components are children of the provider */}
      {/* ObliqueControls will show loading state from provider context */}
      <ObliqueControls />
    </ObliqueProvider>
  );
}

/**
 * Internal component to initialize oblique mode effects
 * Must be inside ObliqueProvider to access oblique context
 */
function ObliqueInitializer() {
  // Initialize oblique mode camera controls and effects
  useObliqueInitializer(false); // debug=false for production
  return null;
}

export default CesiumObliqueMode;
