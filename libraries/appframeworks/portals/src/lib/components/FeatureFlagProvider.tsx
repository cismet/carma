import React, { createContext, useContext } from "react";
import { getHashParams } from "@carma-commons/utils";
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

type FeatureFlags = Record<string, boolean>;

const FeatureFlagContext = createContext<FeatureFlags>({});

export const useFeatureFlags = () => useContext(FeatureFlagContext);

interface FeatureFlagProviderProps {
  children: React.ReactNode;
  config: FeatureFlagConfig;
  featureFlagParam?: string;
}

/**
 * Provider component for managing feature flags based on URL parameters.
 * Uses standard query parameter format: /#/route?ff=flagkey1|flagkey2
 * To disable default flags prefix with minus like: ff=-flagkey1|flagkey2
 */
export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  children,
  config,
  featureFlagParam: featureFlagParam = DEFAULT_FEATURE_FLAG_PARAM,
}) => {
  const flags = (() => {
    const hashParams = getHashParams();
    const ffParam = hashParams[featureFlagParam];
    const enabledFlags = ffParam ? ffParam.split(FEATURE_FLAG_SEPARATOR) : [];

    const urlFlags = Object.entries(config).reduce(
      (acc, [flagName, config]) => {
        if (
          enabledFlags.includes(
            `${FEATURE_FLAG_DISABLED_PREFIX}${config.alias}`
          )
        ) {
          acc[flagName] = false;
        } else if (enabledFlags.includes(config.alias)) {
          acc[flagName] = true;
        }
        return acc;
      },
      {} as FeatureFlags
    );

    const defaultFlags = Object.fromEntries(
      Object.entries(config).map(([key, config]) => [key, config.default])
    );

    const combinedFlags = { ...defaultFlags, ...urlFlags };

    console.debug("[Routing] FeatureFlagProvider: active flags", combinedFlags);

    return combinedFlags;
  })();

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
};
