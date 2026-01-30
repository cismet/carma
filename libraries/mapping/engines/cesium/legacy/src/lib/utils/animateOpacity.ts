import {
  Easing,
  lerp,
  type Easing as EasingFunction,
} from "@carma-commons/math";

type AnimateOpacityOptions = {
  durationMs?: number;
  easing?: EasingFunction;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
  onCancel?: () => void;
};

export const animateOpacity = (
  startOpacity: number,
  targetOpacity: number,
  options: AnimateOpacityOptions
): (() => void) => {
  const {
    durationMs = 200,
    easing = Easing.SINUSOIDAL_IN_OUT,
    onUpdate,
    onComplete,
    onCancel,
  } = options;

  if (durationMs <= 0) {
    onUpdate(targetOpacity);
    onComplete?.();
    return () => {};
  }

  let cancelled = false;
  const startTime = performance.now();
  let frameId = 0;

  const step = (timestamp: number) => {
    if (cancelled) return;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const easedProgress = easing(progress);
    const currentOpacity = lerp(startOpacity, targetOpacity, easedProgress);

    onUpdate(currentOpacity);

    if (progress < 1) {
      frameId = requestAnimationFrame(step);
      return;
    }

    onComplete?.();
  };

  frameId = requestAnimationFrame(step);

  return () => {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(frameId);
    onCancel?.();
  };
};
