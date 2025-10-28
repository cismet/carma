import { useCallback } from "react";
import { useMapEngine } from "../contexts/PortalStateContext";
import { ManagedEngineKeys } from "../constants";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapLibreContext } from "@carma-mapping/engines/maplibre";

/**
 * usePortalHomeControl - Routes home requests to active engine context
 *
 * Portal delegates to engine context callbacks based on currentEngine.
 * No manual wiring required from the app.
 *
 * Engine contexts provide flyHome callbacks:
 * - TopicMapContext: `flyHome` for Leaflet
 * - MapLibreContext: `flyHome` for MapLibre
 * - CesiumContext: `flyHome` for Cesium
 *
 * @example
 * ```tsx
 * const { handleHome } = usePortalHomeControl();
 * <button onClick={handleHome}>Home</button>
 * ```
 */
export const usePortalHomeControl = () => {
  const { current: currentEngine } = useMapEngine();

  // Get engine contexts - these provide flyHome callbacks
  const topicMapContext = useCarmaTopicMapContext();
  const mapLibreContext = useMapLibreContext();
  const cesiumContext = useCesiumContext();

  const handleHome = useCallback(() => {
    if (currentEngine === ManagedEngineKeys.MAPLIBRE_2D) {
      // MapLibre 2D mode
      mapLibreContext.flyHome();
    } else if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
      // Leaflet 2D mode
      topicMapContext?.flyHome();
    } else {
      // 3D mode: Cesium
      cesiumContext?.flyHome();
    }
  }, [currentEngine, topicMapContext, mapLibreContext, cesiumContext]);

  return {
    handleHome,
  };
};
