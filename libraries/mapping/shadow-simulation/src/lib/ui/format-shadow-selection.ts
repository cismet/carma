import type { SolarSelection } from "../core/solar-position";

export const formatShadowSelection = (
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "minutes">
): string => {
  const date = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selection.year, 0, selection.dayOfYear)));
  const roundedMinutes = Math.round(selection.minutes);
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutes = String(roundedMinutes % 60).padStart(2, "0");
  return `${date} · ${hours}:${minutes}`;
};
