import type { Positions } from "@carma-mapping/map-controls-layout";

import type { OriginLocation } from "./originChannel";

/**
 * What the origin search is configured with. The value it produces is not in
 * here: it lives on the `originLocation` channel, see `originChannel.ts`.
 */
export type OriginSearchConfig = {
  /** where the input sits. Default: above the app's own search, bottom left */
  controlPosition?: Positions;
  controlOrder?: number;
  /** the starting point before anything is picked. Default: Rathaus Wuppertal */
  defaultOrigin?: OriginLocation;
  /** what stands in front of the current origin in the placeholder */
  placeholderPrefix?: string;
  pixelwidth?: number | string;
  /**
   * Render the input even when nothing asked for an origin. Default: false,
   * which is what keeps it off screen until a consumer needs it.
   */
  alwaysVisible?: boolean;
};

/** the geoportal's own search is `bottomleft` order 10, so this sits above it */
export const DEFAULT_CONTROL_POSITION: Positions = "bottomleft";
export const DEFAULT_CONTROL_ORDER = 20;
export const DEFAULT_PLACEHOLDER_PREFIX = "Von:";
export const DEFAULT_PIXELWIDTH = "300px";
/** Rathaus Wuppertal, the point "In der Nähe" has always measured from */
export const DEFAULT_ORIGIN: OriginLocation = {
  lat: 51.2725716,
  lng: 7.1999207,
  label: "Rathaus Wuppertal",
};
