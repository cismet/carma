import type { Positions } from "@carma-mapping/map-controls-layout";
import { ROUTE_BLUE, ROUTE_GRAY } from "@carma-mapping/routing";

export type RoutingConfig = {
  /**
   * where the recenter button sits while the follow is paused; default
   * topcenter, under the layer bar
   */
  recenterPosition?: Positions;
  /** default 20, which is after the layer bar's 10 */
  recenterOrder?: number;
  /** what the recenter button says; default "Zentrieren" */
  recenterLabel?: string;
  /**
   * where the card with the next instruction sits while navigating; default
   * bottomcenter, at the bottom of the map
   */
  instructionPosition?: Positions;
  /** default 10 */
  instructionOrder?: number;
  /**
   * The card warns of a second turn close behind the next one ("dann links
   * abbiegen") when the stretch between the two is shorter than this, in
   * meters; default 150
   */
  thenWithinMeters?: number;
  /**
   * ... and the user is closer to the next turn than this, in meters;
   * default 300, so the warning is not up for a whole kilometer
   */
  thenAnnounceMeters?: number;
  /**
   * the zoom the map goes to on the route, in MapLibre's 512 px tile zoom,
   * the unit of `map.easeTo`; the geoportal's URL hash is written in the
   * Leaflet convention and shows this value plus one. Default 18, close in
   * the way a navigation app is (the map allows 22)
   */
  zoom?: number;
  /** camera tilt in degrees; default 30, 0 is flat */
  pitch?: number;
  /** how far along the route the bearing looks, in meters; default 10 */
  lookAheadMeters?: number;
  /** how long the camera takes to get on or off the route, in ms; default 1200 */
  duration?: number;
  /**
   * how long the camera takes to move to each position fix, in ms; default
   * 1000, about one fix interval, so one move runs into the next and the map
   * goes at the user's pace rather than in hops
   */
  followDuration?: number;
  /**
   * how far off the route a fix may be and still be snapped onto it, in
   * meters; default 30. Further off, the camera follows the fix as it is
   */
  snapToleranceMeters?: number;
  /** how close to the end counts as arrived, in meters; default 15 */
  arrivalMeters?: number;
  /** the stretch still ahead of the user; default the shared route blue */
  aheadColor?: string;
  /** the stretch already driven; default the shared route gray */
  travelledColor?: string;
  /**
   * When the host's controls go off the screen for the duration of a
   * navigation, so the map is all there is (plus the navigation's own row
   * and the recenter button). "mobile" (default): on phones and tablets, by
   * user agent; "always"; "never".
   */
  mapOnly?: MapOnlyMode;
};

export type MapOnlyMode = "mobile" | "always" | "never";

/**
 * What the info box note says in front of the numbers while a navigation runs
 * ("noch 6 Min · 2,1 km"), so the countdown is not mistaken for the whole
 * route's summary. A constant rather than config: no route has wanted another
 * word yet.
 */
export const REMAINING_PREFIX = "noch";

export const DEFAULT_RECENTER_POSITION: Positions = "topcenter";
export const DEFAULT_RECENTER_ORDER = 20;
export const DEFAULT_RECENTER_LABEL = "Zentrieren";
export const DEFAULT_INSTRUCTION_POSITION: Positions = "bottomcenter";
export const DEFAULT_INSTRUCTION_ORDER = 10;
export const DEFAULT_THEN_WITHIN_METERS = 150;
export const DEFAULT_THEN_ANNOUNCE_METERS = 300;
export const DEFAULT_ZOOM = 18;
export const DEFAULT_PITCH = 30;
export const DEFAULT_LOOK_AHEAD_METERS = 10;
export const DEFAULT_DURATION = 1200;
export const DEFAULT_FOLLOW_DURATION = 1000;
export const DEFAULT_SNAP_TOLERANCE_METERS = 30;
export const DEFAULT_ARRIVAL_METERS = 15;
export const DEFAULT_AHEAD_COLOR = ROUTE_BLUE;
export const DEFAULT_TRAVELLED_COLOR = ROUTE_GRAY;
export const DEFAULT_MAP_ONLY: MapOnlyMode = "mobile";
