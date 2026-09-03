import { Deployment, type DeploymentTarget } from "@carma-commons/utils";
import { FeatureFlagConfig } from "@carma-providers/feature-flag";

export const featureFlagConfig: FeatureFlagConfig = {
  isDeveloperMode: {
    default: false,
    alias: "dev",
  },
  featureFlagObliqueMode: {
    default: true,
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
  featureFlagLeafletMap: {
    default: false,
    alias: "leaflet",
  },
  extendedSharing: {
    default: false,
    alias: "extendedSharing",
  },
  isSnappingEnabled: {
    default: true,
    alias: "snapping",
  },
  featureFlagCesiumAnnotationAllTools: {
    default: false,
    alias: "alltools",
  },
  debugTileBoundaries: {
    default: false,
    alias: "debugTileBoundaries",
  },
  featureFlagTracking: {
    default: true,
    alias: "tracking",
  },
  featureFlagFachzwillinge: {
    default: false,
    alias: "fz",
  },
  // makes a checkout with cage behave like one without it, so the open-source
  // fallbacks can be looked at without unlinking the submodule
  featureFlagNoCage: {
    default: false,
    alias: "nocage",
  },
};

type FeatureFlagConfigEntry = FeatureFlagConfig[string];
type FeatureFlagConfigOverrides = Record<string, FeatureFlagConfigEntry>;

export const devFeatureFlagConfig: FeatureFlagConfigOverrides = {};

export const liveFeatureFlagConfig: FeatureFlagConfigOverrides = {};

const mergeFeatureFlagConfig = (
  base: FeatureFlagConfig,
  overrides: FeatureFlagConfigOverrides
): FeatureFlagConfig => ({ ...base, ...overrides });

export const getFeatureFlagConfig = (
  deployment: DeploymentTarget | null
): FeatureFlagConfig => {
  switch (deployment) {
    case Deployment.DEV:
      return mergeFeatureFlagConfig(featureFlagConfig, devFeatureFlagConfig);
    case Deployment.LIVE:
      return mergeFeatureFlagConfig(featureFlagConfig, liveFeatureFlagConfig);
    default:
      return featureFlagConfig;
  }
};
