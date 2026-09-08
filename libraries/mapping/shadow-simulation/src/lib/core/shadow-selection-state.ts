import { getDaysInYear } from "@carma-commons/utils";

import type {
  ShadowSimulationConfig,
  ShadowDateState,
  ShadowSimulationState,
} from "../contracts/shadow-simulation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "./create-shadow-simulation-state";
import {
  clampShadowSimulationSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
} from "./solar-position";

type ShadowSelection = Readonly<{
  minutes: number;
  dayOfYear: number;
}>;

export const shadowStateMatchesHashSelection = (
  enabled: boolean,
  selection: ShadowSelection,
  hashSelection: ShadowSelection | null
): boolean =>
  hashSelection === null
    ? !enabled
    : enabled &&
      selection.minutes === hashSelection.minutes &&
      selection.dayOfYear === hashSelection.dayOfYear;

export const resolveShadowHashSelection = (
  selection: ShadowSelection | null,
  year: number | undefined,
  position: { latitude?: number; longitude?: number },
  timeZone: string
): ShadowSelection | null => {
  if (!selection || year === undefined) return selection;
  if (!Number.isInteger(year) || selection.dayOfYear > getDaysInYear(year)) {
    return null;
  }

  const daylightSelection = clampShadowSimulationSelectionToDaylight(
    { ...selection, year },
    { ...position, timeZone }
  );
  return daylightSelection
    ? {
        minutes: daylightSelection.minutes,
        dayOfYear: daylightSelection.dayOfYear,
      }
    : null;
};

export const applyShadowHashSelection = (
  shadowState: ShadowSimulationState,
  dateState: ShadowDateState,
  selection: ShadowSelection | null
): { shadowState: ShadowSimulationState; dateState: ShadowDateState } => ({
  shadowState: { ...shadowState, enabled: selection !== null },
  dateState: selection ? { ...dateState, ...selection } : dateState,
});

/** Resolve URL-owned state before the map chooses its first basemap sources. */
export const createShadowStartupState = (
  config: ShadowSimulationConfig | undefined,
  selection: ShadowSelection | null,
  location: { latitude?: number; longitude?: number }
) => {
  const resolvedLocation = {
    latitude:
      location.latitude ??
      config?.latitude ??
      DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude:
      location.longitude ??
      config?.longitude ??
      DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
  };
  const date = createInitialShadowDateState(config, resolvedLocation);
  const resolved = resolveShadowHashSelection(
    selection,
    date.year,
    resolvedLocation,
    date.timeZone
  );
  const initial = applyShadowHashSelection(
    createInitialShadowSimulationState(config),
    date,
    resolved
  );
  return {
    shadowSimulation: initial.shadowState,
    shadowDate: initial.dateState,
  };
};
