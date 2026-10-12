import { clamp } from "@carma-commons/math";
import type { Meters } from "@carma-units";

/**
 * A picked point moves toward the camera by a small share of its distance, so
 * the measurement drawn from it wins the depth test against the clicked
 * surface. MapLibre's projection matrix carries no usable near and far planes
 * for the shared scene: the step is the relative resolution of a 24-bit depth
 * buffer at street-scale distances, kept between 0.5 mm and 9 mm so the move
 * never changes a measured value.
 */
export const MAPLIBRE_PICK_LIFT_DEFAULTS = Object.freeze({
  /** Lift per metre of distance to the camera: 0.1 mm at 1 m, 3.5 mm at 35 m. */
  relativeLift: 1e-4,
  minMeters: 0.0005 as Meters,
  maxMeters: 0.009 as Meters,
});

export const resolvePickLiftMeters = (distanceMeters: number): Meters => {
  const { relativeLift, minMeters, maxMeters } = MAPLIBRE_PICK_LIFT_DEFAULTS;
  return distanceMeters > 0
    ? (clamp(distanceMeters * relativeLift, minMeters, maxMeters) as Meters)
    : minMeters;
};
