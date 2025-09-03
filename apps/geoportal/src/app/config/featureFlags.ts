import { FeatureFlagConfig } from "@carma-appframeworks/portals";

export const featureFlagConfig: FeatureFlagConfig = {
  featureFlagObliqueMode: {
    default: false,
    alias: "oblq",
  },
  isObliqueUiEval: {
    default: false,
    alias: "oblqui",
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
    default: true,
    alias: "tracking",
  },
  featureFlagBugaBridge: {
    default: false,
    alias: "buga-bruecke",
  },
  trustUnsecureObjectMapping: {
    default: false,
    alias: "trustUnsecureObjectMapping",
  },
};
