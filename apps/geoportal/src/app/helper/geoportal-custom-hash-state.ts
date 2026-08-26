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
  shadowSimulationSelection: GeoportalShadowSimulationHashSelection | null;
  launchMode: GeoportalResolvedLaunchMode;
  initialMapFramework: CarmaMapFramework;
};

export type GeoportalShadowSimulationHashSelection = {
  minutes: number;
  dayOfYear: number;
};

type GeoportalShadowSimulationHashSource = {
  enabled: boolean;
  selection: GeoportalShadowSimulationHashSelection;
};

const SHADOW_SIMULATION_HASH_VALUE_PATTERN = /^(\d{1,4});(\d{1,3})$/;

export const resolveGeoportalShadowSimulationHashSelection = (
  value: unknown
): GeoportalShadowSimulationHashSelection | null => {
  if (typeof value !== "string") {
    return null;
  }

  const match = SHADOW_SIMULATION_HASH_VALUE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const dayOfYear = Number(match[2]);
  if (minutes > 1439 || dayOfYear < 1 || dayOfYear > 366) {
    return null;
  }

  return { minutes, dayOfYear };
};

export const isGeoportalShadowSimulationHashSelectionValidForYear = (
  selection: GeoportalShadowSimulationHashSelection,
  year: number
): boolean => {
  if (!Number.isInteger(year)) {
    return false;
  }

  const daysInYear =
    new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  return selection.dayOfYear <= daysInYear;
};

const resolveGeoportalMeasurementModeRequested = (
  hashParams: Record<string, unknown>
) => isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements]);

export const resolveGeoportalCustomHashState = (
  hashParams: Record<string, unknown> = typeof window === "undefined"
    ? {}
    : getHashParams(),
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
    shadowSimulationSelection: resolveGeoportalShadowSimulationHashSelection(
      hashParams[URL_PARAM_KEYS.shadowSimulation]
    ),
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

export const buildGeoportalShadowSimulationHashUpdate = (
  state: GeoportalShadowSimulationHashSource | undefined
): Record<string, string | undefined> => {
  if (!state?.enabled) {
    return { [URL_PARAM_KEYS.shadowSimulation]: undefined };
  }

  const { minutes, dayOfYear } = state.selection;
  const serialized = `${minutes};${dayOfYear}`;

  return {
    [URL_PARAM_KEYS.shadowSimulation]:
      resolveGeoportalShadowSimulationHashSelection(serialized) !== null
        ? serialized
        : undefined,
  };
};
