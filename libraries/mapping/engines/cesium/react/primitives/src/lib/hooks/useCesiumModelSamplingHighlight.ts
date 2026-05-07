import { useCallback, useEffect, useRef } from "react";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Color,
  type CustomShader,
  type Model,
  type Scene,
} from "@carma-cesium";

import {
  clampModelSamplingHighlightOpacity,
  createModelSamplingHighlightShader,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY,
  setModelSamplingHighlightShaderUniforms,
} from "../utils/modelHighlightShader";
import { isModelPick } from "../utils/modelManager";

type ModelSamplingHighlightState = {
  originalShader: CustomShader | undefined;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
};

type UseCesiumModelSamplingHighlightOptions = {
  color?: Color;
  enabled: boolean;
  fadeDurationMs?: number;
  getScene: () => Scene | null | undefined;
  opacity?: number;
};

const normalizeModelSamplingHighlightFadeDuration = (
  fadeDurationMs: number | undefined
): number =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS;

export const useCesiumModelSamplingHighlight = ({
  color = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  enabled,
  fadeDurationMs,
  getScene,
  opacity = DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY,
}: UseCesiumModelSamplingHighlightOptions) => {
  const sampledPrimitiveRef = useRef<Model | null>(null);
  const highlightStateByPrimitiveRef = useRef<
    Map<Model, ModelSamplingHighlightState>
  >(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastAnimationMsRef = useRef<number | null>(null);

  const restoreHighlightShader = useCallback(
    (primitive: Model, state: ModelSamplingHighlightState) => {
      if (!primitive.isDestroyed() && primitive.customShader === state.shader) {
        primitive.customShader = state.originalShader;
      }
      highlightStateByPrimitiveRef.current.delete(primitive);
      if (sampledPrimitiveRef.current === primitive) {
        sampledPrimitiveRef.current = null;
      }
    },
    []
  );

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastAnimationMsRef.current = null;
  }, []);

  const restoreHighlights = useCallback(() => {
    cancelAnimation();
    highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
      restoreHighlightShader(primitive, state);
    });
    highlightStateByPrimitiveRef.current.clear();
    sampledPrimitiveRef.current = null;
  }, [cancelAnimation, restoreHighlightShader]);

  const readOrCreateHighlightState = useCallback(
    (primitive: Model): ModelSamplingHighlightState => {
      const existing = highlightStateByPrimitiveRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const state = {
        originalShader: primitive.customShader ?? undefined,
        opacity: 0,
        shader: createModelSamplingHighlightShader(),
        targetOpacity: 0,
      };
      highlightStateByPrimitiveRef.current.set(primitive, state);
      primitive.customShader = state.shader;
      setModelSamplingHighlightShaderUniforms({
        color,
        opacity: state.opacity,
        shader: state.shader,
      });
      return state;
    },
    [color]
  );

  const animateHighlights = useCallback(
    (timestampMs: number) => {
      animationFrameRef.current = null;

      const previousTimestampMs = lastAnimationMsRef.current;
      lastAnimationMsRef.current = timestampMs;

      const elapsedMs =
        previousTimestampMs === null
          ? 0
          : Math.max(0, timestampMs - previousTimestampMs);
      const normalizedFadeDurationMs =
        normalizeModelSamplingHighlightFadeDuration(fadeDurationMs);
      const opacityStep =
        normalizedFadeDurationMs === 0
          ? 1
          : (elapsedMs / normalizedFadeDurationMs) *
            clampModelSamplingHighlightOpacity(opacity);
      let hasPendingAnimation = false;

      highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          highlightStateByPrimitiveRef.current.delete(primitive);
          return;
        }

        const opacityDistance = state.targetOpacity - state.opacity;
        const nextOpacity =
          normalizedFadeDurationMs === 0
            ? state.targetOpacity
            : state.opacity +
              Math.sign(opacityDistance) *
                Math.min(Math.abs(opacityDistance), opacityStep);

        state.opacity = nextOpacity;
        setModelSamplingHighlightShaderUniforms({
          color,
          opacity: nextOpacity,
          shader: state.shader,
        });

        if (nextOpacity !== state.targetOpacity) {
          hasPendingAnimation = true;
          return;
        }

        if (nextOpacity === 0 && state.targetOpacity === 0) {
          restoreHighlightShader(primitive, state);
        }
      });

      const scene = getScene();
      if (scene && !scene.isDestroyed()) {
        scene.requestRender();
      }

      if (hasPendingAnimation) {
        animationFrameRef.current = requestAnimationFrame(animateHighlights);
        return;
      }

      lastAnimationMsRef.current = null;
    },
    [color, fadeDurationMs, getScene, opacity, restoreHighlightShader]
  );

  const scheduleAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }
    lastAnimationMsRef.current = null;
    animationFrameRef.current = requestAnimationFrame(animateHighlights);
  }, [animateHighlights]);

  const applyHighlight = useCallback(
    (primitive: Model | null) => {
      const targetOpacity = clampModelSamplingHighlightOpacity(opacity);
      const current = sampledPrimitiveRef.current;
      if (current && current !== primitive && !current.isDestroyed()) {
        const currentState = highlightStateByPrimitiveRef.current.get(current);
        if (currentState) {
          currentState.targetOpacity = 0;
        }
      }

      sampledPrimitiveRef.current = primitive;

      if (!primitive || primitive.isDestroyed()) {
        scheduleAnimation();
        return;
      }

      const state = readOrCreateHighlightState(primitive);
      if (primitive.customShader !== state.shader) {
        primitive.customShader = state.shader;
      }
      state.targetOpacity = targetOpacity;
      scheduleAnimation();
    },
    [opacity, readOrCreateHighlightState, scheduleAnimation]
  );

  const clearHighlight = useCallback(() => {
    applyHighlight(null);
  }, [applyHighlight]);

  useEffect(() => {
    if (!enabled) {
      restoreHighlights();
      return;
    }

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachSamplingHighlightHandler = () => {
      if (disposed) return;

      const scene = getScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachSamplingHighlightHandler, 100);
        return;
      }

      handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((event: { endPosition?: Cartesian2 }) => {
        const position = event.endPosition;
        if (!position) {
          clearHighlight();
          return;
        }

        const modelPick = scene.pick(position, 1, 1);
        applyHighlight(isModelPick(modelPick) ? modelPick.primitive : null);
        scene.requestRender();
      }, ScreenSpaceEventType.MOUSE_MOVE);
    };

    attachSamplingHighlightHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      handler?.destroy();
      restoreHighlights();
    };
  }, [applyHighlight, clearHighlight, enabled, getScene, restoreHighlights]);
};
