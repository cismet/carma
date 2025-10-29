import { useCallback } from "react";
import { useActiveEngines } from "./use-active-engines";
import { ManagedEngineKeys } from "../constants";
import { usePortalContext } from "../contexts/PortalContext";
import type { ManagedEngineRecord } from "../types/map-engines";

/**
 * usePortalZoomControls - Routes zoom requests to active engine based on engine records
 *
 * Portal delegates to engine records based on current engine state.
 * Uses zoom methods from engine records for all non-suspended frameworks.
 * Handles FOV zooming for Cesium in oblique mode when available.
 *
 * Engine records provide zoom callbacks:
 * - LeafletEngineRecord: `zoomIn/zoomOut` for Leaflet 2D
 * - CesiumEngineRecord: `zoomIn/zoomOut` for normal 3D, `fovZoomIn/fovZoomOut` for oblique mode
 *
 * @example
 * ```tsx
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls();
 *
 * <UnifiedZoomControl onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
 * ```
 */
export const usePortalZoomControls = () => {
  const { activeEngines } = useActiveEngines();
  const { getEngines } = usePortalContext();

  const handleZoomIn = useCallback(() => {
    if (activeEngines?.length < 1) {
      console.warn(
        "[usePortalZoomControls] No active engines found for zoom in",
        activeEngines,
        getEngines()
      );
      return;
    }

    // Call zoomIn on all active engines
    activeEngines.forEach((engine) => {
      // Only process initialized engines that have zoom methods
      if (
        engine.isReady &&
        !engine.isSuspended &&
        "zoomIn" in engine &&
        typeof engine.zoomIn === "function"
      ) {
        // For Cesium engines, prioritize FOV zoom if available (oblique mode)
        if (engine.engine === ManagedEngineKeys.CESIUM_3D) {
          if ("fovZoomIn" in engine && typeof engine.fovZoomIn === "function") {
            console.log(
              "[usePortalZoomControls] Using fovZoomIn for Cesium 3D"
            );
            engine.fovZoomIn?.();
          } else {
            console.log(
              "[usePortalZoomControls] Using normal zoomIn for Cesium 3D"
            );
            engine.zoomIn?.();
          }
        } else {
          console.log(
            `[usePortalZoomControls] Using zoomIn for ${engine.engine}`
          );
          engine.zoomIn?.();
        }
      }
    });
  }, [activeEngines]);

  const handleZoomOut = useCallback(() => {
    if (activeEngines?.length < 1) {
      console.warn(
        "[usePortalZoomControls] No active engines found for zoom out",
        activeEngines,
        getEngines()
      );
      return;
    }

    // Call zoomOut on all active engines
    activeEngines.forEach((engine) => {
      // Only process initialized engines that have zoom methods
      if (
        engine.isReady &&
        !engine.isSuspended &&
        "zoomOut" in engine &&
        typeof engine.zoomOut === "function"
      ) {
        // For Cesium engines, prioritize FOV zoom if available (oblique mode)
        if (engine.engine === ManagedEngineKeys.CESIUM_3D) {
          if (
            "fovZoomOut" in engine &&
            typeof engine.fovZoomOut === "function"
          ) {
            console.log(
              "[usePortalZoomControls] Using fovZoomOut for Cesium 3D"
            );
            engine.fovZoomOut?.();
          } else {
            console.log(
              "[usePortalZoomControls] Using normal zoomOut for Cesium 3D"
            );
            engine.zoomOut?.();
          }
        } else {
          console.log(
            `[usePortalZoomControls] Using zoomOut for ${engine.engine}`
          );
          engine.zoomOut?.();
        }
      }
    });
  }, [activeEngines]);

  return {
    handleZoomIn,
    handleZoomOut,
  };
};
