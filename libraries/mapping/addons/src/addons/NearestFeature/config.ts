import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

/**
 * What the mode itself is configured with. The categories it offers are not in
 * here: they are addons of their own that publish themselves on the
 * `nearestFeatureCategories` channel, see `categoryChannel.ts`.
 */
export type NearestFeatureConfig = {
  /** mode key in the dropdown. Default: "nearby" */
  key?: string;
  /** mode label in the dropdown. Default: "In der Nähe" */
  label?: string;
  /** the mode's icon, used for rows of a category that carries none */
  icon?: IconDefinition;
  placeholder?: string;
  /** how many hits the second stage lists. Default: 5 */
  count?: number;
  /**
   * Where "nearby" is measured from while nothing published an origin on the
   * `originLocation` channel, which the `originSearch` addon writes and which
   * wins over this. Default: Rathaus Wuppertal.
   *
   * With `originSearch` mounted the channel carries the user's own position, so
   * this is what a route without that addon measures from, and what stands in
   * while the device is still being asked or has declined to say.
   */
  origin?: { lat: number; lng: number };
  /**
   * Fetch the tilesets' feature indexes as soon as their sources appear in the
   * style, rather than on the first search. Default: true.
   */
  preloadIndexes?: boolean;
  /**
   * Route the `count` straight-line candidates by car and list them by driving
   * time instead of by straight-line distance. Default: true.
   *
   * Costs `count` requests to the routing service per ranking. Switch it off
   * for a route that has no routing service reachable, or where "as the crow
   * flies" is the answer that is wanted; the rows then show the straight-line
   * distance again, as they did before.
   */
  carRouteRanking?: boolean;
  fitPadding?: number;
};

/**
 * Where a route that declares no origin of its own measures from, and what the
 * mode falls back to while the `originLocation` channel carries nothing: a
 * route without the `originSearch` addon, or one where the device has not
 * (yet) said where the user is. Rathaus Wuppertal, the point "In der Nähe" has
 * always measured from.
 */
export const DEFAULT_ORIGIN = {
  lat: 51.2725716,
  lng: 7.1999207,
};
export const DEFAULT_COUNT = 5;
/** rank by car by default; the straight-line order is only the shortlist */
export const DEFAULT_CAR_ROUTE_RANKING = true;
/** the same clearance the geoportal's own zoom-to-feature keeps */
export const DEFAULT_FIT_PADDING = 60;
/** the mode's key in the dropdown, which is about "nearby", not about the kind */
export const DEFAULT_KEY = "nearby";
export const DEFAULT_LABEL = "In der Nähe";
export const DEFAULT_PLACEHOLDER = "Was in der Nähe?";
export const DEFAULT_ICON = faLocationCrosshairs;
