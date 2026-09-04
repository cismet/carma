import { ENDPOINT, isAreaType } from "@carma-commons/resources";
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
  /**
   * A fixed starting point. Set it and the search starts there instead of
   * asking the device where the user is. Default: unset, i.e. own position.
   */
  defaultOrigin?: OriginLocation;
  /** what stands in front of the current origin in the placeholder */
  placeholderPrefix?: string;
  /** the fixed label inside the input that says the search starts here */
  inputPrefix?: string;
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
/** empty by default: the input already says "Von:", the placeholder need not */
export const DEFAULT_PLACEHOLDER_PREFIX = "";
export const DEFAULT_INPUT_PREFIX = "Von:";
/**
 * As wide as the app's own search, whatever that is: the bottom-left control
 * column is as wide as its widest child, which is that search, so `100%` is
 * 300px next to it on a desktop and the full screen next to it on a phone. A
 * route that wants a width of its own configures `pixelwidth`.
 */
export const DEFAULT_PIXELWIDTH = "100%";
/**
 * The gaz topics the origin search does not offer: a starting point is a point,
 * and a district is a shape whose one coordinate is a centroid nobody starts a
 * walk at. What everything reads from the channel is a lat/lng, so an area
 * would silently become its middle.
 */
export const EXCLUDED_TYPES = Object.values(ENDPOINT).filter(isAreaType);
/** what the input calls the origin while it is the device's own position */
export const OWN_POSITION_LABEL = "Mein Standort";
/** while the browser is asking, the permission prompt included */
export const LOCATING_PLACEHOLDER = "Standort wird ermittelt …";
/** no own position and no configured one: the user says where to start */
export const NO_ORIGIN_PLACEHOLDER = "Startpunkt suchen";
/**
 * The same thing said twice on purpose: the toast is what is noticed, and the
 * placeholder is what is still there once it has faded, so the empty input is
 * never left looking like it simply has nothing to say.
 */
export const NO_POSITION_PLACEHOLDER = "Standort unbekannt: Startpunkt suchen";
/** what the toast says, by what went wrong; see `OwnPositionProblem` */
export const NO_POSITION_WARNINGS = {
  denied:
    "Standortfreigabe abgelehnt. Der Startpunkt kann nicht auf Ihren Standort gesetzt werden: bitte suchen Sie ihn.",
  unavailable:
    "Ihr Standort konnte nicht ermittelt werden. Bitte suchen Sie den Startpunkt.",
  unsupported:
    "Dieser Browser kann Ihren Standort nicht ermitteln. Bitte suchen Sie den Startpunkt.",
} as const;
