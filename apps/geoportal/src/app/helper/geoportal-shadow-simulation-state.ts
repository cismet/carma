import type {
  ShadowDateState,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";
import { clampShadowSimulationSelectionToDaylight } from "@carma-mapping/shadow-simulation";

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
