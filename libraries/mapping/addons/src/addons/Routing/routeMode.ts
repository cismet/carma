import type { TravelMode } from "@carma-mapping/routing";

/**
 * How the user travels. What a route was computed with, and what the mode
 * picker offers; `transit` is typed now and built later, since a transit
 * itinerary is legs and a departure time rather than one line.
 */
export type RouteMode = "car" | "bike" | "walk" | "transit";

/**
 * The mode the routing lib can compute as one line for a mode of the channel.
 * `transit` has no line yet and is routed as a car trip until it does, so a
 * route that publishes it still gets an answer rather than none.
 */
export const travelModeOf = (mode: RouteMode): TravelMode =>
  mode === "transit" ? "car" : mode;
