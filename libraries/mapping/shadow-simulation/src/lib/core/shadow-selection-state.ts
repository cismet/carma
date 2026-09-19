import { getDaysInYear } from "@carma-commons/utils";

import type {
  ShadowDateState,
  ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { clampShadowSimulationSelectionToDaylight } from "./solar-position";

type ShadowSelection = Readonly<{
  minutes: number;
  dayOfYear: number;
  /** Whether the shared link also opens the tile diagnostics. */
  tileDiagnostics?: boolean;
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
      selection.dayOfYear === hashSelection.dayOfYear &&
      (selection.tileDiagnostics ?? false) ===
        (hashSelection.tileDiagnostics ?? false);

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
        tileDiagnostics: selection.tileDiagnostics ?? false,
      }
    : null;
};

export const applyShadowHashSelection = (
  shadowState: ShadowSimulationState,
  dateState: ShadowDateState,
  selection: ShadowSelection | null
): { shadowState: ShadowSimulationState; dateState: ShadowDateState } => ({
  shadowState: {
    ...shadowState,
    enabled: selection !== null,
    // The link owns the overlay only while it carries a selection; without
    // one there is nothing to restore and the current toggle stands.
    ...(selection
      ? { showTileDiagnostics: selection.tileDiagnostics === true }
      : {}),
  },
  // Only the date fields of the selection belong to the date state.
  dateState: selection
    ? {
        ...dateState,
        minutes: selection.minutes,
        dayOfYear: selection.dayOfYear,
      }
    : dateState,
});
