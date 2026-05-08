import { useCallback, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model, type CustomShader } from "@carma-cesium";

import {
  clampModelHighlightEdgeOpacity,
  clampModelHighlightOpacity,
  createModelSelectionHighlightShader,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY,
  isModelIntegratedHighlightShader,
  normalizeModelHighlightEdgeWidthPx,
  readModelHighlightShaderUniforms,
  setModelHighlightShaderUniforms,
} from "../utils/modelHighlightShader";
import { applyModelCustomShader } from "../utils/modelManager";
import {
  calculateTaperedSilhouetteSize,
  clampEasedProgress,
  createNonAccumulatingSilhouetteColor,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_OPACITY,
  interpolateColor,
  MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR,
  normalizeModelSelectionFlashDuration,
  normalizeModelSelectionHighlightFadeDuration,
  normalizeModelSelectionHoverClearDelay,
  readPrimitiveHighlightEdgeMode,
  type ModelSelectionHighlightEdgeMode,
  type ModelSelectionHighlightState,
} from "../utils/modelSelectionHighlight";

export type CesiumModelSelectionHighlightController = {
  applyHighlight: (primitive: Model, options?: { flash?: boolean }) => void;
  applyHoverHighlight: (primitive: Model | null) => void;
  clearPreviousHighlight: () => void;
  clearRuntimeState: () => void;
  isHoveredPrimitive: (primitive: Model) => boolean;
  isSelectedPrimitive: (primitive: Model) => boolean;
  restorePrimitiveHighlight: (primitive: Model) => void;
  restoreHighlights: () => void;
  setPrimitiveOriginalShaderIfHighlighted: (
    primitive: Model,
    shader: CustomShader | undefined
  ) => boolean;
  setPrimitiveOriginalPresentationIfHighlighted: (
    primitive: Model,
    presentation: {
      silhouetteColor?: Color;
      silhouetteSize: number;
    }
  ) => boolean;
};

type UseCesiumModelSelectionHighlightOptions = {
  edgeColor?: Color;
  edgeOpacity?: number;
  edgeWidthPx?: number;
  enabled: boolean;
  fadeDurationMs?: number;
  fadeEasing?: EasingFunction;
  fillColor?: Color;
  flashColor?: Color;
  flashDurationMs?: number;
  flashOpacity?: number;
  getPrimitiveBySelectionId: (selectedId: string) => Model | null;
  highlightEdgeMode?: ModelSelectionHighlightEdgeMode;
  hoverClearDelayMs?: number;
  hoverFadeDurationMs?: number;
  hoverFadeEasing?: EasingFunction;
  requestRender: () => void;
  selectedId?: string | null;
};

export const useCesiumModelSelectionHighlight = ({
  edgeColor,
  edgeOpacity,
  edgeWidthPx,
  enabled,
  fadeDurationMs,
  fadeEasing,
  fillColor,
  flashColor,
  flashDurationMs,
  flashOpacity,
  getPrimitiveBySelectionId,
  highlightEdgeMode,
  hoverClearDelayMs,
  hoverFadeDurationMs,
  hoverFadeEasing,
  requestRender,
  selectedId,
}: UseCesiumModelSelectionHighlightOptions): CesiumModelSelectionHighlightController => {
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const hoveredPrimitiveRef = useRef<Model | null>(null);
  const highlightStateByPrimitiveRef = useRef<
    Map<Model, ModelSelectionHighlightState>
  >(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const fadeDurationMsRef = useRef<number>(
    normalizeModelSelectionHighlightFadeDuration(fadeDurationMs)
  );
  const fadeEasingRef = useRef<EasingFunction>(
    fadeEasing ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING
  );
  const hoverFadeDurationMsRef = useRef<number>(
    normalizeModelSelectionHighlightFadeDuration(
      hoverFadeDurationMs ?? fadeDurationMs
    )
  );
  const hoverFadeEasingRef = useRef<EasingFunction>(
    hoverFadeEasing ??
      fadeEasing ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING
  );
  const hoverClearDelayMsRef = useRef<number>(
    normalizeModelSelectionHoverClearDelay(hoverClearDelayMs)
  );
  const fillColorRef = useRef<Color>(
    fillColor ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR
  );
  const flashColorRef = useRef<Color>(
    flashColor ?? MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR
  );
  const flashDurationMsRef = useRef<number>(
    normalizeModelSelectionFlashDuration(flashDurationMs)
  );
  const flashOpacityRef = useRef<number>(
    clampModelHighlightOpacity(
      flashOpacity,
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_OPACITY
    )
  );
  const edgeColorRef = useRef<Color>(
    edgeColor ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR
  );
  const edgeOpacityRef = useRef<number>(
    clampModelHighlightEdgeOpacity(edgeOpacity)
  );
  const edgeWidthPxRef = useRef<number>(
    normalizeModelHighlightEdgeWidthPx(edgeWidthPx)
  );
  const edgeModeRef = useRef<ModelSelectionHighlightEdgeMode>(
    highlightEdgeMode ?? "silhouette"
  );

  useEffect(() => {
    fadeDurationMsRef.current =
      normalizeModelSelectionHighlightFadeDuration(fadeDurationMs);
  }, [fadeDurationMs]);

  useEffect(() => {
    fadeEasingRef.current =
      fadeEasing ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING;
  }, [fadeEasing]);

  useEffect(() => {
    hoverFadeDurationMsRef.current =
      normalizeModelSelectionHighlightFadeDuration(
        hoverFadeDurationMs ?? fadeDurationMs
      );
  }, [fadeDurationMs, hoverFadeDurationMs]);

  useEffect(() => {
    hoverFadeEasingRef.current =
      hoverFadeEasing ??
      fadeEasing ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING;
  }, [fadeEasing, hoverFadeEasing]);

  useEffect(() => {
    hoverClearDelayMsRef.current =
      normalizeModelSelectionHoverClearDelay(hoverClearDelayMs);
  }, [hoverClearDelayMs]);

  useEffect(() => {
    fillColorRef.current = fillColor ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR;
  }, [fillColor]);

  useEffect(() => {
    flashColorRef.current = flashColor ?? MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR;
  }, [flashColor]);

  useEffect(() => {
    flashDurationMsRef.current =
      normalizeModelSelectionFlashDuration(flashDurationMs);
  }, [flashDurationMs]);

  useEffect(() => {
    flashOpacityRef.current = clampModelHighlightOpacity(
      flashOpacity,
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_OPACITY
    );
  }, [flashOpacity]);

  useEffect(() => {
    edgeColorRef.current =
      edgeColor ?? DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR;
  }, [edgeColor]);

  useEffect(() => {
    edgeOpacityRef.current = clampModelHighlightEdgeOpacity(edgeOpacity);
  }, [edgeOpacity]);

  useEffect(() => {
    edgeWidthPxRef.current = normalizeModelHighlightEdgeWidthPx(edgeWidthPx);
  }, [edgeWidthPx]);

  useEffect(() => {
    edgeModeRef.current = highlightEdgeMode ?? "silhouette";
  }, [highlightEdgeMode]);

  const readSelectionOutlineOptions = useCallback(
    () => ({
      edgeColor: edgeColorRef.current,
      edgeOpacity: edgeOpacityRef.current,
      edgeWidthPx: edgeWidthPxRef.current,
    }),
    []
  );

  const setHighlightShaderUniforms = useCallback(
    (state: ModelSelectionHighlightState, color: Color, opacity: number) => {
      setModelHighlightShaderUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const readFlashFillColor = useCallback(
    () =>
      interpolateColor(
        fillColorRef.current,
        flashColorRef.current,
        flashOpacityRef.current
      ),
    []
  );

  const applyPresentation = useCallback(
    (
      primitive: Model,
      state: ModelSelectionHighlightState,
      opacity: number
    ) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const { edgeColor, edgeOpacity, edgeWidthPx } =
        readSelectionOutlineOptions();
      const highlightOpacity = clampModelHighlightOpacity(opacity, 0);
      const edgeMode = readPrimitiveHighlightEdgeMode(
        primitive,
        edgeModeRef.current
      );

      if (edgeMode === "silhouette") {
        primitive.silhouetteColor = createNonAccumulatingSilhouetteColor(
          edgeColor,
          edgeOpacity
        );
        primitive.silhouetteSize = Math.max(
          state.originalSilhouetteSize,
          calculateTaperedSilhouetteSize(edgeWidthPx, highlightOpacity)
        );
      } else {
        primitive.silhouetteColor = Color.clone(
          state.originalSilhouetteColor,
          new Color()
        );
        primitive.silhouetteSize = state.originalSilhouetteSize;
      }
      primitive.outlineColor = Color.clone(fillColorRef.current, new Color());
      primitive.showOutline = true;
    },
    [readSelectionOutlineOptions]
  );

  useEffect(() => {
    if (highlightStateByPrimitiveRef.current.size === 0) {
      return;
    }

    highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
      setHighlightShaderUniforms(
        state,
        state.isFlashActive ? readFlashFillColor() : fillColorRef.current,
        state.opacity
      );
      applyPresentation(primitive, state, state.opacity);
    });
    requestRender();
  }, [
    applyPresentation,
    edgeColor,
    edgeOpacity,
    edgeWidthPx,
    fillColor,
    flashColor,
    flashOpacity,
    highlightEdgeMode,
    readFlashFillColor,
    requestRender,
    setHighlightShaderUniforms,
  ]);

  const readOrCreateHighlightState = useCallback(
    (primitive: Model): ModelSelectionHighlightState => {
      const existing = highlightStateByPrimitiveRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const originalShader = primitive.customShader ?? undefined;
      const usesIntegratedShader =
        isModelIntegratedHighlightShader(originalShader);
      const originalHighlightUniforms =
        readModelHighlightShaderUniforms(originalShader);

      const state: ModelSelectionHighlightState = {
        animationDurationMs: fadeDurationMsRef.current,
        animationEasing: fadeEasingRef.current,
        animationStartOpacity: 0,
        animationStartTimestampMs: null,
        flashStartTimestampMs: null,
        isFlashActive: false,
        ...(originalHighlightUniforms
          ? {
              originalHighlightColor: originalHighlightUniforms.color,
              originalHighlightOpacity: originalHighlightUniforms.opacity,
            }
          : {}),
        originalOutlineColor: Color.clone(primitive.outlineColor, new Color()),
        originalShowOutline: primitive.showOutline,
        originalShader,
        originalSilhouetteColor: Color.clone(
          primitive.silhouetteColor,
          new Color()
        ),
        originalSilhouetteSize: primitive.silhouetteSize,
        opacity: 0,
        shader:
          usesIntegratedShader && originalShader
            ? originalShader
            : createModelSelectionHighlightShader({
                color: fillColorRef.current,
                opacity: 0,
              }),
        targetOpacity: 0,
        usesIntegratedShader,
      };
      highlightStateByPrimitiveRef.current.set(primitive, state);
      return state;
    },
    []
  );

  const restorePrimitiveHighlight = useCallback(
    (primitive: Model) => {
      const state = highlightStateByPrimitiveRef.current.get(primitive);
      if (state && !primitive.isDestroyed()) {
        if (state.usesIntegratedShader) {
          setHighlightShaderUniforms(
            state,
            state.originalHighlightColor ?? fillColorRef.current,
            state.originalHighlightOpacity ?? 0
          );
          if (
            state.originalShader !== state.shader &&
            primitive.customShader === state.shader
          ) {
            applyModelCustomShader(
              primitive,
              state.originalShader,
              requestRender
            );
          }
        } else if (primitive.customShader === state.shader) {
          applyModelCustomShader(
            primitive,
            state.originalShader,
            requestRender
          );
        }
        primitive.silhouetteColor = Color.clone(
          state.originalSilhouetteColor,
          new Color()
        );
        primitive.silhouetteSize = state.originalSilhouetteSize;
        primitive.outlineColor = Color.clone(
          state.originalOutlineColor,
          new Color()
        );
        primitive.showOutline = state.originalShowOutline;
        requestRender();
      }
      highlightStateByPrimitiveRef.current.delete(primitive);
      if (selectedPrimitiveRef.current === primitive) {
        selectedPrimitiveRef.current = null;
      }
      if (hoveredPrimitiveRef.current === primitive) {
        hoveredPrimitiveRef.current = null;
      }
    },
    [requestRender, setHighlightShaderUniforms]
  );

  const restoreHighlights = useCallback(() => {
    if (hoverClearTimeoutRef.current !== null) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    selectedPrimitiveRef.current = null;
    hoveredPrimitiveRef.current = null;
    Array.from(highlightStateByPrimitiveRef.current.keys()).forEach(
      restorePrimitiveHighlight
    );
  }, [restorePrimitiveHighlight]);

  const animateHighlights = useCallback(
    (timestampMs: number) => {
      animationFrameRef.current = null;
      let hasPendingAnimation = false;

      highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          highlightStateByPrimitiveRef.current.delete(primitive);
          return;
        }

        if (state.animationStartTimestampMs === null) {
          state.animationStartTimestampMs = timestampMs;
        }

        const currentFadeDurationMs = state.animationDurationMs;
        const easing = state.animationEasing;
        const linearProgress =
          currentFadeDurationMs === 0 ||
          state.animationStartOpacity === state.targetOpacity
            ? 1
            : clampEasedProgress(
                (timestampMs - state.animationStartTimestampMs) /
                  currentFadeDurationMs
              );
        const easedProgress = clampEasedProgress(easing(linearProgress));
        const nextOpacity =
          state.animationStartOpacity +
          (state.targetOpacity - state.animationStartOpacity) * easedProgress;

        state.opacity = nextOpacity;

        let highlightColor = fillColorRef.current;
        if (state.isFlashActive) {
          if (state.flashStartTimestampMs === null) {
            state.flashStartTimestampMs = timestampMs;
          }
          const flashProgress = clampEasedProgress(
            (timestampMs - state.flashStartTimestampMs) /
              flashDurationMsRef.current
          );
          const easedFlashProgress = clampEasedProgress(
            DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING(flashProgress)
          );
          highlightColor = interpolateColor(
            readFlashFillColor(),
            fillColorRef.current,
            easedFlashProgress
          );
          setHighlightShaderUniforms(state, highlightColor, nextOpacity);

          if (flashProgress < 1) {
            hasPendingAnimation = true;
          } else {
            state.isFlashActive = false;
            state.flashStartTimestampMs = null;
          }
        }

        if (!state.isFlashActive) {
          setHighlightShaderUniforms(state, highlightColor, nextOpacity);
        }
        applyPresentation(primitive, state, nextOpacity);
        requestRender();

        if (linearProgress < 1) {
          hasPendingAnimation = true;
          return;
        }

        state.opacity = state.targetOpacity;
        state.animationStartOpacity = state.targetOpacity;
        state.animationStartTimestampMs = null;

        if (state.targetOpacity === 0) {
          restorePrimitiveHighlight(primitive);
        }
      });

      if (hasPendingAnimation) {
        animationFrameRef.current = requestAnimationFrame(animateHighlights);
      }
    },
    [
      applyPresentation,
      readFlashFillColor,
      requestRender,
      restorePrimitiveHighlight,
      setHighlightShaderUniforms,
    ]
  );

  const scheduleHighlightAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(animateHighlights);
  }, [animateHighlights]);

  const setHighlightTarget = useCallback(
    (
      primitive: Model,
      targetOpacity: number,
      options: {
        durationMs?: number;
        easing?: EasingFunction;
        flash?: boolean;
      } = {}
    ) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const state = readOrCreateHighlightState(primitive);
      const nextTargetOpacity = clampModelHighlightOpacity(
        targetOpacity,
        DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY
      );

      if (primitive.customShader !== state.shader) {
        applyModelCustomShader(primitive, state.shader, requestRender);
      }

      if (options.flash && nextTargetOpacity > 0) {
        state.opacity = nextTargetOpacity;
        state.animationStartOpacity = nextTargetOpacity;
        state.animationStartTimestampMs = null;
        state.targetOpacity = nextTargetOpacity;
        state.isFlashActive = true;
        state.flashStartTimestampMs = null;
        setHighlightShaderUniforms(
          state,
          readFlashFillColor(),
          nextTargetOpacity
        );
        applyPresentation(primitive, state, nextTargetOpacity);
        requestRender();
        scheduleHighlightAnimation();
        return;
      }

      if (
        !options.flash &&
        state.targetOpacity === nextTargetOpacity &&
        state.opacity === nextTargetOpacity
      ) {
        return;
      }

      state.animationStartOpacity = state.opacity;
      state.animationStartTimestampMs = null;
      state.animationDurationMs =
        options.durationMs ?? fadeDurationMsRef.current;
      state.animationEasing = options.easing ?? fadeEasingRef.current;
      state.targetOpacity = nextTargetOpacity;
      applyPresentation(primitive, state, state.opacity);
      scheduleHighlightAnimation();
    },
    [
      applyPresentation,
      readOrCreateHighlightState,
      readFlashFillColor,
      requestRender,
      scheduleHighlightAnimation,
      setHighlightShaderUniforms,
    ]
  );

  const refreshHighlightTarget = useCallback(
    (primitive: Model | null, timing: "selection" | "hover" = "selection") => {
      if (!primitive || primitive.isDestroyed()) {
        return;
      }
      const isHighlighted =
        selectedPrimitiveRef.current === primitive ||
        hoveredPrimitiveRef.current === primitive;
      const state = highlightStateByPrimitiveRef.current.get(primitive);

      if (!isHighlighted && !state) {
        return;
      }

      const timingOptions =
        timing === "hover"
          ? {
              durationMs: hoverFadeDurationMsRef.current,
              easing: hoverFadeEasingRef.current,
            }
          : undefined;

      setHighlightTarget(
        primitive,
        isHighlighted ? DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY : 0,
        timingOptions
      );
    },
    [setHighlightTarget]
  );

  const clearPreviousHighlight = useCallback(() => {
    const current = selectedPrimitiveRef.current;
    if (!current || current.isDestroyed()) {
      selectedPrimitiveRef.current = null;
      return;
    }
    selectedPrimitiveRef.current = null;
    refreshHighlightTarget(current);
  }, [refreshHighlightTarget]);

  const applyHighlight = useCallback(
    (primitive: Model, options: { flash?: boolean } = {}): void => {
      if (primitive.isDestroyed()) return;
      selectedPrimitiveRef.current = primitive;
      setHighlightTarget(primitive, DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY, {
        flash: options.flash === true,
      });
    },
    [setHighlightTarget]
  );

  const applyHoverHighlight = useCallback(
    (primitive: Model | null): void => {
      if (hoverClearTimeoutRef.current !== null) {
        clearTimeout(hoverClearTimeoutRef.current);
        hoverClearTimeoutRef.current = null;
      }

      if (!primitive) {
        const current = hoveredPrimitiveRef.current;
        if (!current) {
          return;
        }

        hoverClearTimeoutRef.current = setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          const hovered = hoveredPrimitiveRef.current;
          hoveredPrimitiveRef.current = null;
          refreshHighlightTarget(hovered, "hover");
        }, hoverClearDelayMsRef.current);
        return;
      }

      const current = hoveredPrimitiveRef.current;
      if (current === primitive) {
        return;
      }

      hoveredPrimitiveRef.current = primitive;
      refreshHighlightTarget(current, "hover");
      refreshHighlightTarget(primitive, "hover");
    },
    [refreshHighlightTarget]
  );

  const isSelectedPrimitive = useCallback(
    (primitive: Model) => selectedPrimitiveRef.current === primitive,
    []
  );

  const isHoveredPrimitive = useCallback(
    (primitive: Model) => hoveredPrimitiveRef.current === primitive,
    []
  );

  const setPrimitiveOriginalShaderIfHighlighted = useCallback(
    (primitive: Model, shader: CustomShader | undefined) => {
      const state = highlightStateByPrimitiveRef.current.get(primitive);
      if (!state) {
        return false;
      }
      state.originalShader = shader;
      return true;
    },
    []
  );

  const setPrimitiveOriginalPresentationIfHighlighted = useCallback(
    (
      primitive: Model,
      presentation: {
        silhouetteColor?: Color;
        silhouetteSize: number;
      }
    ) => {
      const state = highlightStateByPrimitiveRef.current.get(primitive);
      if (!state) {
        return false;
      }
      if (presentation.silhouetteColor) {
        state.originalSilhouetteColor = Color.clone(
          presentation.silhouetteColor,
          new Color()
        );
      }
      state.originalSilhouetteSize = presentation.silhouetteSize;
      return true;
    },
    []
  );

  const clearRuntimeState = useCallback(() => {
    if (hoverClearTimeoutRef.current !== null) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    selectedPrimitiveRef.current = null;
    hoveredPrimitiveRef.current = null;
    highlightStateByPrimitiveRef.current.clear();
  }, []);

  useEffect(() => {
    if (!enabled) {
      restoreHighlights();
      return;
    }

    const nextSelectedId = selectedId ?? null;
    if (!nextSelectedId) {
      if (selectedPrimitiveRef.current) {
        clearPreviousHighlight();
      }
      return;
    }

    const matchingPrimitive = getPrimitiveBySelectionId(nextSelectedId);
    if (!matchingPrimitive) {
      if (selectedPrimitiveRef.current) {
        clearPreviousHighlight();
      }
      return;
    }

    if (selectedPrimitiveRef.current === matchingPrimitive) return;

    clearPreviousHighlight();
    applyHighlight(matchingPrimitive);
  }, [
    applyHighlight,
    clearPreviousHighlight,
    enabled,
    getPrimitiveBySelectionId,
    restoreHighlights,
    selectedId,
  ]);

  return {
    applyHighlight,
    applyHoverHighlight,
    clearPreviousHighlight,
    clearRuntimeState,
    isHoveredPrimitive,
    isSelectedPrimitive,
    restorePrimitiveHighlight,
    restoreHighlights,
    setPrimitiveOriginalPresentationIfHighlighted,
    setPrimitiveOriginalShaderIfHighlighted,
  };
};
