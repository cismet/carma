import { getHashParams } from "@carma-commons/utils";
import { FeatureFlagContext } from "./FeatureFlagContext";
import { useCallback, useMemo } from "react";

const DEFAULT_FEATURE_FLAG_PARAM = "ff";
const FEATURE_FLAG_DISABLED_PREFIX = "-";
const FEATURE_FLAG_SEPARATOR = ".";

export type FeatureFlagConfig = Record<
  string,
  {
    default: boolean;
    alias: string;
  }
>;

export type FeatureFlags = Record<string, boolean>;

interface FeatureFlagProviderProps {
  children: React.ReactNode;
  config: FeatureFlagConfig;
  featureFlagParam?: string;
}

/**
 * Resolves the effective flags from the current URL hash parameters, outside
 * of React; usable at module load, e.g. for route registration that happens
 * before the provider mounts.
 */
export const resolveFeatureFlags = (
  config: FeatureFlagConfig,
  featureFlagParam: string = DEFAULT_FEATURE_FLAG_PARAM
): FeatureFlags => {
  const hashParams: Record<string, string> =
    typeof window === "undefined" ? {} : getHashParams();
  const ffParam = hashParams[featureFlagParam];
  const enabledFlags = ffParam ? ffParam.split(FEATURE_FLAG_SEPARATOR) : [];

  const urlFlags = Object.entries(config).reduce((acc, [flagName, config]) => {
    if (
      enabledFlags.includes(`${FEATURE_FLAG_DISABLED_PREFIX}${config.alias}`)
    ) {
      acc[flagName] = false;
    } else if (enabledFlags.includes(config.alias)) {
      acc[flagName] = true;
    }
    return acc;
  }, {} as FeatureFlags);

  const defaultFlags = Object.fromEntries(
    Object.entries(config).map(([key, config]) => [key, config.default])
  );

  return { ...defaultFlags, ...urlFlags };
};

/**
 * Provider component for managing feature flags based on URL parameters.
 * Uses standard query parameter format: /#/route?ff=flagkey1|flagkey2
 * To disable default flags prefix with minus like: ff=-flagkey1|flagkey2
 */
export const FeatureFlagProvider = ({
  children,
  config,
  featureFlagParam = DEFAULT_FEATURE_FLAG_PARAM,
}: FeatureFlagProviderProps) => {
  const getFlags = useCallback(() => {
    const combinedFlags = resolveFeatureFlags(config, featureFlagParam);

    console.debug("[Routing] FeatureFlagProvider: active flags", combinedFlags);

    return combinedFlags;
  }, [config, featureFlagParam]);

  const flags = useMemo(getFlags, [getFlags]);

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
};
