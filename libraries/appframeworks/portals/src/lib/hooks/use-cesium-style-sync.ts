import { useCallback, useEffect } from "react";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumContext } from "@carma/mapping/engines/cesium/core";
import { useTransitionContext } from "../contexts/TransitionContext";
import type { MapStyleKey } from "../constants";

/**
 * Hook to sync Cesium scene style ID from portal context with Cesium context
 *
 * Should be used in:
 * - CesiumMapComponentWrapper (get setStyle for engine records + auto-sync)
 *
 */
export const useCesiumStyleSync = () => {
  console.log("[useCesiumStyleSync] ===== HOOK ENTRY POINT =====");
  const { getMapStyle, setMapStyle, portalConfig } = usePortalContext();
  console.log("[useCesiumStyleSync] Got PortalContext");
  const { getSceneStyleApplier, getCurrentSceneStyle, setCurrentSceneStyle } = useCesiumContext();
  console.log("[useCesiumStyleSync] Got CesiumContext");
  const { currentMode } = useTransitionContext();
  console.log("[useCesiumStyleSync] Got TransitionContext, currentMode:", currentMode);

  console.log("[useCesiumStyleSync] Hook called/rendered");

  useEffect(() => {
    console.log("[useCesiumStyleSync] ===== useEffect TRIGGERED =====");
    
    // Get the current portal style
    const portalStyle = getMapStyle();
    console.log("[useCesiumStyleSync] Current portal style:", portalStyle);

    // Map portal style to Cesium style ID
    const cesiumStyleId = portalConfig.mapStyleMappings.cesium[portalStyle];
    console.log("[useCesiumStyleSync] Mapped to Cesium style:", cesiumStyleId);

    if (!cesiumStyleId) {
      console.warn(
        "[useCesiumStyleSync] No Cesium style mapping found for portal style:",
        portalStyle
      );
      return;
    }

    const currentCesiumStyle = getCurrentSceneStyle();
    const isCesiumActive = currentMode === "3d";
    console.log("[useCesiumStyleSync] Current Cesium context style:", currentCesiumStyle);
    console.log("[useCesiumStyleSync] Is Cesium active (3D mode)?", isCesiumActive);

    // Always update the current style in the context (even when suspended)
    // This ensures the correct style is available when Cesium becomes active
    if (currentCesiumStyle !== cesiumStyleId) {
      console.log(
        "[useCesiumStyleSync] Updating Cesium scene style:",
        portalStyle,
        "->",
        cesiumStyleId
      );

      // Set the new style in the context
      setCurrentSceneStyle(cesiumStyleId);

      // Only apply the style if Cesium is active and scene is ready
      const applier = getSceneStyleApplier();
      if (isCesiumActive && applier) {
        console.log("[useCesiumStyleSync] Applying style to scene (Cesium is active)");
        applier(cesiumStyleId);
      } else if (!isCesiumActive) {
        console.debug(
          "[useCesiumStyleSync] Cesium is suspended (2D mode) - style updated in context only",
          "(will be applied when switching to 3D mode)"
        );
      } else if (!applier) {
        console.debug(
          "[useCesiumStyleSync] Scene style applier not available yet",
          "(scene will use style when it initializes)"
        );
      }
    }
  }, [
    getMapStyle,
    portalConfig.mapStyleMappings.cesium,
    currentMode,
    getCurrentSceneStyle,
    setCurrentSceneStyle,
    getSceneStyleApplier,
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
      setMapStyle(styleId as MapStyleKey);
    },
    [setMapStyle]
  );

  return {
    setStyle, // For Cesium engine records
  };
};
