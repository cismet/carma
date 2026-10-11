/**
 * A picked point moves toward the observer by a small share of its distance,
 * so the measurement drawn from it sits on top of the clicked surface instead
 * of fighting it in the depth buffer. MapLibre's projection matrix does not
 * carry usable near and far planes for the shared scene, so the step is the
 * relative depth resolution a 24-bit buffer keeps at street-scale distances.
 * Never less than half a millimetre and never into the centimetres: the move
 * must not change a measured value.
 */
export const MAPLIBRE_PICK_LIFT_DEFAULTS = Object.freeze({
  /** Lift per metre of distance to the camera: 0.1 mm at 1 m, 3.5 mm at 35 m. */
  relativeLift: 1e-4,
  minMeters: 0.0005,
  maxMeters: 0.009,
});

export const resolvePickLiftMeters = (distanceMeters: number): number => {
  if (!(distanceMeters > 0)) return MAPLIBRE_PICK_LIFT_DEFAULTS.minMeters;
  return Math.min(
    MAPLIBRE_PICK_LIFT_DEFAULTS.maxMeters,
    Math.max(
      MAPLIBRE_PICK_LIFT_DEFAULTS.minMeters,
      distanceMeters * MAPLIBRE_PICK_LIFT_DEFAULTS.relativeLift
    )
  );
};
