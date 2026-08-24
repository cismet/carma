import { useFeatureFlags } from "@carma-providers/feature-flag";

/**
 * Which map engine the geoportal runs on.
 *
 * The maplibre map is the default on every deployment, including live.
 * `ff=leaflet` opts back out to the leaflet map; `ff=ng` is a no-op since
 * maplibre is already on.
 *
 * Single source of truth — no component should read `featureFlagLibreMap` or
 * `featureFlagLeafletMap` on its own.
 */
export const useLibreMapEnabled = (): boolean => {
  const flags = useFeatureFlags();

  return !flags.featureFlagLeafletMap;
};
