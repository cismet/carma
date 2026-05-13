import { useCallback, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import {
  Color,
  Model,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type CustomShader,
  type Scene,
} from "@carma-cesium";

import {
  modelShader,
  type ModelShaderEdgeMode,
  type ModelShaderFlashStyle,
  type ModelShaderState,
} from "../utils/modelShader";
import { applyModelCustomShader, isModelPick } from "../utils/modelManager";

export type ModelShaderSelectionActionOptions = {
  flash?: ModelShaderFlashStyle;
};

export type ResolveModelShaderOptions = {
  color: Color;
  highlighted: boolean;
  key: string;
  opacity?: number;
};

export type ModelShaderFadeOptions = {
  durationMs?: number;
  easing?: EasingFunction;
};

export type ModelShaderEdgeOptions = {
  color?: Color;
  mode?: ModelShaderEdgeMode;
  opacity?: number;
  widthPx?: number;
};

export type ModelShaderSelectionStyleOptions = {
  edge?: ModelShaderEdgeOptions;
  fillColor?: Color;
};

export type ModelShaderFlashOptions = {
  color?: Color;
  inDurationMs?: number;
  inEasing?: EasingFunction;
  opacity?: number;
  outDurationMs?: number;
  outEasing?: EasingFunction;
};

export type ModelShaderFlashOptionsByStyle = {
  highlight?: ModelShaderFlashOptions;
  selection?: ModelShaderFlashOptions;
};

export type ModelShaderHoverOptions = {
  clearDelayMs?: number;
  enabled?: boolean;
  fade?: ModelShaderFadeOptions;
};

export type ModelShaderSelectedFeatureOptions = {
  flashKey?: string | null;
  flashVersion?: number;
  id?: string | null;
};

export type ModelShaderStyleOptions = {
  activeKeys: readonly string[];
  fade?: ModelShaderFadeOptions;
};

export type ModelShaderSamplingOptions = {
  color?: Color;
  enabled?: boolean;
  fade?: Pick<ModelShaderFadeOptions, "durationMs">;
  getScene: () => Scene | null | undefined;
  opacity?: number;
};

export type ModelShaderSelectionOptions = {
  enabled?: boolean;
  fade?: ModelShaderFadeOptions;
  flash?: ModelShaderFlashOptionsByStyle;
  getPrimitiveBySelectionId?: (selectedId: string) => Model | null;
  hover?: ModelShaderHoverOptions;
  selected?: ModelShaderSelectedFeatureOptions;
  style?: ModelShaderSelectionStyleOptions;
};

type ResolvedModelShaderFlashOptions = {
  color: Color;
  inDurationMs: number;
  inEasing: EasingFunction;
  opacity: number;
  outDurationMs: number;
  outEasing: EasingFunction;
};

type ModelShaderDefaultFlashOptions =
  (typeof modelShader.defaults.selection.flash)[keyof typeof modelShader.defaults.selection.flash];

type ModelShaderResolverState = {
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

type ModelSamplingShaderState = {
  originalShader: CustomShader | undefined;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
};

const EMPTY_ACTIVE_KEYS: readonly string[] = [];
const noop = () => undefined;
const readNoPrimitive = () => null;

const cloneColor = (color: Color) => Color.clone(color, new Color());

const colorsEqual = (left: Color, right: Color) =>
  left.red === right.red &&
  left.green === right.green &&
  left.blue === right.blue &&
  left.alpha === right.alpha;

const normalizeSamplingFadeDuration = (
  fadeDurationMs: number | undefined
): number =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : modelShader.defaults.sampling.fade.durationMs;

const resolveFlashOptions = (
  options: ModelShaderFlashOptions | undefined,
  defaults: ModelShaderDefaultFlashOptions
): ResolvedModelShaderFlashOptions => ({
  color: options?.color ?? defaults.color,
  inDurationMs: modelShader.normalizeFlashInDuration(
    options?.inDurationMs,
    defaults.inDurationMs
  ),
  inEasing: options?.inEasing ?? defaults.inEasing,
  opacity: modelShader.clampOpacity(options?.opacity, defaults.opacity),
  outDurationMs: modelShader.normalizeFlashOutDuration(
    options?.outDurationMs,
    defaults.outDurationMs
  ),
  outEasing: options?.outEasing ?? defaults.outEasing,
});

const readFlashOpacity = (state: ModelShaderState, elapsedMs: number) => {
  const flashInDurationMs = state.flashInDurationMs;
  const flashOutDurationMs = state.flashOutDurationMs;

  if (flashInDurationMs > 0 && elapsedMs < flashInDurationMs) {
    const progress = modelShader.clampEasedProgress(
      elapsedMs / flashInDurationMs
    );
    return (
      state.flashOpacity *
      modelShader.clampEasedProgress(state.flashInEasing(progress))
    );
  }

  if (flashOutDurationMs === 0) {
    return 0;
  }

  const progress = modelShader.clampEasedProgress(
    (elapsedMs - flashInDurationMs) / flashOutDurationMs
  );
  return (
    state.flashOpacity *
    (1 - modelShader.clampEasedProgress(state.flashOutEasing(progress)))
  );
};

export type CesiumModelShaderController = {
  applySelection: (
    primitive: Model,
    options?: ModelShaderSelectionActionOptions
  ) => void;
  applyHover: (primitive: Model | null) => void;
  clearSelection: () => void;
  clearRuntimeState: () => void;
  isHoveredPrimitive: (primitive: Model) => boolean;
  isSelectedPrimitive: (primitive: Model) => boolean;
  resolveStyle: (options: ResolveModelShaderOptions) => CustomShader;
  restorePrimitiveShader: (primitive: Model) => void;
  restoreShaders: () => void;
  setPrimitiveOriginalShaderIfManaged: (
    primitive: Model,
    shader: CustomShader | undefined
  ) => boolean;
  setPrimitiveOriginalPresentationIfManaged: (
    primitive: Model,
    presentation: {
      silhouetteColor?: Color;
      silhouetteSize: number;
    }
  ) => boolean;
};

export type UseCesiumModelShaderOptions = {
  enabled?: boolean;
  requestRender?: () => void;
  sampling?: ModelShaderSamplingOptions;
  selection?: ModelShaderSelectionOptions;
  style?: ModelShaderStyleOptions;
};

export const useCesiumModelShader = ({
  enabled = false,
  requestRender = noop,
  sampling,
  selection,
  style,
}: UseCesiumModelShaderOptions): CesiumModelShaderController => {
  const selectionEnabled = Boolean(enabled || selection?.enabled);
  const selectionFade = selection?.fade;
  const flash = selection?.flash;
  const selectionHover = selection?.hover;
  const selectionStyle = selection?.style;
  const selected = selection?.selected;
  const getPrimitiveBySelectionId =
    selection?.getPrimitiveBySelectionId ?? readNoPrimitive;
  const fadeDurationMs = selectionFade?.durationMs;
  const fadeEasing = selectionFade?.easing;
  const fillColor = selectionStyle?.fillColor;
  const hoverClearDelayMs = selectionHover?.clearDelayMs;
  const hoverFadeDurationMs = selectionHover?.fade?.durationMs;
  const hoverFadeEasing = selectionHover?.fade?.easing;
  const edgeColor = selectionStyle?.edge?.color;
  const edgeOpacity = selectionStyle?.edge?.opacity;
  const edgeWidthPx = selectionStyle?.edge?.widthPx;
  const highlightEdgeMode = selectionStyle?.edge?.mode;
  const selectionFlashOptions = flash?.selection;
  const highlightFlashOptions = flash?.highlight;
  const selectionFlashColor = selectionFlashOptions?.color;
  const selectionFlashInDurationMs = selectionFlashOptions?.inDurationMs;
  const selectionFlashInEasing = selectionFlashOptions?.inEasing;
  const selectionFlashOpacity = selectionFlashOptions?.opacity;
  const selectionFlashOutDurationMs = selectionFlashOptions?.outDurationMs;
  const selectionFlashOutEasing = selectionFlashOptions?.outEasing;
  const highlightFlashColor = highlightFlashOptions?.color;
  const highlightFlashInDurationMs = highlightFlashOptions?.inDurationMs;
  const highlightFlashInEasing = highlightFlashOptions?.inEasing;
  const highlightFlashOpacity = highlightFlashOptions?.opacity;
  const highlightFlashOutDurationMs = highlightFlashOptions?.outDurationMs;
  const highlightFlashOutEasing = highlightFlashOptions?.outEasing;
  const selectedFlashKey = selected?.flashKey;
  const selectedFlashVersion = selected?.flashVersion;
  const selectedId = selected?.id;
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const hoveredPrimitiveRef = useRef<Model | null>(null);
  const lastSelectedFlashSignatureRef = useRef<string | null>(null);
  const shaderStateByPrimitiveRef = useRef<Map<Model, ModelShaderState>>(
    new Map()
  );
  const animationFrameRef = useRef<number | null>(null);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const fadeDurationMsRef = useRef<number>(
    modelShader.normalizeFadeDuration(fadeDurationMs)
  );
  const fadeEasingRef = useRef<EasingFunction>(
    fadeEasing ?? modelShader.defaults.selection.fade.easing
  );
  const hoverFadeDurationMsRef = useRef<number>(
    modelShader.normalizeFadeDuration(hoverFadeDurationMs ?? fadeDurationMs)
  );
  const hoverFadeEasingRef = useRef<EasingFunction>(
    hoverFadeEasing ?? fadeEasing ?? modelShader.defaults.selection.fade.easing
  );
  const hoverClearDelayMsRef = useRef<number>(
    modelShader.normalizeHoverClearDelay(hoverClearDelayMs)
  );
  const fillColorRef = useRef<Color>(
    fillColor ?? modelShader.defaults.selection.color
  );
  const selectionFlashOptionsRef = useRef<ResolvedModelShaderFlashOptions>(
    resolveFlashOptions(
      selectionFlashOptions,
      modelShader.defaults.selection.flash.selection
    )
  );
  const highlightFlashOptionsRef = useRef<ResolvedModelShaderFlashOptions>(
    resolveFlashOptions(
      highlightFlashOptions,
      modelShader.defaults.selection.flash.highlight
    )
  );
  const edgeColorRef = useRef<Color>(
    edgeColor ?? modelShader.defaults.selection.edge.color
  );
  const edgeOpacityRef = useRef<number>(
    modelShader.clampEdgeOpacity(edgeOpacity)
  );
  const edgeWidthPxRef = useRef<number>(
    modelShader.normalizeEdgeWidthPx(edgeWidthPx)
  );
  const edgeModeRef = useRef<ModelShaderEdgeMode>(
    highlightEdgeMode ?? "silhouette"
  );
  const styleStateByKeyRef = useRef<Map<string, ModelShaderResolverState>>(
    new Map()
  );
  const styleAnimationFrameRef = useRef<number | null>(null);
  const sampledPrimitiveRef = useRef<Model | null>(null);
  const samplingStateByPrimitiveRef = useRef<
    Map<Model, ModelSamplingShaderState>
  >(new Map());
  const samplingAnimationFrameRef = useRef<number | null>(null);
  const lastSamplingAnimationMsRef = useRef<number | null>(null);
  const activeStyleKeys = style?.activeKeys ?? EMPTY_ACTIVE_KEYS;
  const styleFadeDurationMs = style?.fade?.durationMs;
  const styleFadeEasing = style?.fade?.easing;
  const samplingColor = sampling?.color ?? modelShader.defaults.sampling.color;
  const samplingEnabled = Boolean(sampling?.enabled);
  const samplingFadeDurationMs = sampling?.fade?.durationMs;
  const samplingGetScene = sampling?.getScene;
  const samplingOpacity =
    sampling?.opacity ?? modelShader.defaults.sampling.opacity;

  useEffect(() => {
    fadeDurationMsRef.current =
      modelShader.normalizeFadeDuration(fadeDurationMs);
  }, [fadeDurationMs]);

  useEffect(() => {
    fadeEasingRef.current =
      fadeEasing ?? modelShader.defaults.selection.fade.easing;
  }, [fadeEasing]);

  useEffect(() => {
    hoverFadeDurationMsRef.current = modelShader.normalizeFadeDuration(
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
      modelShader.normalizeHoverClearDelay(hoverClearDelayMs);
  }, [hoverClearDelayMs]);

  useEffect(() => {
    fillColorRef.current = fillColor ?? modelShader.defaults.selection.color;
  }, [fillColor]);

  useEffect(() => {
    selectionFlashOptionsRef.current = resolveFlashOptions(
      selectionFlashOptions,
      modelShader.defaults.selection.flash.selection
    );
  }, [
    selectionFlashColor,
    selectionFlashInDurationMs,
    selectionFlashInEasing,
    selectionFlashOpacity,
    selectionFlashOutDurationMs,
    selectionFlashOutEasing,
    selectionFlashOptions,
  ]);

  useEffect(() => {
    highlightFlashOptionsRef.current = resolveFlashOptions(
      highlightFlashOptions,
      modelShader.defaults.selection.flash.highlight
    );
  }, [
    highlightFlashColor,
    highlightFlashInDurationMs,
    highlightFlashInEasing,
    highlightFlashOpacity,
    highlightFlashOutDurationMs,
    highlightFlashOutEasing,
    highlightFlashOptions,
  ]);

  useEffect(() => {
    edgeColorRef.current =
      edgeColor ?? modelShader.defaults.selection.edge.color;
  }, [edgeColor]);

  useEffect(() => {
    edgeOpacityRef.current = modelShader.clampEdgeOpacity(edgeOpacity);
  }, [edgeOpacity]);

  useEffect(() => {
    edgeWidthPxRef.current = modelShader.normalizeEdgeWidthPx(edgeWidthPx);
  }, [edgeWidthPx]);

  useEffect(() => {
    edgeModeRef.current = highlightEdgeMode ?? "silhouette";
  }, [highlightEdgeMode]);

  const setStyleUniforms = useCallback(
    (state: ModelShaderResolverState, color: Color, opacity: number) => {
      state.color = cloneColor(color);
      state.opacity = opacity;
      modelShader.setHighlightUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const animateStyleShaders = useCallback(
    (timestampMs: number) => {
      styleAnimationFrameRef.current = null;

      let hasPendingAnimation = false;
      let hasUpdatedUniforms = false;

      styleStateByKeyRef.current.forEach((state) => {
        if (state.animationStartTimestampMs === null) {
          state.animationStartTimestampMs = timestampMs;
        }

        const linearProgress =
          state.animationDurationMs === 0 ||
          (state.startOpacity === state.targetOpacity &&
            colorsEqual(state.startColor, state.targetColor))
            ? 1
            : modelShader.clampEasedProgress(
                (timestampMs - state.animationStartTimestampMs) /
                  state.animationDurationMs
              );
        const easedProgress = modelShader.clampEasedProgress(
          state.animationEasing(linearProgress)
        );
        const nextColor = modelShader.interpolateColor(
          state.startColor,
          state.targetColor,
          easedProgress
        );
        const nextOpacity =
          state.startOpacity +
          (state.targetOpacity - state.startOpacity) * easedProgress;

        setStyleUniforms(state, nextColor, nextOpacity);
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
        requestRender();
      }

      if (hasPendingAnimation) {
        styleAnimationFrameRef.current =
          requestAnimationFrame(animateStyleShaders);
      }
    },
    [requestRender, setStyleUniforms]
  );

  const scheduleStyleAnimation = useCallback(() => {
    if (styleAnimationFrameRef.current !== null) {
      return;
    }
    styleAnimationFrameRef.current = requestAnimationFrame(animateStyleShaders);
  }, [animateStyleShaders]);

  useEffect(() => {
    const activeKeySet = new Set(activeStyleKeys);
    styleStateByKeyRef.current.forEach((_state, key) => {
      if (!activeKeySet.has(key)) {
        styleStateByKeyRef.current.delete(key);
      }
    });
  }, [activeStyleKeys]);

  useEffect(
    () => () => {
      if (styleAnimationFrameRef.current !== null) {
        cancelAnimationFrame(styleAnimationFrameRef.current);
        styleAnimationFrameRef.current = null;
      }
    },
    []
  );

  const resolveStyle = useCallback(
    ({
      color,
      highlighted,
      key,
      opacity = modelShader.defaults.selection.opacity,
    }: ResolveModelShaderOptions): CustomShader => {
      const shaderStateByKey = styleStateByKeyRef.current;
      let state = shaderStateByKey.get(key);
      if (!state) {
        const shader = modelShader.create({
          color,
          opacity: 0,
        });
        state = {
          animationDurationMs: 0,
          animationEasing:
            styleFadeEasing ?? modelShader.defaults.selection.fade.easing,
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
        ? modelShader.clampOpacity(
            opacity,
            modelShader.defaults.selection.opacity
          )
        : 0;
      const normalizedDurationMs =
        modelShader.normalizeFadeDuration(styleFadeDurationMs);
      const targetColorChanged = !colorsEqual(state.targetColor, color);
      const targetOpacityChanged = state.targetOpacity !== targetOpacity;

      if (targetColorChanged || targetOpacityChanged) {
        state.startColor = cloneColor(state.color);
        state.startOpacity = state.opacity;
        state.targetColor = cloneColor(color);
        state.targetOpacity = targetOpacity;
        state.animationDurationMs = normalizedDurationMs;
        state.animationEasing =
          styleFadeEasing ?? modelShader.defaults.selection.fade.easing;
        state.animationStartTimestampMs = null;
        scheduleStyleAnimation();
      }

      return state.shader;
    },
    [scheduleStyleAnimation, styleFadeDurationMs, styleFadeEasing]
  );

  const readSelectionOutlineOptions = useCallback(
    () => ({
      edgeColor: edgeColorRef.current,
      edgeOpacity: edgeOpacityRef.current,
      edgeWidthPx: edgeWidthPxRef.current,
    }),
    []
  );

  const setSelectionUniforms = useCallback(
    (state: ModelShaderState, color: Color, opacity: number) => {
      modelShader.setSelectionUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const setFlashUniforms = useCallback(
    (state: ModelShaderState, color: Color, opacity: number) => {
      modelShader.setFlashUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const readFlashOptions = useCallback(
    (style: ModelShaderFlashStyle) =>
      style === "highlightFlash"
        ? highlightFlashOptionsRef.current
        : selectionFlashOptionsRef.current,
    []
  );

  const startFlash = useCallback(
    (state: ModelShaderState, style: ModelShaderFlashStyle) => {
      const flashOptions = readFlashOptions(style);
      state.flashColor = cloneColor(flashOptions.color);
      state.flashInDurationMs = flashOptions.inDurationMs;
      state.flashInEasing = flashOptions.inEasing;
      state.flashOpacity = flashOptions.opacity;
      state.flashOutDurationMs = flashOptions.outDurationMs;
      state.flashOutEasing = flashOptions.outEasing;
      state.flashStartTimestampMs = null;
      state.flashStyle = style;
      state.isFlashActive = true;
      setFlashUniforms(
        state,
        state.flashColor,
        state.flashInDurationMs === 0 ? state.flashOpacity : 0
      );
    },
    [readFlashOptions, setFlashUniforms]
  );

  const clearFlash = useCallback(
    (state: ModelShaderState) => {
      state.flashStartTimestampMs = null;
      state.flashStyle = null;
      state.isFlashActive = false;
      setFlashUniforms(state, state.flashColor, 0);
    },
    [setFlashUniforms]
  );

  const applyPresentation = useCallback(
    (primitive: Model, state: ModelShaderState, opacity: number) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const { edgeColor, edgeOpacity, edgeWidthPx } =
        readSelectionOutlineOptions();
      const highlightOpacity = modelShader.clampOpacity(opacity, 0);
      const edgeMode = modelShader.readPrimitiveEdgeMode(
        primitive,
        edgeModeRef.current
      );

      if (edgeMode === "silhouette") {
        primitive.silhouetteColor =
          modelShader.createNonAccumulatingSilhouetteColor(
            edgeColor,
            edgeOpacity
          );
        primitive.silhouetteSize = Math.max(
          state.originalSilhouetteSize,
          modelShader.calculateTaperedSilhouetteSize(
            edgeWidthPx,
            highlightOpacity
          )
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
    if (shaderStateByPrimitiveRef.current.size === 0) {
      return;
    }

    shaderStateByPrimitiveRef.current.forEach((state, primitive) => {
      setSelectionUniforms(state, fillColorRef.current, state.opacity);
      if (!state.isFlashActive) {
        setFlashUniforms(state, state.flashColor, 0);
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
    highlightFlashColor,
    highlightFlashInDurationMs,
    highlightFlashInEasing,
    highlightFlashOpacity,
    highlightFlashOutDurationMs,
    highlightFlashOutEasing,
    highlightEdgeMode,
    requestRender,
    selectionFlashColor,
    selectionFlashInDurationMs,
    selectionFlashInEasing,
    selectionFlashOpacity,
    selectionFlashOutDurationMs,
    selectionFlashOutEasing,
    setFlashUniforms,
    setSelectionUniforms,
  ]);

  const readOrCreateShaderState = useCallback(
    (primitive: Model): ModelShaderState => {
      const existing = shaderStateByPrimitiveRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const originalShader = primitive.customShader ?? undefined;
      const usesIntegratedShader = modelShader.is(originalShader);
      const originalHighlightUniforms =
        modelShader.readSelectionUniforms(originalShader);
      const flashOptions = selectionFlashOptionsRef.current;

      const state: ModelShaderState = {
        animationDurationMs: fadeDurationMsRef.current,
        animationEasing: fadeEasingRef.current,
        animationStartOpacity: 0,
        animationStartTimestampMs: null,
        flashColor: cloneColor(flashOptions.color),
        flashInDurationMs: flashOptions.inDurationMs,
        flashInEasing: flashOptions.inEasing,
        flashOpacity: flashOptions.opacity,
        flashOutDurationMs: flashOptions.outDurationMs,
        flashOutEasing: flashOptions.outEasing,
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
            : modelShader.create({
                color: fillColorRef.current,
                opacity: 0,
              }),
        targetOpacity: 0,
        usesIntegratedShader,
      };
      shaderStateByPrimitiveRef.current.set(primitive, state);
      return state;
    },
    []
  );

  const restorePrimitiveShader = useCallback(
    (primitive: Model) => {
      const state = shaderStateByPrimitiveRef.current.get(primitive);
      if (state && !primitive.isDestroyed()) {
        clearFlash(state);
        if (state.usesIntegratedShader) {
          setSelectionUniforms(
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
      shaderStateByPrimitiveRef.current.delete(primitive);
      if (selectedPrimitiveRef.current === primitive) {
        selectedPrimitiveRef.current = null;
      }
      if (hoveredPrimitiveRef.current === primitive) {
        hoveredPrimitiveRef.current = null;
      }
    },
    [clearFlash, requestRender, setSelectionUniforms]
  );

  const restoreShaders = useCallback(() => {
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
    Array.from(shaderStateByPrimitiveRef.current.keys()).forEach(
      restorePrimitiveShader
    );
  }, [restorePrimitiveShader]);

  const animateShaders = useCallback(
    (timestampMs: number) => {
      animationFrameRef.current = null;
      let hasPendingAnimation = false;

      shaderStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          shaderStateByPrimitiveRef.current.delete(primitive);
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
            : modelShader.clampEasedProgress(
                (timestampMs - state.animationStartTimestampMs) /
                  currentFadeDurationMs
              );
        const easedProgress = modelShader.clampEasedProgress(
          easing(linearProgress)
        );
        const nextOpacity =
          state.animationStartOpacity +
          (state.targetOpacity - state.animationStartOpacity) * easedProgress;

        state.opacity = nextOpacity;

        setSelectionUniforms(state, fillColorRef.current, nextOpacity);
        if (state.isFlashActive) {
          if (state.flashStartTimestampMs === null) {
            state.flashStartTimestampMs = timestampMs;
          }
          const elapsedMs = Math.max(
            timestampMs - state.flashStartTimestampMs,
            0
          );
          const flashOpacity = readFlashOpacity(state, elapsedMs);
          setFlashUniforms(state, state.flashColor, flashOpacity);

          if (elapsedMs < state.flashInDurationMs + state.flashOutDurationMs) {
            hasPendingAnimation = true;
          } else {
            clearFlash(state);
          }
        } else {
          setFlashUniforms(state, state.flashColor, 0);
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
          restorePrimitiveShader(primitive);
        }
      });

      if (hasPendingAnimation) {
        animationFrameRef.current = requestAnimationFrame(animateShaders);
      }
    },
    [
      applyPresentation,
      clearFlash,
      requestRender,
      restorePrimitiveShader,
      setFlashUniforms,
      setSelectionUniforms,
    ]
  );

  const scheduleShaderAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(animateShaders);
  }, [animateShaders]);

  const setSelectionTarget = useCallback(
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

      const state = readOrCreateShaderState(primitive);
      const nextTargetOpacity = modelShader.clampOpacity(
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
        startFlash(state, options.flash);
        setSelectionUniforms(state, fillColorRef.current, nextTargetOpacity);
        applyPresentation(primitive, state, nextTargetOpacity);
        requestRender();
        scheduleShaderAnimation();
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
        clearFlash(state);
      }
      applyPresentation(primitive, state, state.opacity);
      scheduleShaderAnimation();
    },
    [
      applyPresentation,
      clearFlash,
      readOrCreateShaderState,
      requestRender,
      scheduleShaderAnimation,
      startFlash,
      setSelectionUniforms,
    ]
  );

  const refreshSelectionTarget = useCallback(
    (primitive: Model | null, timing: "selection" | "hover" = "selection") => {
      if (!primitive || primitive.isDestroyed()) {
        return;
      }
      const isActive =
        selectedPrimitiveRef.current === primitive ||
        hoveredPrimitiveRef.current === primitive;
      const state = shaderStateByPrimitiveRef.current.get(primitive);

      if (!isActive && !state) {
        return;
      }

      const timingOptions =
        timing === "hover"
          ? {
              durationMs: hoverFadeDurationMsRef.current,
              easing: hoverFadeEasingRef.current,
            }
          : undefined;

      setSelectionTarget(
        primitive,
        isActive ? modelShader.defaults.selection.opacity : 0,
        timingOptions
      );
    },
    [setSelectionTarget]
  );

  const clearSelection = useCallback(() => {
    const current = selectedPrimitiveRef.current;
    if (!current || current.isDestroyed()) {
      selectedPrimitiveRef.current = null;
      return;
    }
    selectedPrimitiveRef.current = null;
    refreshSelectionTarget(current);
  }, [refreshSelectionTarget]);

  const applySelection = useCallback(
    (
      primitive: Model,
      options: ModelShaderSelectionActionOptions = {}
    ): void => {
      if (primitive.isDestroyed()) return;
      selectedPrimitiveRef.current = primitive;
      setSelectionTarget(
        primitive,
        modelShader.defaults.selection.opacity,
        options.flash ? { flash: options.flash } : undefined
      );
    },
    [setSelectionTarget]
  );

  useEffect(() => {
    const selectedFlashSignature =
      selectedFlashKey && selectedFlashVersion
        ? `${selectedFlashKey}:${selectedFlashVersion}`
        : null;

    if (
      !selectionEnabled ||
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
      applySelection(primitive);
    }
    applySelection(primitive, { flash: "highlightFlash" });
  }, [
    applySelection,
    getPrimitiveBySelectionId,
    selectedFlashKey,
    selectedFlashVersion,
    selectedId,
    selectionEnabled,
  ]);

  const applyHover = useCallback(
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
          refreshSelectionTarget(hovered, "hover");
        }, hoverClearDelayMsRef.current);
        return;
      }

      const current = hoveredPrimitiveRef.current;
      if (current === primitive) {
        return;
      }

      hoveredPrimitiveRef.current = primitive;
      refreshSelectionTarget(current, "hover");
      refreshSelectionTarget(primitive, "hover");
    },
    [refreshSelectionTarget]
  );

  const isSelectedPrimitive = useCallback(
    (primitive: Model) => selectedPrimitiveRef.current === primitive,
    []
  );

  const isHoveredPrimitive = useCallback(
    (primitive: Model) => hoveredPrimitiveRef.current === primitive,
    []
  );

  const setPrimitiveOriginalShaderIfManaged = useCallback(
    (primitive: Model, shader: CustomShader | undefined) => {
      const state = shaderStateByPrimitiveRef.current.get(primitive);
      if (!state) {
        return false;
      }
      state.originalShader = shader;
      return true;
    },
    []
  );

  const setPrimitiveOriginalPresentationIfManaged = useCallback(
    (
      primitive: Model,
      presentation: {
        silhouetteColor?: Color;
        silhouetteSize: number;
      }
    ) => {
      const state = shaderStateByPrimitiveRef.current.get(primitive);
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
    shaderStateByPrimitiveRef.current.clear();
  }, []);

  const restoreSamplingShader = useCallback(
    (primitive: Model, state: ModelSamplingShaderState) => {
      if (!primitive.isDestroyed() && primitive.customShader === state.shader) {
        primitive.customShader = state.originalShader;
      }
      samplingStateByPrimitiveRef.current.delete(primitive);
      if (sampledPrimitiveRef.current === primitive) {
        sampledPrimitiveRef.current = null;
      }
    },
    []
  );

  const cancelSamplingAnimation = useCallback(() => {
    if (samplingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(samplingAnimationFrameRef.current);
      samplingAnimationFrameRef.current = null;
    }
    lastSamplingAnimationMsRef.current = null;
  }, []);

  const restoreSamplingShaders = useCallback(() => {
    cancelSamplingAnimation();
    samplingStateByPrimitiveRef.current.forEach((state, primitive) => {
      restoreSamplingShader(primitive, state);
    });
    samplingStateByPrimitiveRef.current.clear();
    sampledPrimitiveRef.current = null;
  }, [cancelSamplingAnimation, restoreSamplingShader]);

  const readOrCreateSamplingState = useCallback(
    (primitive: Model): ModelSamplingShaderState => {
      const existing = samplingStateByPrimitiveRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const state = {
        originalShader: primitive.customShader ?? undefined,
        opacity: 0,
        shader: modelShader.createSampling(),
        targetOpacity: 0,
      };
      samplingStateByPrimitiveRef.current.set(primitive, state);
      primitive.customShader = state.shader;
      modelShader.setSamplingUniforms({
        color: samplingColor,
        opacity: state.opacity,
        shader: state.shader,
      });
      return state;
    },
    [samplingColor]
  );

  const animateSamplingShader = useCallback(
    (timestampMs: number) => {
      samplingAnimationFrameRef.current = null;

      const previousTimestampMs = lastSamplingAnimationMsRef.current;
      lastSamplingAnimationMsRef.current = timestampMs;

      const elapsedMs =
        previousTimestampMs === null
          ? 0
          : Math.max(0, timestampMs - previousTimestampMs);
      const normalizedFadeDurationMs = normalizeSamplingFadeDuration(
        samplingFadeDurationMs
      );
      const opacityStep =
        normalizedFadeDurationMs === 0
          ? 1
          : (elapsedMs / normalizedFadeDurationMs) *
            modelShader.clampOpacity(samplingOpacity);
      let hasPendingAnimation = false;

      samplingStateByPrimitiveRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          samplingStateByPrimitiveRef.current.delete(primitive);
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
        modelShader.setSamplingUniforms({
          color: samplingColor,
          opacity: nextOpacity,
          shader: state.shader,
        });

        if (nextOpacity !== state.targetOpacity) {
          hasPendingAnimation = true;
          return;
        }

        if (nextOpacity === 0 && state.targetOpacity === 0) {
          restoreSamplingShader(primitive, state);
        }
      });

      const scene = samplingGetScene?.();
      if (scene && !scene.isDestroyed()) {
        scene.requestRender();
      }

      if (hasPendingAnimation) {
        samplingAnimationFrameRef.current = requestAnimationFrame(
          animateSamplingShader
        );
        return;
      }

      lastSamplingAnimationMsRef.current = null;
    },
    [
      restoreSamplingShader,
      samplingColor,
      samplingFadeDurationMs,
      samplingGetScene,
      samplingOpacity,
    ]
  );

  const scheduleSamplingAnimation = useCallback(() => {
    if (samplingAnimationFrameRef.current !== null) {
      return;
    }
    lastSamplingAnimationMsRef.current = null;
    samplingAnimationFrameRef.current = requestAnimationFrame(
      animateSamplingShader
    );
  }, [animateSamplingShader]);

  const applySamplingShader = useCallback(
    (primitive: Model | null) => {
      const targetOpacity = modelShader.clampOpacity(samplingOpacity);
      const current = sampledPrimitiveRef.current;
      if (current && current !== primitive && !current.isDestroyed()) {
        const currentState = samplingStateByPrimitiveRef.current.get(current);
        if (currentState) {
          currentState.targetOpacity = 0;
        }
      }

      sampledPrimitiveRef.current = primitive;

      if (!primitive || primitive.isDestroyed()) {
        scheduleSamplingAnimation();
        return;
      }

      const state = readOrCreateSamplingState(primitive);
      if (primitive.customShader !== state.shader) {
        primitive.customShader = state.shader;
      }
      state.targetOpacity = targetOpacity;
      scheduleSamplingAnimation();
    },
    [readOrCreateSamplingState, samplingOpacity, scheduleSamplingAnimation]
  );

  const clearSamplingShader = useCallback(() => {
    applySamplingShader(null);
  }, [applySamplingShader]);

  useEffect(() => {
    if (!samplingEnabled || !samplingGetScene) {
      restoreSamplingShaders();
      return;
    }

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachSamplingHandler = () => {
      if (disposed) return;

      const scene = samplingGetScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachSamplingHandler, 100);
        return;
      }

      handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((event: { endPosition?: Cartesian2 }) => {
        const position = event.endPosition;
        if (!position) {
          clearSamplingShader();
          return;
        }

        const modelPick = scene.pick(position, 1, 1);
        applySamplingShader(
          isModelPick(modelPick) ? modelPick.primitive : null
        );
        scene.requestRender();
      }, ScreenSpaceEventType.MOUSE_MOVE);
    };

    attachSamplingHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      handler?.destroy();
      restoreSamplingShaders();
    };
  }, [
    applySamplingShader,
    clearSamplingShader,
    restoreSamplingShaders,
    samplingEnabled,
    samplingGetScene,
  ]);

  useEffect(() => {
    if (!selectionEnabled) {
      restoreShaders();
      return;
    }

    const nextSelectedId = selectedId ?? null;
    if (!nextSelectedId) {
      if (selectedPrimitiveRef.current) {
        clearSelection();
      }
      return;
    }

    const matchingPrimitive = getPrimitiveBySelectionId(nextSelectedId);
    if (!matchingPrimitive) {
      if (selectedPrimitiveRef.current) {
        clearSelection();
      }
      return;
    }

    if (selectedPrimitiveRef.current === matchingPrimitive) return;

    clearSelection();
    applySelection(matchingPrimitive);
  }, [
    applySelection,
    clearSelection,
    getPrimitiveBySelectionId,
    restoreShaders,
    selectedId,
    selectionEnabled,
  ]);

  return {
    applySelection,
    applyHover,
    clearSelection,
    clearRuntimeState,
    isHoveredPrimitive,
    isSelectedPrimitive,
    resolveStyle,
    restorePrimitiveShader,
    restoreShaders,
    setPrimitiveOriginalPresentationIfManaged,
    setPrimitiveOriginalShaderIfManaged,
  };
};
