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
  /** where "nearby" is measured from. Default: Rathaus Wuppertal */
  origin?: { lat: number; lng: number };
  /**
   * Fetch the tilesets' feature indexes as soon as their sources appear in the
   * style, rather than on the first search. Default: true.
   */
  preloadIndexes?: boolean;
};

/**
 * The geoportal's home view. Kept in step with the app's
 * `DEFAULT_HOME_VIEW_REF`, which the route passes explicitly; this is the
 * fallback for a host that declares no origin of its own.
 */
export const DEFAULT_ORIGIN = { lat: 51.2725716, lng: 7.1999207 };
export const DEFAULT_COUNT = 5;
/** the mode's key in the dropdown, which is about "nearby", not about the kind */
export const DEFAULT_KEY = "nearby";
export const DEFAULT_LABEL = "In der Nähe";
export const DEFAULT_PLACEHOLDER = "Was in der Nähe?";
export const DEFAULT_ICON = faLocationCrosshairs;
