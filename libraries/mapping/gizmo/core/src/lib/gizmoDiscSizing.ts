// Move-gizmo disc sizing (cismet/wupp#4078).
//
// Sizing has two independent dimensions:
//   1. Quantization — the world radius is either continuous, or snapped to a
//      1-2-5 decade series (…, 0.5, 1, 2, 5, 10, 20, 50, …) so the disc reads as
//      a recognizable round size and jumps between steps instead of breathing.
//   2. Resize trigger (managed by the caller) — recompute as the camera changes
//      to hold a target screen size (`camera`), or compute once when editing
//      starts and keep that world size (`selection`), letting perspective change
//      the apparent size in view.
//
// This module owns dimension 1 (a pure computation); dimension 2 is a caller
// concern (whether to recompute every frame or reuse a frozen value).

export const GIZMO_DISC_RESIZE_TRIGGERS = {
  CAMERA: "camera",
  SELECTION: "selection",
} as const;

export type GizmoDiscResizeTrigger =
  (typeof GIZMO_DISC_RESIZE_TRIGGERS)[keyof typeof GIZMO_DISC_RESIZE_TRIGGERS];

const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;

// Snap a positive value to the nearest entry of the 1-2-5 decade series.
export const snapWorldRadiusToNiceStep = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return value;
  }
  const decade = 10 ** Math.floor(Math.log10(value));
  let nearest = NICE_STEP_MANTISSAS[0] * decade;
  for (const mantissa of NICE_STEP_MANTISSAS) {
    const candidate = mantissa * decade;
    if (Math.abs(candidate - value) < Math.abs(nearest - value)) {
      nearest = candidate;
    }
  }
  return nearest;
};

export type ResolveGizmoDiscWorldRadiusInput = {
  // Desired on-screen disc radius in pixels.
  targetScreenPx: number;
  // Projected pixels per world unit at the disc origin.
  pixelPerWorld: number;
  // Snap the result to the 1-2-5 series when true.
  quantize: boolean;
};

// World radius that renders at ~targetScreenPx for the given projection scale,
// optionally quantized to the 1-2-5 series.
export const resolveGizmoDiscWorldRadius = ({
  targetScreenPx,
  pixelPerWorld,
  quantize,
}: ResolveGizmoDiscWorldRadiusInput): number => {
  if (!Number.isFinite(pixelPerWorld) || pixelPerWorld <= 0) {
    return targetScreenPx > 0 ? targetScreenPx : 0;
  }
  const continuousRadius = targetScreenPx / pixelPerWorld;
  return quantize
    ? snapWorldRadiusToNiceStep(continuousRadius)
    : continuousRadius;
};
