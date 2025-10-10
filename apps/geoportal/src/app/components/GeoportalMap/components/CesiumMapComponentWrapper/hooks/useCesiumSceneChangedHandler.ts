import { useMapHashRoutingCesium } from "@carma-appframeworks/portals";

/**
 * Geoportal-specific Cesium scene change handler.
 * Analog to useTopicMapLocationChangedHandler for Leaflet.
 * The hook internally tracks suspended state via events.
 */
export const useCesiumSceneChangedHandler = () => {
  return useMapHashRoutingCesium();
};
