import { Vector3 } from "three";
import {
  clamp,
  shouldRestepScreenScale,
  snapToNiceStep,
} from "@carma-commons/math";
import type { Meters } from "@carma-units";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS,
  type AnnotationPointQueryDiscSizingOptions,
} from "../config/annotation-reference-object-sizing";
import { finiteOr } from "./finite-or";

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
 * degenerate scale. `radiusSteps` uses the 1/2/5 outer-radius series.
 */
export const resolveDiscRadiusForScreenTarget = (
  pixelsPerMeter: number,
  targetScreenRadiusCssPx: number,
  quantize: boolean,
  { radiusSteps = false }: { radiusSteps?: boolean } = {}
): Meters | null => {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return null;
  const continuous = targetScreenRadiusCssPx / pixelsPerMeter;
  return Math.max(
    quantize
      ? radiusSteps
        ? snapToNiceStep(continuous)
        : snapToNiceStep(continuous * 2) / 2
      : continuous,
    radiusSteps ? 0 : MIN_STEPPED_RADIUS_METERS
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
  radiusSteps = false,
  discSizing,
  fallbackRadiusMeters,
  trigger = DISC_RADIUS_RESIZE_TRIGGERS.SCALE_BAND,
}: {
  engine: AnnotationEngine;
  stepFactor: number;
  targetScreenRadiusCssPx: number;
  quantize: boolean;
  radiusSteps?: boolean;
  discSizing?: Partial<AnnotationPointQueryDiscSizingOptions>;
  fallbackRadiusMeters: number;
  trigger?: DiscRadiusResizeTrigger;
}) => {
  const byView = trigger === DISC_RADIUS_RESIZE_TRIGGERS.VIEW_CHANGE;
  let radiusMeters: number | null = null;
  let held: HeldDiscRadiusBasis | null = null;
  const referencePoint = new Vector3();

  const defaults = ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS;
  const sizing = discSizing
    ? {
        target: Math.max(
          1,
          finiteOr(
            discSizing.targetScreenRadiusCssPx,
            defaults.targetScreenRadiusCssPx
          )
        ),
        minimum: Math.max(
          1,
          finiteOr(
            discSizing.minimumScreenRadiusCssPx,
            defaults.minimumScreenRadiusCssPx
          )
        ),
        maximumRatio: clamp(
          finiteOr(
            discSizing.maximumViewportRadiusRatio,
            defaults.maximumViewportRadiusRatio
          ),
          0.01,
          1
        ),
        factor: Math.max(
          2,
          finiteOr(discSizing.sceneResizeFactor, defaults.sceneResizeFactor)
        ),
        hysteresis: clamp(
          finiteOr(
            discSizing.resizeHysteresisRatio,
            defaults.resizeHysteresisRatio
          ),
          0,
          0.4
        ),
      }
    : null;

  return (
    center: Vector3,
    {
      cameraMoving = false,
      viewRevision,
    }: { cameraMoving?: boolean; viewRevision?: number } = {}
  ): number => {
    if (sizing) {
      const viewKey =
        viewRevision === undefined
          ? readViewKey(engine)
          : `${viewRevision}:${engine.canvas.clientWidth}:${engine.canvas.clientHeight}`;
      const scaleHere = engine.getScreenPixelsPerMeterAt(center);
      if (!Number.isFinite(scaleHere) || scaleHere <= 0)
        return radiusMeters ?? fallbackRadiusMeters;
      const maximum = Math.max(
        1,
        Math.min(engine.canvas.clientWidth, engine.canvas.clientHeight) *
          sizing.maximumRatio
      );
      const minimum = Math.min(sizing.minimum, maximum / 2);
      const interiorMinimum = Math.min(
        minimum * (1 + sizing.hysteresis),
        maximum / 2
      );
      const interiorMaximum = Math.max(
        interiorMinimum,
        maximum / (1 + sizing.hysteresis)
      );
      const target = clamp(sizing.target, interiorMinimum, interiorMaximum);
      const afterMove = !cameraMoving && held?.viewKey !== viewKey;
      if (radiusMeters === null || afterMove) {
        const ground = engine.getViewportCenterGroundPosition?.();
        const groundScale = ground
          ? engine.getScreenPixelsPerMeterAt(ground)
          : scaleHere;
        if (!Number.isFinite(groundScale) || groundScale <= 0)
          return radiusMeters ?? fallbackRadiusMeters;
        radiusMeters =
          resolveDiscRadiusForScreenTarget(groundScale, target, true, {
            radiusSteps: true,
          }) ?? fallbackRadiusMeters;
        held = { viewKey, referenceScale: groundScale };
      }
      const heldRadiusMeters = radiusMeters ?? fallbackRadiusMeters;
      const apparent = heldRadiusMeters * scaleHere;
      if (apparent >= minimum && apparent <= maximum) return heldRadiusMeters;

      // Decade jumps preserve the chosen 1/2/5 radius as the pointer moves.
      let candidate = heldRadiusMeters;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const pixels = candidate * scaleHere;
        if (pixels >= minimum && pixels <= maximum) break;
        candidate *= pixels < minimum ? sizing.factor : 1 / sizing.factor;
      }
      candidate = snapToNiceStep(candidate);
      if (
        candidate * scaleHere < interiorMinimum ||
        candidate * scaleHere > interiorMaximum
      ) {
        // Tight viewports need an intermediate nice step with room on both sides.
        const optimal = snapToNiceStep(target / scaleHere);
        const choices = [
          optimal,
          snapToNiceStep(optimal / 2),
          snapToNiceStep(optimal * 2),
        ];
        const inside = choices.filter(
          (value) =>
            value * scaleHere >= interiorMinimum &&
            value * scaleHere <= interiorMaximum
        );
        const usable =
          inside.length > 0
            ? inside
            : choices.filter(
                (value) =>
                  value * scaleHere >= minimum && value * scaleHere <= maximum
              );
        candidate =
          usable.sort(
            (a, b) =>
              Math.abs(a * scaleHere - target) -
              Math.abs(b * scaleHere - target)
          )[0] ?? target / scaleHere;
      }
      radiusMeters = candidate;
      return radiusMeters;
    }

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
      quantize,
      { radiusSteps }
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
