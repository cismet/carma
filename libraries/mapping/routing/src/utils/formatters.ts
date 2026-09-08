import {
  faCar,
  faWalking,
  faBicycle,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

/**
 * How a route's numbers read, everywhere they are shown: the rows of "In der
 * Nähe", the note in the info box, the route options list. One place, so the
 * same route never says "12 Min" here and "11 Min" there.
 */

/**
 * A travel time, rounded to whole minutes. Never "0 Min": a place around the
 * corner takes a moment, and a zero would read as "no route".
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} Min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} Std` : `${hours} Std ${rest} Min`;
}

const METERS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const KILOMETERS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** a distance in meters below a kilometer, in kilometers with one decimal above */
export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${METERS.format(meters)} m`
    : `${KILOMETERS.format(meters / 1000)} km`;
}

/** "12 Min · 4,3 km" */
export function formatRouteSummary(
  durationInSeconds: number,
  distanceInMeters: number
): string {
  return `${formatDuration(durationInSeconds)} · ${formatDistance(
    distanceInMeters
  )}`;
}

export function getModeIcon(mode: string): IconDefinition {
  switch (mode?.toLowerCase()) {
    case "car":
      return faCar;
    case "walk":
    case "walking":
      return faWalking;
    case "bike":
    case "bicycle":
      return faBicycle;
    default:
      return faCar;
  }
}

export function getModeLabel(mode: string): string {
  switch (mode?.toLowerCase()) {
    case "car":
      return "Auto";
    case "walk":
    case "walking":
      return "Zu Fuß";
    case "bike":
    case "bicycle":
      return "Fahrrad";
    default:
      return mode || "Route";
  }
}
