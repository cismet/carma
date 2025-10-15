import type { Latitude, Longitude } from "@carma/geo/types";
import {
  negativePiToPi,
  negativeOneEightyToOneEighty,
  PI,
  PI_OVER_TWO,
} from "@carma/units/helpers";

export function isValidLatitudeDeg(lat: Latitude.deg): boolean {
  return lat >= -90 && lat <= 90;
}

export function isValidLongitudeDeg(lng: Longitude.deg): boolean {
  return lng >= -180 && lng <= 180;
}

export function isValidLatitudeRad(lat: Latitude.rad): boolean {
  return lat >= -PI_OVER_TWO && lat <= PI_OVER_TWO;
}

export function isValidLongitudeRad(lng: Longitude.rad): boolean {
  return lng >= -PI && lng <= PI;
}

export function normalizeLatitudeDeg(lat: Latitude.deg): Latitude.deg {
  return Math.max(-90, Math.min(90, lat)) as Latitude.deg;
}

export function normalizeLatitudeRad(lat: Latitude.rad): Latitude.rad {
  return Math.max(-PI_OVER_TWO, Math.min(PI_OVER_TWO, lat)) as Latitude.rad;
}

export function normalizeLongitudeDeg(lng: Longitude.deg): Longitude.deg {
  return negativeOneEightyToOneEighty(lng as any) as Longitude.deg;
}

export function normalizeLongitudeRad(lng: Longitude.rad): Longitude.rad {
  return negativePiToPi(lng as any) as Longitude.rad;
}
