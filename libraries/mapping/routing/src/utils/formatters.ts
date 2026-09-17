import {
  faCar,
  faWalking,
  faBicycle,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

import type { RouteDirection } from "./carRoute";

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

/**
 * The distance to the next turn, as a navigation shows it: rounded to 10 m
 * under a kilometer and to 100 m above, so a display fed once a second does
 * not flicker through every meter. Never "0 m" while there is anything left.
 */
export function formatTurnDistance(meters: number): string {
  if (meters < 1000) {
    return `${METERS.format(Math.max(10, Math.round(meters / 10) * 10))} m`;
  }
  return `${KILOMETERS.format(Math.round(meters / 100) / 10)} km`;
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

/**
 * The turn itself, before the street it leads onto. The verb is left off the
 * ones that are not a turn: "Abfahrt", "weiter", "wenden", "im Kreisverkehr",
 * and the roundabout gets no exit number because the service sends none.
 */
const DIRECTION_TEXT: Record<RouteDirection, string> = {
  DEPART: "Abfahrt",
  CONTINUE: "weiter",
  SLIGHTLY_LEFT: "leicht links halten",
  LEFT: "links abbiegen",
  HARD_LEFT: "scharf links abbiegen",
  SLIGHTLY_RIGHT: "leicht rechts halten",
  RIGHT: "rechts abbiegen",
  HARD_RIGHT: "scharf rechts abbiegen",
  UTURN_LEFT: "wenden",
  UTURN_RIGHT: "wenden",
  CIRCLE_CLOCKWISE: "im Kreisverkehr",
  CIRCLE_COUNTERCLOCKWISE: "im Kreisverkehr",
  STAIRS: "Treppe nehmen",
  ELEVATOR: "Aufzug nehmen",
};

/**
 * One instruction as a driver would hear it: "rechts abbiegen auf Bahnstraße",
 * "weiter auf Friedrich-Engels-Allee", "wenden". Without a street name (an
 * unnamed way) the turn stands alone rather than saying "auf unbenannter
 * Straße", which would only lengthen a line that already says what to do.
 */
export function formatDirection(
  direction: RouteDirection,
  streetName?: string
): string {
  const turn = DIRECTION_TEXT[direction] ?? direction;
  return streetName ? `${turn} auf ${streetName}` : turn;
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
