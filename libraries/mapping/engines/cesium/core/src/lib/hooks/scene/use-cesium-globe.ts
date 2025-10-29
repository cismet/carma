import { useEffect, type MutableRefObject } from "react";
import { useCesiumContext } from "../../context";
import { Color } from "@carma/cesium";

/**
 * Hook that manages globe appearance settings from style configuration.
 *
 * Registers callback with styleCallbacksRef.onGlobeSettingsChange
 * Called by useSceneStyleSwitcher when style changes.
 *
 * Note: Globe visibility (show) is managed by useTerrainManager
 * This hook only handles visual appearance (baseColor, translucency, etc.)
 */
export const useCesiumGlobe = (
  styleCallbacksRef: MutableRefObject<{
    onGlobeSettingsChange?: (settings: any) => void;
  }>
) => {
  const { sceneRef } = useCesiumContext();

  // Register callback IMMEDIATELY (synchronous, not in useEffect)
  // This ensures callback is ready when useSceneStyleSwitcher runs
  styleCallbacksRef.current.onGlobeSettingsChange = (settings) => {
    const scene = sceneRef.current;
    if (!scene?.globe) {
      console.warn("[Globe] Scene not available for globe settings change");
      return;
    }

    console.log("[Globe] Applying settings:", settings);
    const { globe } = scene;

    // Apply baseColor (visual appearance)
    if (settings.baseColor && Array.isArray(settings.baseColor)) {
      const [r, g, b, a] = settings.baseColor;
      globe.baseColor = new Color(r, g, b, a);
      console.log(`[Globe] Set baseColor: rgba(${r}, ${g}, ${b}, ${a})`);

      // Enable translucency if alpha < 1
      globe.translucency.enabled = a < 1.0;
      if (a < 1.0) {
        console.log(`[Globe] Enabled translucency (alpha=${a})`);
      }
    }

    // Disable skirts by default (can be overridden by style config)
    globe.showSkirts = settings.showSkirts ?? false;

    // Disable ground atmosphere by default (can be overridden by style config)
    globe.showGroundAtmosphere = settings.showGroundAtmosphere ?? false;

    // Apply cartographic limit if provided
    if (settings.cartographicLimitRectangle !== undefined) {
      globe.cartographicLimitRectangle = settings.cartographicLimitRectangle;
    }

    // Ensure globe is visible for mesh view (even without terrain)
    // This prevents the "weird black stuff" background issue
    globe.show = settings.showGlobe ?? true;

    console.log(`[Globe] Globe visibility set to: ${globe.show}`);

    scene.requestRender();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      styleCallbacksRef.current.onGlobeSettingsChange = undefined;
    };
    // Note: styleCallbacksRef is a ref (stable), doesn't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export default useCesiumGlobe;
