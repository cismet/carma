import { poseAt, type Track } from "./track";

const METERS_PER_LAT = 111320;

/** where the camera can sit during a ride, in the order the switcher shows them */
export const RIDE_VIEWS = ["front", "left", "right", "back", "outside"] as const;
export type RideView = (typeof RIDE_VIEWS)[number];

/** A place relative to the vehicle, whichever way it is travelling. */
export type RideSpot = {
  /** meters ahead of the vehicle's middle along the track, negative behind */
  along: number;
  /** meters to the left of the direction of travel, negative to the right */
  side: number;
  /** meters above the height of the eye in the cab */
  raise: number;
};

/** just past the glass at the end of the car */
const CAB_EYE_BEYOND_END_METERS = 1;
/** a good way along the track, so curves turn the view gently instead of swinging it with every vertex */
const LOOK_METERS = 60;
const OUTSIDE_BEHIND_END_METERS = 22;
const OUTSIDE_SIDE_METERS = 6;
const OUTSIDE_RAISE_METERS = 1.5;
/** half the chord that gives "sideways", so the view does not jump at each track point */
const SIDEWAYS_CHORD_METERS = 15;

const spot = (along: number, side = 0, raise = 0): RideSpot => ({
  along,
  side,
  raise,
});

/** where the eye sits and what it looks at, for a vehicle `lengthMeters` long */
export const rideViewSpots = (
  view: RideView,
  lengthMeters: number
): { eye: RideSpot; target: RideSpot } => {
  const cabEye = lengthMeters / 2 + CAB_EYE_BEYOND_END_METERS;
  switch (view) {
    case "front":
      return { eye: spot(cabEye), target: spot(cabEye + LOOK_METERS) };
    case "back":
      return { eye: spot(-cabEye), target: spot(-cabEye - LOOK_METERS) };
    case "left":
      return { eye: spot(0), target: spot(0, LOOK_METERS) };
    case "right":
      return { eye: spot(0), target: spot(0, -LOOK_METERS) };
    case "outside":
      return {
        eye: spot(
          -lengthMeters / 2 - OUTSIDE_BEHIND_END_METERS,
          OUTSIDE_SIDE_METERS,
          OUTSIDE_RAISE_METERS
        ),
        target: spot(0),
      };
  }
};

/**
 * Where the model of the train shows a view: a place on the ring around it, the
 * side of the train that the real camera is on, not the camera's true distance.
 */
export type RideViewMarker = {
  /** unit vector in the car model's plane: +x ahead, +z right of travel */
  at: readonly [x: number, z: number];
  /** whether the view looks away from the train, or at it */
  looksOutward: boolean;
};

const BEHIND_LEFT = -Math.SQRT1_2;

export const rideViewMarker = (view: RideView): RideViewMarker => {
  switch (view) {
    case "front":
      return { at: [1, 0], looksOutward: true };
    case "back":
      return { at: [-1, 0], looksOutward: true };
    case "left":
      return { at: [0, -1], looksOutward: true };
    case "right":
      return { at: [0, 1], looksOutward: true };
    case "outside":
      return { at: [BEHIND_LEFT, BEHIND_LEFT], looksOutward: false };
  }
};

/**
 * The unit vector [east, north] to the left of a vehicle travelling in
 * `direction` at `distance`. It is [0, 0] where the track gives no direction.
 */
export const leftOfTravel = (
  track: Track,
  distance: number,
  direction: number,
  wrapDistance: (distance: number) => number
): [number, number] => {
  const behind = poseAt(
    track,
    wrapDistance(distance - SIDEWAYS_CHORD_METERS * direction)
  );
  const ahead = poseAt(
    track,
    wrapDistance(distance + SIDEWAYS_CHORD_METERS * direction)
  );
  const east = (ahead.lon - behind.lon) * track.metersPerLon;
  const north = (ahead.lat - behind.lat) * METERS_PER_LAT;
  const length = Math.hypot(east, north);
  return length > 0 ? [-north / length, east / length] : [0, 0];
};
