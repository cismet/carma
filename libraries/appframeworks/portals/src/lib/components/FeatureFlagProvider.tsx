// src/contexts/FeatureFlagProvider.tsx
import React, { createContext, useContext, useMemo } from "react";

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
 * like
 * &ff=flagkey1,flagkey2 enables features
 * to disable default flags prefix with minus like
 * &ff=-flagkey1,flagkey2
 * @param children The children to render
 * @param config A map of feature flag keys to their default values
 * @param featureFlagParam optional name of the url parameter to use for feature flags, default is "ff"
 * @returns A provider component that wraps the children with feature flag context
 */

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  children,
  config,
  featureFlagParam: featureFlagParam = "ff",
}) => {
  const flags = useMemo(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const ffParam = params.get(featureFlagParam);
    const enabledFlags = ffParam ? ffParam.split(",") : [];

    const urlFlags = Object.entries(config).reduce(
      (acc, [flagName, config]) => {
        if (enabledFlags.includes(`-${config.alias}`)) {
          acc[flagName] = false; // Disable flag if prefixed with '-'
        } else if (enabledFlags.includes(config.alias)) {
          acc[flagName] = true; // Enable flag if present
        }
        return acc;
      },
      {} as FeatureFlags
    );

    const defaultFlags = Object.fromEntries(
      Object.entries(config).map(([key, config]) => [key, config.default])
    );

    return { ...defaultFlags, ...urlFlags };
  }, [config, featureFlagParam]);

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
};
