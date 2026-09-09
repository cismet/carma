/**
 * What a route looks like, everywhere one is drawn: the candidates of a
 * ranking, the line that is being driven, the options of the route drawer. One
 * place, for the same reason the formatters are one place: two routes on one
 * map must not disagree about what blue is.
 */

/** the route in question: the picked candidate, the way still ahead */
export const ROUTE_BLUE = "#3b82f6";

/** a route that is not the point right now: an unpicked candidate, a driven stretch */
export const ROUTE_GRAY = "#6b7280";

/** the outline under a route, so it reads on a dark basemap as well as a light one */
export const ROUTE_CASING = "#ffffff";
