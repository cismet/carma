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
};
