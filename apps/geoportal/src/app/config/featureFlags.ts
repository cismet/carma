import { FeatureFlagConfig } from "@carma-providers/feature-flag";

export const featureFlagConfig: FeatureFlagConfig = {
  isDeveloperMode: {
    default: false,
    alias: "dev",
  },
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
  isSnappingEnabled: {
    default: true,
    alias: "snapping",
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
};
