import { useCallback, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model, type CustomShader } from "@carma-cesium";

import {
  calculateTaperedSilhouetteSize,
  clampEasedProgress,
  clampModelShaderEdgeOpacity,
  clampModelShaderOpacity,
  createModelShader,
  createNonAccumulatingSilhouetteColor,
  isModelShader,
  modelShader,
  normalizeModelShaderEdgeWidthPx,
  normalizeModelShaderFlashInDuration,
  normalizeModelShaderFlashOutDuration,
  normalizeModelShaderFadeDuration,
  normalizeModelShaderHoverClearDelay,
  readPrimitiveModelShaderEdgeMode,
  readModelShaderSelectionUniforms,
  setModelShaderFlashUniforms,
  setModelShaderSelectionUniforms,
  type ModelShaderEdgeMode,
  type ModelShaderFlashStyle,
  type ModelShaderState,
} from "../utils/modelShader";
import { applyModelCustomShader } from "../utils/modelManager";

export type ModelShaderApplyOptions = {
  flash?: ModelShaderFlashStyle;
};

const cloneColor = (color: Color) => Color.clone(color, new Color());

const readModelShaderFlashOpacity = (
  state: ModelShaderState,
  elapsedMs: number
) => {
  const flashInDurationMs = state.flashInDurationMs;
  const flashOutDurationMs = state.flashOutDurationMs;

  if (flashInDurationMs > 0 && elapsedMs < flashInDurationMs) {
    const progress = clampEasedProgress(elapsedMs / flashInDurationMs);
    return (
      state.flashOpacity * clampEasedProgress(state.flashInEasing(progress))
    );
  }

  if (flashOutDurationMs === 0) {
    return 0;
  }

  const progress = clampEasedProgress(
    (elapsedMs - flashInDurationMs) / flashOutDurationMs
  );
  return (
    state.flashOpacity *
    (1 - clampEasedProgress(state.flashOutEasing(progress)))
  );
};

export type CesiumModelShaderController = {
  applyHighlight: (primitive: Model, options?: ModelShaderApplyOptions) => void;
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

type UseCesiumModelShaderOptions = {
  edgeColor?: Color;
  edgeOpacity?: number;
  edgeWidthPx?: number;
  enabled: boolean;
  fadeDurationMs?: number;
  fadeEasing?: EasingFunction;
  fillColor?: Color;
  flashInDurationMs?: number;
  flashInEasing?: EasingFunction;
  flashOpacity?: number;
  flashOutDurationMs?: number;
  flashOutEasing?: EasingFunction;
  getPrimitiveBySelectionId: (selectedId: string) => Model | null;
  highlightFlashColor?: Color;
  highlightEdgeMode?: ModelShaderEdgeMode;
  hoverClearDelayMs?: number;
  hoverFadeDurationMs?: number;
  hoverFadeEasing?: EasingFunction;
  requestRender: () => void;
  selectionFlashColor?: Color;
  selectedFlashKey?: string | null;
  selectedFlashVersion?: number;
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
  flashInDurationMs,
  flashInEasing,
  flashOpacity,
  flashOutDurationMs,
  flashOutEasing,
  getPrimitiveBySelectionId,
  highlightFlashColor,
  highlightEdgeMode,
  hoverClearDelayMs,
  hoverFadeDurationMs,
  hoverFadeEasing,
  requestRender,
  selectionFlashColor,
  selectedFlashKey,
  selectedFlashVersion,
  selectedId,
}: UseCesiumModelShaderOptions): CesiumModelShaderController => {
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const hoveredPrimitiveRef = useRef<Model | null>(null);
  const lastSelectedFlashSignatureRef = useRef<string | null>(null);
  const highlightStateByPrimitiveRef = useRef<Map<Model, ModelShaderState>>(
    new Map()
  );
  const animationFrameRef = useRef<number | null>(null);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const fadeDurationMsRef = useRef<number>(
    normalizeModelShaderFadeDuration(fadeDurationMs)
  );
  const fadeEasingRef = useRef<EasingFunction>(
    fadeEasing ?? modelShader.defaults.selection.fade.easing
  );
  const hoverFadeDurationMsRef = useRef<number>(
    normalizeModelShaderFadeDuration(hoverFadeDurationMs ?? fadeDurationMs)
  );
  const hoverFadeEasingRef = useRef<EasingFunction>(
    hoverFadeEasing ?? fadeEasing ?? modelShader.defaults.selection.fade.easing
  );
  const hoverClearDelayMsRef = useRef<number>(
    normalizeModelShaderHoverClearDelay(hoverClearDelayMs)
  );
  const fillColorRef = useRef<Color>(
    fillColor ?? modelShader.defaults.selection.color
  );
  const selectionFlashColorRef = useRef<Color>(
    selectionFlashColor ?? modelShader.defaults.selection.flash.color
  );
  const highlightFlashColorRef = useRef<Color>(
    highlightFlashColor ?? fillColorRef.current
  );
  const flashInDurationMsRef = useRef<number>(
    normalizeModelShaderFlashInDuration(flashInDurationMs)
  );
  const flashInEasingRef = useRef<EasingFunction>(
    flashInEasing ?? modelShader.defaults.selection.flash.inEasing
  );
  const flashOpacityRef = useRef<number>(
    clampModelShaderOpacity(
      flashOpacity,
      modelShader.defaults.selection.flash.opacity
    )
  );
  const flashOutDurationMsRef = useRef<number>(
    normalizeModelShaderFlashOutDuration(flashOutDurationMs)
  );
  const flashOutEasingRef = useRef<EasingFunction>(
    flashOutEasing ?? modelShader.defaults.selection.flash.outEasing
  );
  const edgeColorRef = useRef<Color>(
    edgeColor ?? modelShader.defaults.selection.edge.color
  );
  const edgeOpacityRef = useRef<number>(
    clampModelShaderEdgeOpacity(edgeOpacity)
  );
  const edgeWidthPxRef = useRef<number>(
    normalizeModelShaderEdgeWidthPx(edgeWidthPx)
  );
  const edgeModeRef = useRef<ModelShaderEdgeMode>(
    highlightEdgeMode ?? "silhouette"
  );

  useEffect(() => {
    fadeDurationMsRef.current =
      normalizeModelShaderFadeDuration(fadeDurationMs);
  }, [fadeDurationMs]);

  useEffect(() => {
    fadeEasingRef.current =
      fadeEasing ?? modelShader.defaults.selection.fade.easing;
  }, [fadeEasing]);

  useEffect(() => {
    hoverFadeDurationMsRef.current = normalizeModelShaderFadeDuration(
      hoverFadeDurationMs ?? fadeDurationMs
    );
  }, [fadeDurationMs, hoverFadeDurationMs]);

  useEffect(() => {
    hoverFadeEasingRef.current =
      hoverFadeEasing ??
      fadeEasing ??
      modelShader.defaults.selection.fade.easing;
  }, [fadeEasing, hoverFadeEasing]);

  useEffect(() => {
    hoverClearDelayMsRef.current =
      normalizeModelShaderHoverClearDelay(hoverClearDelayMs);
  }, [hoverClearDelayMs]);

  useEffect(() => {
    fillColorRef.current = fillColor ?? modelShader.defaults.selection.color;
  }, [fillColor]);

  useEffect(() => {
    selectionFlashColorRef.current =
      selectionFlashColor ?? modelShader.defaults.selection.flash.color;
  }, [selectionFlashColor]);

  useEffect(() => {
    highlightFlashColorRef.current =
      highlightFlashColor ?? fillColorRef.current;
  }, [highlightFlashColor, fillColor]);

  useEffect(() => {
    flashInDurationMsRef.current =
      normalizeModelShaderFlashInDuration(flashInDurationMs);
  }, [flashInDurationMs]);

  useEffect(() => {
    flashInEasingRef.current =
      flashInEasing ?? modelShader.defaults.selection.flash.inEasing;
  }, [flashInEasing]);

  useEffect(() => {
    flashOpacityRef.current = clampModelShaderOpacity(
      flashOpacity,
      modelShader.defaults.selection.flash.opacity
    );
  }, [flashOpacity]);

  useEffect(() => {
    flashOutDurationMsRef.current =
      normalizeModelShaderFlashOutDuration(flashOutDurationMs);
  }, [flashOutDurationMs]);

  useEffect(() => {
    flashOutEasingRef.current =
      flashOutEasing ?? modelShader.defaults.selection.flash.outEasing;
  }, [flashOutEasing]);

  useEffect(() => {
    edgeColorRef.current =
      edgeColor ?? modelShader.defaults.selection.edge.color;
  }, [edgeColor]);

  useEffect(() => {
    edgeOpacityRef.current = clampModelShaderEdgeOpacity(edgeOpacity);
  }, [edgeOpacity]);

  useEffect(() => {
    edgeWidthPxRef.current = normalizeModelShaderEdgeWidthPx(edgeWidthPx);
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
    (state: ModelShaderState, color: Color, opacity: number) => {
      setModelShaderSelectionUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const setFlashShaderUniforms = useCallback(
    (state: ModelShaderState, color: Color, opacity: number) => {
      setModelShaderFlashUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const readModelShaderFlashColor = useCallback(
    (style: ModelShaderFlashStyle) =>
      style === "highlightFlash"
        ? highlightFlashColorRef.current
        : selectionFlashColorRef.current,
    []
  );

  const startModelShaderFlash = useCallback(
    (state: ModelShaderState, style: ModelShaderFlashStyle) => {
      state.flashColor = cloneColor(readModelShaderFlashColor(style));
      state.flashInDurationMs = flashInDurationMsRef.current;
      state.flashInEasing = flashInEasingRef.current;
      state.flashOpacity = flashOpacityRef.current;
      state.flashOutDurationMs = flashOutDurationMsRef.current;
      state.flashOutEasing = flashOutEasingRef.current;
      state.flashStartTimestampMs = null;
      state.flashStyle = style;
      state.isFlashActive = true;
      setFlashShaderUniforms(
        state,
        state.flashColor,
        state.flashInDurationMs === 0 ? state.flashOpacity : 0
      );
    },
    [readModelShaderFlashColor, setFlashShaderUniforms]
  );

  const clearModelShaderFlash = useCallback(
    (state: ModelShaderState) => {
      state.flashStartTimestampMs = null;
      state.flashStyle = null;
      state.isFlashActive = false;
      setFlashShaderUniforms(state, state.flashColor, 0);
    },
    [setFlashShaderUniforms]
  );

  const applyPresentation = useCallback(
    (primitive: Model, state: ModelShaderState, opacity: number) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const { edgeColor, edgeOpacity, edgeWidthPx } =
        readSelectionOutlineOptions();
      const highlightOpacity = clampModelShaderOpacity(opacity, 0);
      const edgeMode = readPrimitiveModelShaderEdgeMode(
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
      setHighlightShaderUniforms(state, fillColorRef.current, state.opacity);
      if (!state.isFlashActive) {
        setFlashShaderUniforms(state, state.flashColor, 0);
      }
      applyPresentation(primitive, state, state.opacity);
    });
    requestRender();
  }, [
    applyPresentation,
    edgeColor,
    edgeOpacity,
    edgeWidthPx,
    fillColor,
    flashOpacity,
    flashInDurationMs,
    flashInEasing,
    flashOutDurationMs,
    flashOutEasing,
    highlightEdgeMode,
    highlightFlashColor,
    requestRender,
    selectionFlashColor,
    setFlashShaderUniforms,
    setHighlightShaderUniforms,
  ]);

  const readOrCreateHighlightState = useCallback(
    (primitive: Model): ModelShaderState => {
      const existing = highlightStateByPrimitiveRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const originalShader = primitive.customShader ?? undefined;
      const usesIntegratedShader = isModelShader(originalShader);
      const originalHighlightUniforms =
        readModelShaderSelectionUniforms(originalShader);

      const state: ModelShaderState = {
        animationDurationMs: fadeDurationMsRef.current,
        animationEasing: fadeEasingRef.current,
        animationStartOpacity: 0,
        animationStartTimestampMs: null,
        flashColor: cloneColor(selectionFlashColorRef.current),
        flashInDurationMs: flashInDurationMsRef.current,
        flashInEasing: flashInEasingRef.current,
        flashOpacity: flashOpacityRef.current,
        flashOutDurationMs: flashOutDurationMsRef.current,
        flashOutEasing: flashOutEasingRef.current,
        flashStartTimestampMs: null,
        flashStyle: null,
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
            : createModelShader({
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
        clearModelShaderFlash(state);
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
    [clearModelShaderFlash, requestRender, setHighlightShaderUniforms]
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

        setHighlightShaderUniforms(state, fillColorRef.current, nextOpacity);
        if (state.isFlashActive) {
          if (state.flashStartTimestampMs === null) {
            state.flashStartTimestampMs = timestampMs;
          }
          const elapsedMs = Math.max(
            timestampMs - state.flashStartTimestampMs,
            0
          );
          const flashOpacity = readModelShaderFlashOpacity(state, elapsedMs);
          setFlashShaderUniforms(state, state.flashColor, flashOpacity);

          if (elapsedMs < state.flashInDurationMs + state.flashOutDurationMs) {
            hasPendingAnimation = true;
          } else {
            clearModelShaderFlash(state);
          }
        } else {
          setFlashShaderUniforms(state, state.flashColor, 0);
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
      clearModelShaderFlash,
      requestRender,
      restorePrimitiveHighlight,
      setFlashShaderUniforms,
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
        flash?: ModelShaderFlashStyle;
      } = {}
    ) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const state = readOrCreateHighlightState(primitive);
      const nextTargetOpacity = clampModelShaderOpacity(
        targetOpacity,
        modelShader.defaults.selection.opacity
      );

      if (primitive.customShader !== state.shader) {
        applyModelCustomShader(primitive, state.shader, requestRender);
      }

      if (options.flash && nextTargetOpacity > 0) {
        state.opacity = nextTargetOpacity;
        state.animationStartOpacity = nextTargetOpacity;
        state.animationStartTimestampMs = null;
        state.animationDurationMs = 0;
        state.animationEasing = fadeEasingRef.current;
        state.targetOpacity = nextTargetOpacity;
        startModelShaderFlash(state, options.flash);
        setHighlightShaderUniforms(
          state,
          fillColorRef.current,
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
      if (nextTargetOpacity === 0) {
        clearModelShaderFlash(state);
      }
      applyPresentation(primitive, state, state.opacity);
      scheduleHighlightAnimation();
    },
    [
      applyPresentation,
      clearModelShaderFlash,
      readOrCreateHighlightState,
      requestRender,
      scheduleHighlightAnimation,
      startModelShaderFlash,
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
        isHighlighted ? modelShader.defaults.selection.opacity : 0,
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
    (primitive: Model, options: ModelShaderApplyOptions = {}): void => {
      if (primitive.isDestroyed()) return;
      selectedPrimitiveRef.current = primitive;
      setHighlightTarget(
        primitive,
        modelShader.defaults.selection.opacity,
        options.flash ? { flash: options.flash } : undefined
      );
    },
    [setHighlightTarget]
  );

  useEffect(() => {
    const selectedFlashSignature =
      selectedFlashKey && selectedFlashVersion
        ? `${selectedFlashKey}:${selectedFlashVersion}`
        : null;

    if (
      !enabled ||
      !selectedFlashSignature ||
      !selectedFlashKey ||
      selectedFlashSignature === lastSelectedFlashSignatureRef.current ||
      selectedFlashKey !== (selectedId ?? null)
    ) {
      return;
    }

    const primitive = getPrimitiveBySelectionId(selectedFlashKey);
    if (!primitive || primitive.isDestroyed()) {
      return;
    }

    lastSelectedFlashSignatureRef.current = selectedFlashSignature;
    if (selectedPrimitiveRef.current !== primitive) {
      applyHighlight(primitive);
    }
    applyHighlight(primitive, { flash: "highlightFlash" });
  }, [
    applyHighlight,
    enabled,
    getPrimitiveBySelectionId,
    selectedFlashKey,
    selectedFlashVersion,
    selectedId,
  ]);

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
