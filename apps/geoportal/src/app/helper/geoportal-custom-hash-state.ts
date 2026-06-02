import {
  getHashParams,
  HASH_LAUNCH_MODE,
  isTruthyHashValue,
  resolveHashLaunchMode,
  type HashLaunchMode,
} from "@carma-commons/utils";
import {
  CARMA_MAP_FRAMEWORKS,
  type CarmaMapFramework,
} from "@carma-mapping/components";

import { URL_PARAM_KEYS } from "../config/app.config";

type GeoportalResolvedLaunchMode = Exclude<
  HashLaunchMode,
  typeof HASH_LAUNCH_MODE.UNSET
>;

export type GeoportalCustomHashLaunchPolicy = {
  fallbackLaunchMode?: GeoportalResolvedLaunchMode;
  measurementModeLaunchMode?: GeoportalResolvedLaunchMode;
};

export type GeoportalCustomHashState = {
  measurementModeRequested: boolean;
  launchMode: GeoportalResolvedLaunchMode;
  initialMapFramework: CarmaMapFramework;
};

const resolveGeoportalMeasurementModeRequested = (
  hashParams: Record<string, unknown>
) => isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements]);

export const resolveGeoportalCustomHashState = (
  hashParams: Record<string, unknown> =
    typeof window === "undefined" ? {} : getHashParams(),
  {
    fallbackLaunchMode = HASH_LAUNCH_MODE.TWO_D,
    measurementModeLaunchMode = HASH_LAUNCH_MODE.THREE_D,
  }: GeoportalCustomHashLaunchPolicy = {}
): GeoportalCustomHashState => {
  const measurementModeRequested =
    resolveGeoportalMeasurementModeRequested(hashParams);
  const defaultMode = measurementModeRequested
    ? measurementModeLaunchMode
    : fallbackLaunchMode;

  const launchMode = resolveHashLaunchMode(hashParams, {
    defaultMode,
  });

  return {
    measurementModeRequested,
    launchMode,
    initialMapFramework:
      launchMode === HASH_LAUNCH_MODE.THREE_D
        ? CARMA_MAP_FRAMEWORKS.CESIUM
        : CARMA_MAP_FRAMEWORKS.LEAFLET,
  };
};

export const buildGeoportalMeasurementModeHashUpdate = (
  measurementModeActive: boolean
): Record<string, string | undefined> => ({
  [URL_PARAM_KEYS.measurements]: measurementModeActive ? "1" : undefined,
});
