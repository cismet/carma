import type { Positions } from "@carma-mapping/map-controls-layout";
import { ROUTE_BLUE, ROUTE_GRAY } from "@carma-mapping/routing";

export type RoutingConfig = {
  /** where the recenter button sits while the follow is paused; default bottomcenter */
  recenterPosition?: Positions;
  recenterOrder?: number;
  /** what the recenter button says; default "Zentrieren" */
  recenterLabel?: string;
  /**
   * the zoom the map goes to on the route, in MapLibre's 512 px tile zoom,
   * the unit of `map.easeTo`; the geoportal's URL hash is written in the
   * Leaflet convention and shows this value plus one. Default 19, close in
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
};

/**
 * What the info box note says in front of the numbers while a navigation runs
 * ("noch 6 Min · 2,1 km"), so the countdown is not mistaken for the whole
 * route's summary. A constant rather than config: no route has wanted another
 * word yet.
 */
export const REMAINING_PREFIX = "noch";

export const DEFAULT_RECENTER_POSITION: Positions = "bottomcenter";
export const DEFAULT_RECENTER_ORDER = 10;
export const DEFAULT_RECENTER_LABEL = "Zentrieren";
export const DEFAULT_ZOOM = 19;
export const DEFAULT_PITCH = 30;
export const DEFAULT_LOOK_AHEAD_METERS = 10;
export const DEFAULT_DURATION = 1200;
export const DEFAULT_FOLLOW_DURATION = 1000;
export const DEFAULT_SNAP_TOLERANCE_METERS = 30;
export const DEFAULT_ARRIVAL_METERS = 15;
export const DEFAULT_AHEAD_COLOR = ROUTE_BLUE;
export const DEFAULT_TRAVELLED_COLOR = ROUTE_GRAY;
