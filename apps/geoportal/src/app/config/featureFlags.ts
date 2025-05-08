import { FeatureFlagConfig } from "@carma-apps/portals";

export const featureFlagConfig: FeatureFlagConfig = {
  featureFlagObliqueMode: {
    default: false,
    alias: "oblq",
  },
  featureFlagDebugOblique: {
    default: false,
    alias: "debug",
  },
  featureFlagObliqueFootprintStyleNoWall: {
    default: false,
    alias: "nowall",
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
};
