import type { ShadowDateState } from "../contracts/shadow-simulation";
import {
  clampSelectionToDaylight,
  getSolarSelectionForInstant,
  type SolarLocation,
} from "./solar-position";

export const updateShadowDateState = (
  state: ShadowDateState,
  candidate: ShadowDateState,
  location: SolarLocation
): ShadowDateState => clampSelectionToDaylight(candidate, location) ?? state;

export const updateShadowCalendarDate = (
  state: ShadowDateState,
  year: number,
  dayOfYear: number,
  location: SolarLocation
): ShadowDateState =>
  updateShadowDateState(state, { ...state, year, dayOfYear }, location);

export const updateShadowToCurrentDate = (
  state: ShadowDateState,
  location: SolarLocation,
  instant = new Date()
): ShadowDateState => {
  const today = getSolarSelectionForInstant(instant, state.timeZone);
  return updateShadowDateState(
    state,
    { ...today, minutes: state.minutes },
    location
  );
};

export const resetShadowDateState = (
  state: ShadowDateState,
  location: SolarLocation,
  instant = new Date()
): ShadowDateState => {
  const now = getSolarSelectionForInstant(instant, state.timeZone);
  return clampSelectionToDaylight(now, location) ?? state;
};
