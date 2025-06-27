import { FeatureFlagConfig } from "@carma-apps/portals";

export const featureFlagConfig: FeatureFlagConfig = {
  featureFlagObliqueMode: {
    default: false,
    alias: "oblq",
  },
  isDebugMode: {
    // general debug mode
    default: false,
    alias: "debug",
  },
  featureFlagLibreMap: {
    default: false,
    alias: "ng",
  },
  extendedSharing: {
    default: false,
    alias: "extendedSharing",
  },
  debugTileBoundaries: {
    default: false,
    alias: "debugTileBoundaries",
  },
  featureFlagTracking: {
    default: false,
    alias: "tracking",
  },
};
