import {
  HASH_LAUNCH_MODE,
  isTruthyHashValue,
  resolveHashLaunchMode,
  type HashLaunchMode,
} from "@carma-commons/utils";

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
};

const resolveGeoportalMeasurementModeRequested = (
  hashParams: Record<string, unknown>
) => isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements]);

export const resolveGeoportalCustomHashState = (
  hashParams: Record<string, unknown>,
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

  return {
    measurementModeRequested,
    launchMode: resolveHashLaunchMode(hashParams, {
      defaultMode,
    }),
  };
};

export const buildGeoportalMeasurementModeHashUpdate = (
  measurementModeActive: boolean
): Record<string, string | undefined> => ({
  [URL_PARAM_KEYS.measurements]: measurementModeActive ? "1" : undefined,
});
