import { useCallback } from "react";
import { useMapEngine } from "../contexts/PortalStateContext";
import { ManagedEngineKeys } from "../constants";

/**
 * Engine-specific home implementations provided by the app
 */
export interface HomeImplementations {
  // Leaflet home (TopicMap) - optional, some apps may only update hash
  homeLeaflet?: () => void;

  // LibreMap home - optional, some apps may only update hash
  homeLibreMap?: () => void;

  // Cesium home (3D mode)
  homeCesium?: () => void;
}

/**
 * usePortalHomeControl - Routes home requests to active engine
 *
 * Portal handles the routing logic based on currentEngine.
 * App provides thin implementations via HomeImplementations.
 *
 * This avoids circular dependencies by accepting callbacks instead
 * of importing engine hooks directly.
 *
 * @example
 * ```tsx
 * // In app (GeoportalControls)
 * const cesiumHomeControl = useHomeControl();
 *
 * const { handleHome } = usePortalHomeControl({
 *   homeLeaflet: () => {
 *     leafletMapRef.current?.flyTo([51.27, 7.20], 18);
 *   },
 *   homeLibreMap: () => {
 *     libreMapRef.current?.flyTo({ center: [7.20, 51.27], zoom: 17 });
 *   },
 *   homeCesium: cesiumHomeControl,
 * });
 *
 * <button onClick={handleHome}>Home</button>
 * ```
 */
export const usePortalHomeControl = (implementations: HomeImplementations) => {
  const { current: currentEngine } = useMapEngine();
  const { homeLeaflet, homeLibreMap, homeCesium } = implementations;

  const handleHome = useCallback(() => {
    if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
      // 2D mode: Try LibreMap first, then Leaflet
      if (homeLibreMap) {
        homeLibreMap();
      } else if (homeLeaflet) {
        homeLeaflet();
      }
    } else {
      // 3D mode: Cesium
      homeCesium?.();
    }
  }, [currentEngine, homeLibreMap, homeLeaflet, homeCesium]);

  return {
    handleHome,
  };
};
