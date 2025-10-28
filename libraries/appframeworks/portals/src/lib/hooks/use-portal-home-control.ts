import { useCallback } from "react";
import { useActiveEngines } from "./use-active-engines";

/**
 * usePortalHomeControl - Routes home requests to active engine based on engine records
 *
 * Portal delegates to engine records based on current engine state.
 * Uses the flyHome methods from the engine records for all non-suspended frameworks.
 *
 * Engine records provide flyHome callbacks:
 * - LeafletEngineRecord: `flyHome` for Leaflet 2D
 * - CesiumEngineRecord: `flyHome` for Cesium 3D
 *
 * @example
 * ```tsx
 * const { handleHome } = usePortalHomeControl();
 * <button onClick={handleHome}>Home</button>
 * ```
 */
export const usePortalHomeControl = () => {
  const { forEachActiveEngine, hasActiveEngines } = useActiveEngines();

  const handleHome = useCallback(() => {
    if (!hasActiveEngines) {
      console.warn(
        "[usePortalHomeControl] No active engines found for home navigation"
      );
      return;
    }

    // Call flyHome on all active engines using the convenience hook
    forEachActiveEngine((engine) => {
      if ("flyHome" in engine && typeof engine.flyHome === "function") {
        console.log(
          `[usePortalHomeControl] Calling flyHome on ${engine.engine}`
        );
        engine.flyHome();
      }
    });
  }, [forEachActiveEngine, hasActiveEngines]);

  return {
    handleHome,
  };
};
