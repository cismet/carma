import { Deployment, useDeployment } from "@carma-commons/utils";
import { useFeatureFlags } from "@carma-providers/feature-flag";

/**
 * Which map engine the geoportal runs on.
 *
 * The maplibre map is the default everywhere EXCEPT the live deployment:
 *
 * - live         → leaflet, unless `ff=ng` opts into maplibre (unchanged
 *                  behaviour for production users).
 * - anywhere else (local dev, dev/PR deployments, unknown hosts)
 *                → maplibre, unless `ff=leaflet` opts back out. `ff=ng` is
 *                  a no-op there since maplibre is already on.
 *
 * Single source of truth — no component should read `featureFlagLibreMap` or
 * `featureFlagLeafletMap` on its own.
 */
export const useLibreMapEnabled = (): boolean => {
  const flags = useFeatureFlags();
  const deployment = useDeployment();

  if (deployment === Deployment.LIVE) {
    return Boolean(flags.featureFlagLibreMap);
  }
  return !flags.featureFlagLeafletMap;
};
