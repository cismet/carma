/**
 * How the user travels. What a route was computed with, and later what the
 * mode picker offers; `transit` is typed now and built later, since a transit
 * itinerary is legs and a departure time rather than one line.
 */
export type RouteMode = "car" | "bike" | "walk" | "transit";
