import type { SolarLocation } from "./solar-position";

export type GeographicPosition = Readonly<{
  latitude: number;
  longitude: number;
}>;

export const resolveSolarLocation = (
  position: GeographicPosition | null,
  fallback: GeographicPosition
): SolarLocation => ({
  latitude: position?.latitude ?? fallback.latitude,
  longitude: position?.longitude ?? fallback.longitude,
});

export const areSolarLocationsEqual = (
  left: SolarLocation,
  right: SolarLocation
): boolean =>
  left.latitude === right.latitude &&
  left.longitude === right.longitude;
