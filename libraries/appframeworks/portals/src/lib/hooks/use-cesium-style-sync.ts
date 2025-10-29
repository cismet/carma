import { useCallback, useEffect } from "react";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumContext } from "@carma/mapping/engines/cesium/core";
import { ManagedEngineKeys } from "../constants";

/**
 * Hook to sync Cesium scene style ID from portal context with Cesium context
 *
 * Should be used in:
 * - CesiumMapComponentWrapper (get setStyle for engine records + auto-sync)
 *
 */
export const useCesiumStyleSync = () => {
  const { getMapStyle, setMapStyle, portalConfig, isCesiumActive } = usePortalContext();
  const { sceneStyleApplierRef, currentSceneStyleRef } = useCesiumContext();

  useEffect(() => {
    // Get the current portal style
    const portalStyle = getMapStyle();

    // Map portal style to Cesium style ID
    const cesiumStyleId = portalConfig.mapStyleMappings.cesium[portalStyle];

    if (!cesiumStyleId) {
      console.warn(
        "[useCesiumStyleSync] No Cesium style mapping found for portal style:",
        portalStyle
      );
      return;
    }

    // Always update the current style in the context (even when suspended)
    // This ensures the correct style is available when Cesium becomes active
    if (currentSceneStyleRef.current !== cesiumStyleId) {
      console.log(
        "[useCesiumStyleSync] Updating Cesium scene style:",
        portalStyle,
        "->",
        cesiumStyleId
      );

      // Set the new style in the context
      currentSceneStyleRef.current = cesiumStyleId;

      // Only apply the style if Cesium is active and scene is ready
      if (isCesiumActive() && sceneStyleApplierRef.current) {
        sceneStyleApplierRef.current(cesiumStyleId);
      } else if (!isCesiumActive()) {
        console.debug(
          "[useCesiumStyleSync] Cesium is suspended - style updated in context only",
          "(will be applied when Cesium becomes active)"
        );
      } else if (!sceneStyleApplierRef.current) {
        console.debug(
          "[useCesiumStyleSync] Scene style applier not available yet",
          "(scene will use style when it initializes)"
        );
      }
    }
  }, [
    getMapStyle,
    portalConfig.mapStyleMappings.cesium,
    isCesiumActive,
    currentSceneStyleRef,
    sceneStyleApplierRef,
  ]);

  /**
   * Set style method for Cesium engine records
   * This is called when PortalStateContext calls engine.setStyle(styleId)
   *
   * @param styleId - The portal MapStyleKey (e.g., "karte", "luftbild")
   */
  const setStyle = useCallback(
    (styleId: string) => {
      console.log(
        "[useCesiumStyleSync] Cesium engine setStyle called with:",
        styleId
      );

      // Update the portal style using the controlled setter
      // this will trigger the useEffect above to sync the change to the Cesium context
      setMapStyle(styleId as any);
    },
    [setMapStyle]
  );

  return {
    setStyle, // For Cesium engine records
  };
};
