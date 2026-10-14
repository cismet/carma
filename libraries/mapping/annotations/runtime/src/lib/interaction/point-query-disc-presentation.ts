import {
  ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS,
  type AnnotationPointQueryDiscSizingOptions,
} from "../config/annotation-reference-object-sizing";
import { finiteOr } from "./finite-or";

/** Transient scene feedback; the selected measurement radius is never interpolated. */
export const createPointQueryDiscPresentation = (
  label: HTMLElement | null,
  sizing: Partial<AnnotationPointQueryDiscSizingOptions> = {}
) => {
  const defaults = ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS;
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
  const motionPreference =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let selectedRadius: number | null = null;
  let displayedRadius: number | null = null;
  let labelVisibleUntil = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let transition: { from: number; to: number; startedAt: number } | null = null;

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
    clear: () => {
      cancelHideTimer();
      transition = null;
      displayedRadius = selectedRadius;
      if (label) label.style.display = "none";
    },
  };
};
