export type GeographicBounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export const geographicBoundsIntersect = (
  left: GeographicBounds,
  right: GeographicBounds
): boolean =>
  left.west <= right.east &&
  left.east >= right.west &&
  left.south <= right.north &&
  left.north >= right.south;

export const geographicBoundsContain = (
  outer: GeographicBounds,
  inner: GeographicBounds
): boolean =>
  outer.west <= inner.west &&
  outer.south <= inner.south &&
  outer.east >= inner.east &&
  outer.north >= inner.north;

export const getGeographicRingBounds = (
  ring: readonly (readonly [number, number])[]
): GeographicBounds => {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [longitude, latitude] of ring) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return { west, south, east, north };
};

export const padGeographicBounds = <T extends GeographicBounds>(
  bounds: T,
  factor: number
): GeographicBounds => {
  const longitudePadding = (bounds.east - bounds.west) * factor;
  const latitudePadding = (bounds.north - bounds.south) * factor;
  return {
    west: bounds.west - longitudePadding,
    south: Math.max(-90, bounds.south - latitudePadding),
    east: bounds.east + longitudePadding,
    north: Math.min(90, bounds.north + latitudePadding),
  };
};

export const unionGeographicBounds = (
  left: GeographicBounds,
  right: GeographicBounds
): GeographicBounds => ({
  west: Math.min(left.west, right.west),
  south: Math.min(left.south, right.south),
  east: Math.max(left.east, right.east),
  north: Math.max(left.north, right.north),
});
