import type { GeographicBounds } from "./geographic-bounds";

const assertOrderedBounds = (bounds: GeographicBounds): void => {
  if (
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.north) ||
    bounds.west > bounds.east ||
    bounds.south > bounds.north
  ) {
    throw new RangeError(
      "Expected finite, ordered geographic bounds; split antimeridian-wrapping bounds before intersection"
    );
  }
};

/**
 * Positive-area intersection in one shared, unwrapped longitude frame.
 * Touching edges and empty bounds return null. Longitudes are not normalized:
 * 170..190 is an ordered interval, while the wrapped form 170..-170 is rejected.
 * Callers own splitting wrapped bounds and aligning world copies beforehand.
 */
export const intersectUnwrappedGeographicBounds = (
  left: GeographicBounds,
  right: GeographicBounds
): GeographicBounds | null => {
  assertOrderedBounds(left);
  assertOrderedBounds(right);
  const west = Math.max(left.west, right.west);
  const south = Math.max(left.south, right.south);
  const east = Math.min(left.east, right.east);
  const north = Math.min(left.north, right.north);
  return west < east && south < north ? { west, south, east, north } : null;
};
