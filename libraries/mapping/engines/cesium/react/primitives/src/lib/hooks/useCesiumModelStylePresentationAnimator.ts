import { useCallback, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model } from "@carma-cesium";

import type { ModelPrimitiveRenderStylePresentation } from "../utils/modelManager";
import {
  calculateTaperedSilhouetteSize,
  clampEasedProgress,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING,
  interpolateColor,
  interpolateNumber,
  normalizeModelSelectionHighlightFadeDuration,
} from "../utils/modelSelectionHighlight";

type UseCesiumModelStylePresentationAnimatorOptions = {
  fadeDurationMs?: number;
  fadeEasing?: EasingFunction;
  isAnimationSuppressed?: (primitive: Model) => boolean;
  requestRender: () => void;
};

type ModelStylePresentationAnimationState = {
  animationDurationMs: number;
  animationEasing: EasingFunction;
  animationStartTimestampMs: number | null;
  startColor: Color;
  startSize: number;
  targetColor: Color;
  targetSize: number;
};

const cloneColor = (color: Color) => Color.clone(color, new Color());

const colorsEqual = (left: Color, right: Color) =>
  left.red === right.red &&
  left.green === right.green &&
  left.blue === right.blue &&
  left.alpha === right.alpha;

const readPresentationColor = (
  primitive: Model,
  presentation: ModelPrimitiveRenderStylePresentation
) => presentation.outlineColor ?? primitive.silhouetteColor;

const calculateAnimatedSilhouetteSize = (
  startSize: number,
  targetSize: number,
  easedProgress: number
) => {
  if (startSize === targetSize) {
    return targetSize;
  }
  if (startSize <= 0 && targetSize > 0) {
    return calculateTaperedSilhouetteSize(targetSize, easedProgress);
  }
  if (targetSize <= 0 && startSize > 0) {
    return calculateTaperedSilhouetteSize(startSize, 1 - easedProgress);
  }
  return interpolateNumber(startSize, targetSize, easedProgress);
};

const applyStylePresentation = (
  primitive: Model,
  color: Color,
  silhouetteSize: number
) => {
  if (primitive.isDestroyed()) {
    return;
  }
  primitive.silhouetteColor = cloneColor(color);
  primitive.silhouetteSize = silhouetteSize;
};

export const useCesiumModelStylePresentationAnimator = ({
  fadeDurationMs,
  fadeEasing,
  isAnimationSuppressed,
  requestRender,
}: UseCesiumModelStylePresentationAnimatorOptions) => {
  const animationFrameRef = useRef<number | null>(null);
  const animationStateByPrimitiveRef = useRef<
    Map<Model, ModelStylePresentationAnimationState>
  >(new Map());
  const fadeDurationMsRef = useRef<number>(
    normalizeModelSelectionHighlightFadeDuration(fadeDurationMs)
  );
  const fadeEasingRef = useRef<EasingFunction>(
    fadeEasing ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING
  );
  const isAnimationSuppressedRef = useRef(isAnimationSuppressed);

  useEffect(() => {
    fadeDurationMsRef.current =
      normalizeModelSelectionHighlightFadeDuration(fadeDurationMs);
  }, [fadeDurationMs]);

  useEffect(() => {
    fadeEasingRef.current =
      fadeEasing ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING;
  }, [fadeEasing]);

  useEffect(() => {
    isAnimationSuppressedRef.current = isAnimationSuppressed;
  }, [isAnimationSuppressed]);

  const animate = useCallback(
    (timestampMs: number) => {
      animationFrameRef.current = null;
      let hasPendingAnimation = false;
      let hasUpdatedPresentation = false;

      animationStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (
          primitive.isDestroyed() ||
          isAnimationSuppressedRef.current?.(primitive)
        ) {
          animationStateByPrimitiveRef.current.delete(primitive);
          return;
        }

        if (state.animationStartTimestampMs === null) {
          state.animationStartTimestampMs = timestampMs;
        }

        const linearProgress =
          state.animationDurationMs === 0 ||
          (state.startSize === state.targetSize &&
            colorsEqual(state.startColor, state.targetColor))
            ? 1
            : clampEasedProgress(
                (timestampMs - state.animationStartTimestampMs) /
                  state.animationDurationMs
              );
        const easedProgress = clampEasedProgress(
          state.animationEasing(linearProgress)
        );
        const nextColor = interpolateColor(
          state.startColor,
          state.targetColor,
          easedProgress
        );
        const nextSize = calculateAnimatedSilhouetteSize(
          state.startSize,
          state.targetSize,
          easedProgress
        );

        applyStylePresentation(primitive, nextColor, nextSize);
        hasUpdatedPresentation = true;

        if (linearProgress < 1) {
          hasPendingAnimation = true;
          return;
        }

        applyStylePresentation(primitive, state.targetColor, state.targetSize);
        animationStateByPrimitiveRef.current.delete(primitive);
      });

      if (hasUpdatedPresentation) {
        requestRender();
      }

      if (hasPendingAnimation) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    },
    [requestRender]
  );

  const scheduleAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const cancelStylePresentationAnimation = useCallback((primitive: Model) => {
    animationStateByPrimitiveRef.current.delete(primitive);
  }, []);

  const animateStylePresentation = useCallback(
    (primitive: Model, presentation: ModelPrimitiveRenderStylePresentation) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const targetColor = readPresentationColor(primitive, presentation);
      const targetSize = presentation.outlineWidthPx;
      const startColor = cloneColor(primitive.silhouetteColor);
      const startSize = primitive.silhouetteSize;

      if (startSize === targetSize && colorsEqual(startColor, targetColor)) {
        return;
      }

      animationStateByPrimitiveRef.current.set(primitive, {
        animationDurationMs: fadeDurationMsRef.current,
        animationEasing: fadeEasingRef.current,
        animationStartTimestampMs: null,
        startColor,
        startSize,
        targetColor: cloneColor(targetColor),
        targetSize,
      });
      scheduleAnimation();
    },
    [scheduleAnimation]
  );

  const clearStylePresentationAnimations = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    animationStateByPrimitiveRef.current.clear();
  }, []);

  useEffect(
    () => clearStylePresentationAnimations,
    [clearStylePresentationAnimations]
  );

  return {
    animateStylePresentation,
    cancelStylePresentationAnimation,
    clearStylePresentationAnimations,
  };
};
