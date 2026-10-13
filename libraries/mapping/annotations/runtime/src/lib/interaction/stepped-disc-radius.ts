import { Vector3 } from "three";
import { shouldRestepScreenScale, snapToNiceStep } from "@carma-commons/math";
import type { Meters } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";

const MIN_STEPPED_RADIUS_METERS = 0.1 as Meters;

/** When a held world radius is picked again toward the screen target. */
export const DISC_RADIUS_RESIZE_TRIGGERS = Object.freeze({
  /** Once the scale at the point it was picked at leaves the step band. */
  SCALE_BAND: "scale-band",
  /** On every change of the view, at the point under the pointer then. */
  VIEW_CHANGE: "view-change",
});

export type DiscRadiusResizeTrigger =
  (typeof DISC_RADIUS_RESIZE_TRIGGERS)[keyof typeof DISC_RADIUS_RESIZE_TRIGGERS];

/** What a radius was picked under: the view and the scale at its point. */
export type HeldDiscRadiusBasis = {
  viewKey: string;
  /** Screen pixels per metre at the point the radius was picked at. */
  referenceScale: number;
};

/**
 * The world radius that shows `targetScreenRadiusCssPx` at `pixelsPerMeter`,
 * on a 1, 2, 5, 10, 20 m diameter series when quantised; null on a
 * degenerate scale.
 */
export const resolveDiscRadiusForScreenTarget = (
  pixelsPerMeter: number,
  targetScreenRadiusCssPx: number,
  quantize: boolean
): Meters | null => {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return null;
  const continuous = targetScreenRadiusCssPx / pixelsPerMeter;
  return Math.max(
    quantize ? snapToNiceStep(continuous * 2) / 2 : continuous,
    MIN_STEPPED_RADIUS_METERS
  ) as Meters;
};

/**
 * Whether a held radius is picked again. `current.referenceScale` is the
 * scale now at the point the held radius was picked at, so a pointer moving
 * between a near roof and the far ground changes neither it nor the view.
 */
export const shouldResizeHeldDiscRadius = (
  trigger: DiscRadiusResizeTrigger,
  held: HeldDiscRadiusBasis | null,
  current: HeldDiscRadiusBasis,
  stepFactor: number
): boolean =>
  held === null ||
  (trigger === DISC_RADIUS_RESIZE_TRIGGERS.VIEW_CHANGE
    ? held.viewKey !== current.viewKey
    : shouldRestepScreenScale(
        held.referenceScale,
        current.referenceScale,
        stepFactor
      ));

/** The camera as drawn and the viewport; equal keys mean an unchanged view. */
const readViewKey = (engine: AnnotationEngine): string => {
  const pose = engine.getCameraPose();
  if (!pose) return "";
  const { positionECEF, directionECEF, upECEF, verticalFovRad } = pose;
  return [
    ...positionECEF.toArray(),
    ...directionECEF.toArray(),
    ...upECEF.toArray(),
    verticalFovRad,
    engine.canvas.clientWidth,
    engine.canvas.clientHeight,
  ].join();
};

/**
 * A world disc radius picked so the disc comes out near a screen target and
 * held until the `trigger` picks it again, see `shouldResizeHeldDiscRadius`.
 */
export const createSteppedDiscRadius = ({
  engine,
  stepFactor,
  targetScreenRadiusCssPx,
  quantize,
  fallbackRadiusMeters,
  trigger = DISC_RADIUS_RESIZE_TRIGGERS.SCALE_BAND,
}: {
  engine: AnnotationEngine;
  stepFactor: number;
  targetScreenRadiusCssPx: number;
  quantize: boolean;
  fallbackRadiusMeters: number;
  trigger?: DiscRadiusResizeTrigger;
}) => {
  const byView = trigger === DISC_RADIUS_RESIZE_TRIGGERS.VIEW_CHANGE;
  let radiusMeters: number | null = null;
  let held: HeldDiscRadiusBasis | null = null;
  const referencePoint = new Vector3();

  return (center: Vector3): number => {
    const current: HeldDiscRadiusBasis = {
      viewKey: byView ? readViewKey(engine) : "",
      referenceScale:
        held && !byView ? engine.getScreenPixelsPerMeterAt(referencePoint) : 0,
    };
    if (
      radiusMeters !== null &&
      !shouldResizeHeldDiscRadius(trigger, held, current, stepFactor)
    ) {
      return radiusMeters;
    }

    const scaleHere = engine.getScreenPixelsPerMeterAt(center);
    const nextRadius = resolveDiscRadiusForScreenTarget(
      scaleHere,
      targetScreenRadiusCssPx,
      quantize
    );
    if (nextRadius === null) {
      return radiusMeters ?? fallbackRadiusMeters;
    }
    radiusMeters = nextRadius;
    held = { viewKey: current.viewKey, referenceScale: scaleHere };
    referencePoint.copy(center);
    return nextRadius;
  };
};
