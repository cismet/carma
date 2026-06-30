// Move-gizmo disc resize-trigger semantics (cismet/wupp#4078).
//
// The pure screen-targeted sizing maths (world size for a screen target, 1-2-5
// quantization, hysteresis re-stepping, circle tessellation) live generically in
// `@carma-commons/math` (`screen-scale-sizing`) since they are shared by the
// gizmo disc, the point-query disc and any other known-scale reference object.
// What remains here is only the gizmo-specific UI choice of *when* the disc
// resizes.

export const GIZMO_DISC_RESIZE_TRIGGERS = {
  // Recompute every frame to hold a target screen size (the conventional
  // constant-pixel manipulator behaviour).
  CAMERA: "camera",
  // Hold the world size fixed for the whole selection and only step to the next
  // size once the on-screen resolution doubles or halves — the scale-bar rule.
  SELECTION: "selection",
} as const;

export type GizmoDiscResizeTrigger =
  (typeof GIZMO_DISC_RESIZE_TRIGGERS)[keyof typeof GIZMO_DISC_RESIZE_TRIGGERS];
