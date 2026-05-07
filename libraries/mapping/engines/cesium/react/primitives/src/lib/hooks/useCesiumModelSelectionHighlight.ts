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
  setModelHighlightShaderUniforms,
} from "../utils/modelHighlightShader";
import { applyModelCustomShader } from "../utils/modelManager";
import {
  calculateTaperedSilhouetteSize,
  clampEasedProgress,
  createNonAccumulatingSilhouetteColor,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_DURATION_MS,
  DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS,
  interpolateColor,
  MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR,
  normalizeModelSelectionHighlightFadeDuration,
  normalizeModelSelectionHighlightMinimumPixelSize,
  readPrimitiveHighlightEdgeMode,
  type ModelSelectionHighlightEdgeMode,
  type ModelSelectionHighlightState,
} from "../utils/modelSelectionHighlight";

export type CesiumModelSelectionHighlightController = {
  applyHighlight: (primitive: Model) => void;
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
};

type UseCesiumModelSelectionHighlightOptions = {
  edgeColor?: Color;
  edgeOpacity?: number;
  edgeWidthPx?: number;
  enabled: boolean;
  fadeDurationMs?: number;
  fadeEasing?: EasingFunction;
  getPrimitiveBySelectionId: (selectedId: string) => Model | null;
  highlightEdgeMode?: ModelSelectionHighlightEdgeMode;
  minimumPixelSize?: number;
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
  getPrimitiveBySelectionId,
  highlightEdgeMode,
  minimumPixelSize,
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
  const minimumPixelSizeRef = useRef<number>(
    normalizeModelSelectionHighlightMinimumPixelSize(minimumPixelSize)
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

  useEffect(() => {
    minimumPixelSizeRef.current =
      normalizeModelSelectionHighlightMinimumPixelSize(minimumPixelSize);
  }, [minimumPixelSize]);

  const readSelectionSilhouetteOptions = useCallback(
    () => ({
      edgeColor: edgeColorRef.current,
      edgeOpacity: edgeOpacityRef.current,
      edgeWidthPx: edgeWidthPxRef.current,
      minimumPixelSize: minimumPixelSizeRef.current,
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

  const applyMinimumPixelSize = useCallback(
    (
      primitive: Model,
      state: ModelSelectionHighlightState,
      opacity: number
    ) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const { minimumPixelSize } = readSelectionSilhouetteOptions();
      primitive.minimumPixelSize = Math.max(
        state.originalMinimumPixelSize,
        opacity > 0 ? minimumPixelSize : 0
      );
    },
    [readSelectionSilhouetteOptions]
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
        readSelectionSilhouetteOptions();
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
      primitive.outlineColor = Color.clone(
        DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
        new Color()
      );
      primitive.showOutline = true;
      applyMinimumPixelSize(primitive, state, opacity);
    },
    [applyMinimumPixelSize, readSelectionSilhouetteOptions]
  );

  useEffect(() => {
    if (highlightStateByPrimitiveRef.current.size === 0) {
      return;
    }

    highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
      setHighlightShaderUniforms(
        state,
        state.isFlashActive
          ? MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR
          : DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
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
    highlightEdgeMode,
    minimumPixelSize,
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

      const state: ModelSelectionHighlightState = {
        animationStartOpacity: 0,
        animationStartTimestampMs: null,
        flashStartTimestampMs: null,
        isFlashActive: false,
        originalMinimumPixelSize: primitive.minimumPixelSize,
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
                color: DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
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
            DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
            0
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
        primitive.minimumPixelSize = state.originalMinimumPixelSize;
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
      const currentFadeDurationMs = fadeDurationMsRef.current;
      const easing = fadeEasingRef.current;
      let hasPendingAnimation = false;

      highlightStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          highlightStateByPrimitiveRef.current.delete(primitive);
          return;
        }

        if (state.animationStartTimestampMs === null) {
          state.animationStartTimestampMs = timestampMs;
        }

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

        let highlightColor = DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR;
        if (state.isFlashActive) {
          if (state.flashStartTimestampMs === null) {
            state.flashStartTimestampMs = timestampMs;
          }
          const flashProgress = clampEasedProgress(
            (timestampMs - state.flashStartTimestampMs) /
              DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_DURATION_MS
          );
          const easedFlashProgress = clampEasedProgress(
            DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING(flashProgress)
          );
          highlightColor = interpolateColor(
            MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR,
            DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
            easedFlashProgress
          );

          if (flashProgress < 1) {
            hasPendingAnimation = true;
          } else {
            state.isFlashActive = false;
            state.flashStartTimestampMs = null;
          }
        }

        setHighlightShaderUniforms(state, highlightColor, nextOpacity);
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
      options: { flash?: boolean } = {}
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
          MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR,
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
      state.targetOpacity = nextTargetOpacity;
      applyPresentation(primitive, state, state.opacity);
      scheduleHighlightAnimation();
    },
    [
      applyPresentation,
      readOrCreateHighlightState,
      requestRender,
      scheduleHighlightAnimation,
      setHighlightShaderUniforms,
    ]
  );

  const refreshHighlightTarget = useCallback(
    (primitive: Model | null) => {
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

      setHighlightTarget(
        primitive,
        isHighlighted ? DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY : 0
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
    (primitive: Model): void => {
      if (primitive.isDestroyed()) return;
      selectedPrimitiveRef.current = primitive;
      setHighlightTarget(primitive, DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY, {
        flash: true,
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
          refreshHighlightTarget(hovered);
        }, DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS);
        return;
      }

      const current = hoveredPrimitiveRef.current;
      if (current === primitive) {
        return;
      }

      hoveredPrimitiveRef.current = primitive;
      refreshHighlightTarget(current);
      refreshHighlightTarget(primitive);
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
    setPrimitiveOriginalShaderIfHighlighted,
  };
};
