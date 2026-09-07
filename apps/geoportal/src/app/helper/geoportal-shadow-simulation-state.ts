import type {
  ShadowSimulationConfig,
  ShadowDateState,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation/core";
import {
  clampShadowSimulationSelectionToDaylight,
  createInitialShadowDateState,
  createInitialShadowSimulationState,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
} from "@carma-mapping/shadow-simulation/core";

import {
  isGeoportalShadowSimulationHashSelectionValidForYear,
  type GeoportalShadowSimulationHashSelection,
} from "./geoportal-custom-hash-state";

type ShadowSelection = Readonly<{
  minutes: number;
  dayOfYear: number;
}>;

export const shadowStateMatchesHashSelection = (
  enabled: boolean,
  selection: ShadowSelection,
  hashSelection: GeoportalShadowSimulationHashSelection | null
): boolean =>
  hashSelection === null
    ? !enabled
    : enabled &&
      selection.minutes === hashSelection.minutes &&
      selection.dayOfYear === hashSelection.dayOfYear;

export const resolveGeoportalShadowHashSelection = (
  selection: GeoportalShadowSimulationHashSelection | null,
  year: number | undefined,
  position: { latitude?: number; longitude?: number },
  timeZone: string
): GeoportalShadowSimulationHashSelection | null => {
  if (!selection || year === undefined) return selection;
  if (!isGeoportalShadowSimulationHashSelectionValidForYear(selection, year)) {
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
  selection: GeoportalShadowSimulationHashSelection | null
): { shadowState: ShadowSimulationState; dateState: ShadowDateState } => ({
  shadowState: { ...shadowState, enabled: selection !== null },
  dateState: selection ? { ...dateState, ...selection } : dateState,
});

/** Resolve URL-owned state before the map chooses its first basemap sources. */
export const createGeoportalShadowStartupState = (
  config: ShadowSimulationConfig | undefined,
  selection: GeoportalShadowSimulationHashSelection | null,
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
  const resolved = resolveGeoportalShadowHashSelection(
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
