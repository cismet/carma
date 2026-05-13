import { useCallback, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, type CustomShader } from "@carma-cesium";

import {
  clampEasedProgress,
  clampModelShaderOpacity,
  createModelShader,
  interpolateColor,
  modelShader,
  normalizeModelShaderFadeDuration,
  setModelShaderHighlightUniforms,
} from "../utils/modelShader";

type ResolveModelHighlightStyleShaderOptions = {
  color: Color;
  highlighted: boolean;
  key: string;
  opacity?: number;
};

type UseCesiumModelHighlightStyleShaderResolverOptions = {
  activeKeys: readonly string[];
  fadeDurationMs?: number;
  fadeEasing?: EasingFunction;
  requestRender?: () => void;
};

type ModelHighlightStyleShaderState = {
  animationDurationMs: number;
  animationEasing: EasingFunction;
  animationStartTimestampMs: number | null;
  color: Color;
  opacity: number;
  shader: CustomShader;
  startColor: Color;
  startOpacity: number;
  targetColor: Color;
  targetOpacity: number;
};

const cloneColor = (color: Color) => Color.clone(color, new Color());

const colorsEqual = (left: Color, right: Color) =>
  left.red === right.red &&
  left.green === right.green &&
  left.blue === right.blue &&
  left.alpha === right.alpha;

const applyHighlightStyleShaderUniforms = (
  state: ModelHighlightStyleShaderState,
  color: Color,
  opacity: number
) => {
  state.color = cloneColor(color);
  state.opacity = opacity;
  setModelShaderHighlightUniforms({
    color,
    opacity,
    shader: state.shader,
  });
};

export const useCesiumModelHighlightStyleShaderResolver = ({
  activeKeys,
  fadeDurationMs,
  fadeEasing,
  requestRender,
}: UseCesiumModelHighlightStyleShaderResolverOptions) => {
  const shaderStateByKeyRef = useRef<
    Map<string, ModelHighlightStyleShaderState>
  >(new Map());
  const animationFrameRef = useRef<number | null>(null);

  const animate = useCallback(
    (timestampMs: number) => {
      animationFrameRef.current = null;

      let hasPendingAnimation = false;
      let hasUpdatedUniforms = false;

      shaderStateByKeyRef.current.forEach((state) => {
        if (state.animationStartTimestampMs === null) {
          state.animationStartTimestampMs = timestampMs;
        }

        const linearProgress =
          state.animationDurationMs === 0 ||
          (state.startOpacity === state.targetOpacity &&
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
        const nextOpacity =
          state.startOpacity +
          (state.targetOpacity - state.startOpacity) * easedProgress;

        applyHighlightStyleShaderUniforms(state, nextColor, nextOpacity);
        hasUpdatedUniforms = true;

        if (linearProgress < 1) {
          hasPendingAnimation = true;
          return;
        }

        state.animationStartTimestampMs = null;
        state.startColor = cloneColor(state.targetColor);
        state.startOpacity = state.targetOpacity;
        state.color = cloneColor(state.targetColor);
        state.opacity = state.targetOpacity;
      });

      if (hasUpdatedUniforms) {
        requestRender?.();
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

  useEffect(() => {
    const activeKeySet = new Set(activeKeys);
    shaderStateByKeyRef.current.forEach((_state, key) => {
      if (!activeKeySet.has(key)) {
        shaderStateByKeyRef.current.delete(key);
      }
    });
  }, [activeKeys]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    },
    []
  );

  return useCallback(
    ({
      color,
      highlighted,
      key,
      opacity = modelShader.defaults.selection.opacity,
    }: ResolveModelHighlightStyleShaderOptions): CustomShader => {
      const shaderStateByKey = shaderStateByKeyRef.current;
      let state = shaderStateByKey.get(key);
      if (!state) {
        const shader = createModelShader({
          color,
          opacity: 0,
        });
        state = {
          animationDurationMs: 0,
          animationEasing:
            fadeEasing ?? modelShader.defaults.selection.fade.easing,
          animationStartTimestampMs: null,
          color: cloneColor(color),
          opacity: 0,
          shader,
          startColor: cloneColor(color),
          startOpacity: 0,
          targetColor: cloneColor(color),
          targetOpacity: 0,
        };
        shaderStateByKey.set(key, state);
      }

      const targetOpacity = highlighted
        ? clampModelShaderOpacity(
            opacity,
            modelShader.defaults.selection.opacity
          )
        : 0;
      const normalizedDurationMs =
        normalizeModelShaderFadeDuration(fadeDurationMs);
      const targetColorChanged = !colorsEqual(state.targetColor, color);
      const targetOpacityChanged = state.targetOpacity !== targetOpacity;

      if (targetColorChanged || targetOpacityChanged) {
        state.startColor = cloneColor(state.color);
        state.startOpacity = state.opacity;
        state.targetColor = cloneColor(color);
        state.targetOpacity = targetOpacity;
        state.animationDurationMs = normalizedDurationMs;
        state.animationEasing =
          fadeEasing ?? modelShader.defaults.selection.fade.easing;
        state.animationStartTimestampMs = null;
        scheduleAnimation();
      }

      return state.shader;
    },
    [fadeDurationMs, fadeEasing, scheduleAnimation]
  );
};
