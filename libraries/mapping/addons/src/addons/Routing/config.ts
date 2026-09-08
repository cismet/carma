export type RoutingConfig = {
  /** the zoom the map goes to at the start of the route; default 18 */
  zoom?: number;
  /** camera tilt in degrees; default 30, 0 is flat */
  pitch?: number;
  /** how far along the route the bearing looks, in meters; default 10 */
  lookAheadMeters?: number;
  /** how long the camera takes to get there, in ms; default 1200 */
  duration?: number;
};

export const DEFAULT_ZOOM = 18;
export const DEFAULT_PITCH = 30;
export const DEFAULT_LOOK_AHEAD_METERS = 10;
export const DEFAULT_DURATION = 1200;
