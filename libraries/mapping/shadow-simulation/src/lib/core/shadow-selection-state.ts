import { getDaysInYear } from "@carma-commons/utils";

import type {
  ShadowDateState,
  ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { clampShadowSimulationSelectionToDaylight } from "./solar-position";

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
