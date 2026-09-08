import { along, bearing as turfBearing, lineString, point } from "@turf/turf";

/**
 * Where the camera goes for a route: its start, and the direction the route
 * leaves in, so it runs up the screen.
 *
 * The bearing looks `lookAheadMeters` along the line, a short distance by
 * default: the first meters of the route are what the user walks or drives
 * first, so they run straight up the screen, and the first turn is where the
 * map shows it. Looking further ahead averages the first turn into the
 * bearing and the start leg comes out slanted. The distance is measured along
 * the line rather than taken as the second vertex, so a densely digitised
 * start (many vertices within a meter) gives the same direction as a sparse
 * one. A route shorter than the look-ahead points at its end, which is the
 * whole route anyway.
 */
export type RouteCameraTarget = {
  /** `[lng, lat]` of the route's first coordinate */
  center: [number, number];
  /** degrees clockwise from north, MapLibre's own convention */
  bearing: number;
};

export const routeCameraTarget = (
  coordinates: [number, number][],
  lookAheadMeters: number
): RouteCameraTarget | null => {
  if (coordinates.length === 0) {
    return null;
  }
  const center = coordinates[0];
  if (coordinates.length < 2) {
    return { center, bearing: 0 };
  }
  const line = lineString(coordinates);
  const ahead = along(line, lookAheadMeters / 1000, { units: "kilometers" });
  const bearing = turfBearing(point(center), ahead);
  // turf gives -180..180; MapLibre takes that as it is, but a normalised
  // value reads better in the hash and in dev tools
  return { center, bearing: (bearing + 360) % 360 };
};
