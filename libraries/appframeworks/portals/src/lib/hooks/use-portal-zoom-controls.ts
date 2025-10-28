import { useCallback } from "react";
import { useMapEngine } from "../contexts/PortalStateContext";
import { ManagedEngineKeys } from "../constants";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapLibreContext } from "@carma-mapping/engines/maplibre";

/**
 * Portal zoom controls - delegates to active engine context
 *
 * Engine contexts provide zoom callbacks:
 * - TopicMapContext: `zoomIn/zoomOut` for Leaflet
 * - MapLibreContext: `zoomIn/zoomOut` for MapLibre (feature flag)
 * - CesiumContext: `zoomIn/zoomOut` for normal 3D, `fovZoomIn/fovZoomOut` for oblique mode
 *
 * Portal routes to the active engine based on `currentEngine`.
 */

/**
 * usePortalZoomControls - Routes zoom requests to active engine context
 *
 * Portal delegates to engine context callbacks based on currentEngine.
 * No manual wiring required from the app.
 *
 * @example
 * ```tsx
 * // App just calls the hook - Portal handles engine routing
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls();
 *
 * <UnifiedZoomControl onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
 * ```
 */
export const usePortalZoomControls = () => {
  const { current: currentEngine } = useMapEngine();

  // Get engine contexts - these provide zoom callbacks
  const topicMapContext = useCarmaTopicMapContext();
  const mapLibreContext = useMapLibreContext();
  const cesiumContext = useCesiumContext();

  const handleZoomIn = useCallback(() => {
    if (currentEngine === ManagedEngineKeys.MAPLIBRE_2D) {
      // MapLibre 2D mode
      mapLibreContext.zoomIn();
    } else if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
      // Leaflet 2D mode
      topicMapContext?.zoomIn();
    } else {
      // 3D mode: Delegate to CesiumContext
      // TODO: Use fovZoomIn when oblique mode is active
      cesiumContext?.zoomIn();
    }
  }, [currentEngine, topicMapContext, mapLibreContext, cesiumContext]);

  const handleZoomOut = useCallback(() => {
    if (currentEngine === ManagedEngineKeys.MAPLIBRE_2D) {
      // MapLibre 2D mode
      mapLibreContext.zoomOut();
    } else if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
      // Leaflet 2D mode
      topicMapContext?.zoomOut();
    } else {
      // 3D mode: Delegate to CesiumContext
      // TODO: Use fovZoomOut when oblique mode is active
      cesiumContext?.zoomOut();
    }
  }, [currentEngine, topicMapContext, mapLibreContext, cesiumContext]);

  return {
    handleZoomIn,
    handleZoomOut,
  };
};
