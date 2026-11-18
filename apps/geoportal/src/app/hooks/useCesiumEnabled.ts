import { useFeatureFlags } from "@carma-providers/feature-flag";

/**
 * Which engine the 3D button opens.
 *
 * Default is the maplibre 3D mode; `ff=cesium` opts back to Cesium. Live has
 * Cesium on by default (`liveFeatureFlagConfig`), `ff=-cesium` opts out there.
 * The leaflet map has no maplibre 3D mode, so `ff=leaflet` implies Cesium.
 *
 * Single source of truth — no component should read `featureFlagCesium` on its own.
 */
export const useCesiumEnabled = (): boolean => {
  const flags = useFeatureFlags();

  return !!flags.featureFlagCesium || !!flags.featureFlagLeafletMap;
};
