import { Vector3 } from "three";
import {
  ANNOTATION_DISC_REFERENCE_DEFAULTS,
  type AnnotationDiscReferenceOptions,
} from "../config/annotation-reference-object-sizing";
import { finiteOr } from "./finite-or";

/** Transient scene feedback; the selected measurement radius is never interpolated. */
export const createPointQueryDiscPresentation = (
  label: HTMLElement | null,
  sizing: Partial<AnnotationDiscReferenceOptions> = {}
) => {
  const defaults = ANNOTATION_DISC_REFERENCE_DEFAULTS;
  const holdMs = Math.max(
    0,
    finiteOr(
      sizing.radiusLabelVisibleDurationMs,
      defaults.radiusLabelVisibleDurationMs
    )
  );
  const fadeMs = Math.max(
    0,
    finiteOr(
      sizing.radiusLabelFadeDurationMs,
      defaults.radiusLabelFadeDurationMs
    )
  );
  const animationMs = Math.max(
    0,
    finiteOr(
      sizing.resizeAnimationDurationMs,
      defaults.resizeAnimationDurationMs
    )
  );
  const snapAnimationMs = Math.max(
    0,
    finiteOr(sizing.snapAnimationDurationMs, defaults.snapAnimationDurationMs)
  );
  const motionPreference =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let selectedRadius: number | null = null;
  let displayedRadius: number | null = null;
  let labelVisibleUntil = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let transition: { from: number; to: number; startedAt: number } | null = null;

  let selectedPoint: Vector3 | null = null;
  let displayedPoint: Vector3 | null = null;
  let snapped: boolean | null = null;
  let pointTransition: {
    from: Vector3;
    to: Vector3;
    startedAt: number;
  } | null = null;
  const samplePoint = (now: number) => {
    if (!pointTransition) return displayedPoint;
    const progress =
      motionPreference?.matches || snapAnimationMs === 0
        ? 1
        : Math.min(
            1,
            Math.max(0, (now - pointTransition.startedAt) / snapAnimationMs)
          );
    const eased = progress * progress * (3 - 2 * progress);
    displayedPoint = (displayedPoint ?? new Vector3()).lerpVectors(
      pointTransition.from,
      pointTransition.to,
      eased
    );
    if (progress === 1) pointTransition = null;
    return displayedPoint;
  };

  const cancelHideTimer = () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const updateLabel = (now: number) => {
    if (!label) return;
    const remaining = Math.max(0, labelVisibleUntil - now);
    label.style.transition = `opacity ${
      motionPreference?.matches ? 0 : fadeMs
    }ms ease-out`;
    label.style.opacity = remaining > 0 ? "1" : "0";
    if (remaining > 0 && hideTimer === null) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        label.style.opacity = "0";
      }, remaining);
    }
  };
  const sampleRadius = (now: number): number | null => {
    if (!transition) return displayedRadius;
    const progress =
      motionPreference?.matches || animationMs === 0
        ? 1
        : Math.min(1, Math.max(0, (now - transition.startedAt) / animationMs));
    const eased = progress * progress * (3 - 2 * progress);
    // A multiplicative size change reads evenly across a decade jump.
    displayedRadius =
      transition.from * Math.pow(transition.to / transition.from, eased);
    if (progress === 1) {
      displayedRadius = transition.to;
      transition = null;
    }
    return displayedRadius;
  };

  return {
    resolvePoint: (point: Vector3, isSnapped: boolean) => {
      const now = performance.now();
      const current = samplePoint(now);
      const changedSnap =
        snapped !== null &&
        (snapped !== isSnapped ||
          (isSnapped &&
            selectedPoint !== null &&
            !selectedPoint.equals(point)));
      if (
        changedSnap &&
        current &&
        !current.equals(point) &&
        snapAnimationMs > 0 &&
        !motionPreference?.matches
      ) {
        pointTransition = {
          from: current.clone(),
          to: point.clone(),
          startedAt: now,
        };
      } else if (pointTransition) {
        // Track the moving surface endpoint without restarting the return trip.
        pointTransition.to.copy(point);
      }
      selectedPoint = (selectedPoint ?? new Vector3()).copy(point);
      snapped = isSnapped;
      if (!pointTransition)
        displayedPoint = (displayedPoint ?? new Vector3()).copy(point);
      return {
        pointECEF: samplePoint(now) ?? point,
        animating: pointTransition !== null,
      };
    },
    resolveRadius: (radius: number) => {
      const now = performance.now();
      const current = sampleRadius(now);
      if (radius !== selectedRadius) {
        transition =
          current !== null && animationMs > 0 && !motionPreference?.matches
            ? { from: current, to: radius, startedAt: now }
            : null;
        selectedRadius = radius;
        displayedRadius = current !== null && transition ? current : radius;
        labelVisibleUntil = now + holdMs;
        cancelHideTimer();
      }
      updateLabel(now);
      return {
        radiusMeters: sampleRadius(now) ?? radius,
        animating: transition !== null,
      };
    },
    clear: ({
      preserveSnapTravel = false,
    }: { preserveSnapTravel?: boolean } = {}) => {
      if (!preserveSnapTravel) {
        selectedPoint = null;
        displayedPoint = null;
        snapped = null;
        pointTransition = null;
      }
      cancelHideTimer();
      transition = null;
      displayedRadius = selectedRadius;
      if (label) label.style.display = "none";
    },
  };
};
