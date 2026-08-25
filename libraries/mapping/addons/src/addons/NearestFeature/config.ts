import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { DEFAULT_ORIGIN as DEFAULT_ORIGIN_LOCATION } from "../OriginSearch/config";

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
   */
  origin?: { lat: number; lng: number };
  /**
   * Fetch the tilesets' feature indexes as soon as their sources appear in the
   * style, rather than on the first search. Default: true.
   */
  preloadIndexes?: boolean;
};

/**
 * Where a route that declares no origin of its own measures from, and what the
 * mode falls back to while the `originLocation` channel carries nothing (a
 * route without the `originSearch` addon). The same point as the origin
 * search's default, so the two cannot drift apart.
 */
export const DEFAULT_ORIGIN = {
  lat: DEFAULT_ORIGIN_LOCATION.lat,
  lng: DEFAULT_ORIGIN_LOCATION.lng,
};
export const DEFAULT_COUNT = 5;
/** the mode's key in the dropdown, which is about "nearby", not about the kind */
export const DEFAULT_KEY = "nearby";
export const DEFAULT_LABEL = "In der Nähe";
export const DEFAULT_PLACEHOLDER = "Was in der Nähe?";
export const DEFAULT_ICON = faLocationCrosshairs;
