import {
  along,
  bearing as turfBearing,
  length,
  lineString,
  nearestPointOnLine,
  point,
} from "@turf/turf";

/**
 * Where the camera goes for a route: the user's place on it, and the
 * direction the route continues in from there, so it runs up the screen.
 *
 * Without a position it is the start of the route. With one, the position is
 * snapped onto the line: GPS wanders a few meters sideways, and a tilted
 * camera centred beside the road shows the road beside the dot. How far it
 * wandered is reported as `offRoute`, so the caller can stop trusting the
 * snap once the user has actually left the route.
 *
 * The bearing looks `lookAheadMeters` further along the line, a short
 * distance by default: the next meters are what the user walks or drives
 * next, so they run straight up the screen, and a turn is where the map shows
 * it. Looking further ahead averages the next turn into the bearing and the
 * road comes out slanted. The distance is measured along the line rather than
 * taken as the next vertex, so a densely digitised stretch (many vertices
 * within a meter) gives the same direction as a sparse one. Fewer meters left
 * than the look-ahead point at the end, which is all that is left anyway.
 */
export type RouteCameraTarget = {
  /** `[lng, lat]` the camera centres on: the place on the route */
  center: [number, number];
  /** degrees clockwise from north, MapLibre's own convention */
  bearing: number;
  /** meters of route behind `center` */
  along: number;
  /** meters of route ahead of `center` */
  remaining: number;
  /** meters between the given position and `center`; 0 without a position */
  offRoute: number;
};

const METERS = { units: "meters" } as const;

export const routeCameraTarget = (
  coordinates: [number, number][],
  lookAheadMeters: number,
  position?: [number, number]
): RouteCameraTarget | null => {
  if (coordinates.length === 0) {
    return null;
  }
  if (coordinates.length < 2) {
    return {
      center: coordinates[0],
      bearing: 0,
      along: 0,
      remaining: 0,
      offRoute: 0,
    };
  }
  const line = lineString(coordinates);
  const total = length(line, METERS);

  let center = coordinates[0];
  let travelled = 0;
  let offRoute = 0;
  if (position) {
    const snapped = nearestPointOnLine(line, point(position), METERS);
    center = snapped.geometry.coordinates as [number, number];
    travelled = snapped.properties.location ?? 0;
    offRoute = snapped.properties.dist ?? 0;
  }

  const remaining = Math.max(0, total - travelled);
  // at the very end there is nothing ahead to point at: keep pointing the way
  // the last stretch went
  const from =
    remaining < 0.5
      ? along(line, Math.max(0, total - lookAheadMeters), METERS)
      : point(center);
  const to =
    remaining < 0.5
      ? point(coordinates[coordinates.length - 1])
      : along(line, Math.min(total, travelled + lookAheadMeters), METERS);
  const bearing = turfBearing(from, to);

  // turf gives -180..180; MapLibre takes that as it is, but a normalised
  // value reads better in the hash and in dev tools
  return {
    center,
    bearing: (bearing + 360) % 360,
    along: travelled,
    remaining,
    offRoute,
  };
};
