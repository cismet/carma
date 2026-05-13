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
import { cloneColor } from "@carma-mapping/engines/cesium/core";

import {
  modelShader,
  type ModelShaderEdgeMode,
  type ModelShaderFlashKind,
  type ModelShaderState,
} from "../utils/modelShader";
import { applyModelCustomShader, isModelPick } from "../utils/modelManager";

export type ModelShaderActionOptions = {
  flash?: ModelShaderFlashKind;
};

export type ModelShaderHighlightResolveOptions = {
  color: Color;
  highlighted: boolean;
  key: string;
  opacity?: number;
};

export type TransitionOptions = {
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

export type ModelShaderFlashByKindOptions = {
  highlight?: ModelShaderFlashOptions;
  selection?: ModelShaderFlashOptions;
};

export type ModelShaderHoverOptions = {
  clearDelayMs?: number;
  enabled?: boolean;
  fade?: TransitionOptions;
};

export type ModelShaderSelectedFeatureOptions = {
  flashKey?: string | null;
  flashVersion?: number;
  id?: string | null;
};

export type ModelShaderHighlightOptions = {
  activeKeys: readonly string[];
  fade?: TransitionOptions;
};

export type ModelShaderSamplingOptions = {
  color?: Color;
  enabled?: boolean;
  fade?: Pick<TransitionOptions, "durationMs">;
  getScene: () => Scene | null | undefined;
  opacity?: number;
};

export type ModelShaderSelectionOptions = {
  enabled?: boolean;
  fade?: TransitionOptions;
  flash?: ModelShaderFlashByKindOptions;
  getPrimitiveBySelectionId?: (selectedId: string) => Model | null;
  hover?: ModelShaderHoverOptions;
  selected?: ModelShaderSelectedFeatureOptions;
  style?: ModelShaderSelectionStyleOptions;
};

type ResolvedFlash = {
  color: Color;
  inDurationMs: number;
  inEasing: EasingFunction;
  opacity: number;
  outDurationMs: number;
  outEasing: EasingFunction;
};

type DefaultFlash =
  (typeof modelShader.defaults.selection.flash)[keyof typeof modelShader.defaults.selection.flash];

type HighlightState = {
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

type SamplingState = {
  originalShader: CustomShader | undefined;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
};

const EMPTY_ACTIVE_KEYS: readonly string[] = [];
const noop = () => undefined;
const noPrimitive = () => null;

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

const resolveFlash = (
  options: ModelShaderFlashOptions | undefined,
  defaults: DefaultFlash
): ResolvedFlash => ({
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

const getFlashOpacity = (state: ModelShaderState, elapsedMs: number) => {
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

export type ModelShaderController = {
  applySelection: (
    primitive: Model,
    options?: ModelShaderActionOptions
  ) => void;
  applyHover: (primitive: Model | null) => void;
  clearSelection: () => void;
  clearRuntimeState: () => void;
  isHoveredPrimitive: (primitive: Model) => boolean;
  isSelectedPrimitive: (primitive: Model) => boolean;
  resolveHighlight: (
    options: ModelShaderHighlightResolveOptions
  ) => CustomShader;
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

export type CesiumModelShaderOptions = {
  enabled?: boolean;
  highlight?: ModelShaderHighlightOptions;
  requestRender?: () => void;
  sampling?: ModelShaderSamplingOptions;
  selection?: ModelShaderSelectionOptions;
};

export const useCesiumModelShader = ({
  enabled = false,
  highlight,
  requestRender = noop,
  sampling,
  selection,
}: CesiumModelShaderOptions): ModelShaderController => {
  const selectionEnabled = Boolean(enabled || selection?.enabled);
  const selectionFade = selection?.fade;
  const flash = selection?.flash;
  const selectionHover = selection?.hover;
  const selectionStyle = selection?.style;
  const selected = selection?.selected;
  const getPrimitiveBySelectionId =
    selection?.getPrimitiveBySelectionId ?? noPrimitive;
  const fadeDurationMs = selectionFade?.durationMs;
  const fadeEasing = selectionFade?.easing;
  const fillColor = selectionStyle?.fillColor;
  const hoverClearDelayMs = selectionHover?.clearDelayMs;
  const hoverFadeDurationMs = selectionHover?.fade?.durationMs;
  const hoverFadeEasing = selectionHover?.fade?.easing;
  const edgeColor = selectionStyle?.edge?.color;
  const edgeOpacity = selectionStyle?.edge?.opacity;
  const edgeWidthPx = selectionStyle?.edge?.widthPx;
  const edgeModeOption = selectionStyle?.edge?.mode;
  const selectionFlash = flash?.selection;
  const highlightFlash = flash?.highlight;
  const selectedFlashKey = selected?.flashKey;
  const selectedFlashVersion = selected?.flashVersion;
  const selectedId = selected?.id;
  const selectedModelRef = useRef<Model | null>(null);
  const hoveredModelRef = useRef<Model | null>(null);
  const lastSelectedFlashSignatureRef = useRef<string | null>(null);
  const selectionStatesRef = useRef<Map<Model, ModelShaderState>>(new Map());
  const selectionFrameRef = useRef<number | null>(null);
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
  const selectionFlashRef = useRef<ResolvedFlash>(
    resolveFlash(selectionFlash, modelShader.defaults.selection.flash.selection)
  );
  const highlightFlashRef = useRef<ResolvedFlash>(
    resolveFlash(highlightFlash, modelShader.defaults.selection.flash.highlight)
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
    edgeModeOption ?? "silhouette"
  );
  const highlightStatesRef = useRef<Map<string, HighlightState>>(new Map());
  const highlightFrameRef = useRef<number | null>(null);
  const sampledModelRef = useRef<Model | null>(null);
  const samplingStatesRef = useRef<Map<Model, SamplingState>>(new Map());
  const samplingFrameRef = useRef<number | null>(null);
  const lastSamplingFrameMsRef = useRef<number | null>(null);
  const activeHighlightKeys = highlight?.activeKeys ?? EMPTY_ACTIVE_KEYS;
  const highlightFadeDurationMs = highlight?.fade?.durationMs;
  const highlightFadeEasing = highlight?.fade?.easing;
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
    selectionFlashRef.current = resolveFlash(
      selectionFlash,
      modelShader.defaults.selection.flash.selection
    );
  }, [selectionFlash]);

  useEffect(() => {
    highlightFlashRef.current = resolveFlash(
      highlightFlash,
      modelShader.defaults.selection.flash.highlight
    );
  }, [highlightFlash]);

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
    edgeModeRef.current = edgeModeOption ?? "silhouette";
  }, [edgeModeOption]);

  const setHighlightState = useCallback(
    (state: HighlightState, color: Color, opacity: number) => {
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

  const animateHighlightShaders = useCallback(
    (timestampMs: number) => {
      highlightFrameRef.current = null;

      let hasPendingAnimation = false;
      let hasUpdatedUniforms = false;

      highlightStatesRef.current.forEach((state) => {
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

        setHighlightState(state, nextColor, nextOpacity);
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
        highlightFrameRef.current = requestAnimationFrame(
          animateHighlightShaders
        );
      }
    },
    [requestRender, setHighlightState]
  );

  const scheduleHighlightAnimation = useCallback(() => {
    if (highlightFrameRef.current !== null) {
      return;
    }
    highlightFrameRef.current = requestAnimationFrame(animateHighlightShaders);
  }, [animateHighlightShaders]);

  useEffect(() => {
    const activeKeySet = new Set(activeHighlightKeys);
    highlightStatesRef.current.forEach((_state, key) => {
      if (!activeKeySet.has(key)) {
        highlightStatesRef.current.delete(key);
      }
    });
  }, [activeHighlightKeys]);

  useEffect(
    () => () => {
      if (highlightFrameRef.current !== null) {
        cancelAnimationFrame(highlightFrameRef.current);
        highlightFrameRef.current = null;
      }
    },
    []
  );

  const resolveHighlight = useCallback(
    ({
      color,
      highlighted,
      key,
      opacity = modelShader.defaults.selection.opacity,
    }: ModelShaderHighlightResolveOptions): CustomShader => {
      const states = highlightStatesRef.current;
      let state = states.get(key);
      if (!state) {
        const shader = modelShader.create({
          color,
          opacity: 0,
        });
        state = {
          animationDurationMs: 0,
          animationEasing:
            highlightFadeEasing ?? modelShader.defaults.selection.fade.easing,
          animationStartTimestampMs: null,
          color: cloneColor(color),
          opacity: 0,
          shader,
          startColor: cloneColor(color),
          startOpacity: 0,
          targetColor: cloneColor(color),
          targetOpacity: 0,
        };
        states.set(key, state);
      }

      const targetOpacity = highlighted
        ? modelShader.clampOpacity(
            opacity,
            modelShader.defaults.selection.opacity
          )
        : 0;
      const normalizedDurationMs = modelShader.normalizeFadeDuration(
        highlightFadeDurationMs
      );
      const targetColorChanged = !colorsEqual(state.targetColor, color);
      const targetOpacityChanged = state.targetOpacity !== targetOpacity;

      if (targetColorChanged || targetOpacityChanged) {
        state.startColor = cloneColor(state.color);
        state.startOpacity = state.opacity;
        state.targetColor = cloneColor(color);
        state.targetOpacity = targetOpacity;
        state.animationDurationMs = normalizedDurationMs;
        state.animationEasing =
          highlightFadeEasing ?? modelShader.defaults.selection.fade.easing;
        state.animationStartTimestampMs = null;
        scheduleHighlightAnimation();
      }

      return state.shader;
    },
    [scheduleHighlightAnimation, highlightFadeDurationMs, highlightFadeEasing]
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

  const readFlash = useCallback(
    (flashKind: ModelShaderFlashKind) =>
      flashKind === "highlightFlash"
        ? highlightFlashRef.current
        : selectionFlashRef.current,
    []
  );

  const startFlash = useCallback(
    (state: ModelShaderState, flashKind: ModelShaderFlashKind) => {
      const flashConfig = readFlash(flashKind);
      state.flashColor = cloneColor(flashConfig.color);
      state.flashInDurationMs = flashConfig.inDurationMs;
      state.flashInEasing = flashConfig.inEasing;
      state.flashOpacity = flashConfig.opacity;
      state.flashOutDurationMs = flashConfig.outDurationMs;
      state.flashOutEasing = flashConfig.outEasing;
      state.flashStartTimestampMs = null;
      state.isFlashActive = true;
      setFlashUniforms(
        state,
        state.flashColor,
        state.flashInDurationMs === 0 ? state.flashOpacity : 0
      );
    },
    [readFlash, setFlashUniforms]
  );

  const clearFlash = useCallback(
    (state: ModelShaderState) => {
      state.flashStartTimestampMs = null;
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
    if (selectionStatesRef.current.size === 0) {
      return;
    }

    selectionStatesRef.current.forEach((state, primitive) => {
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
    highlightFlash,
    edgeModeOption,
    requestRender,
    selectionFlash,
    setFlashUniforms,
    setSelectionUniforms,
  ]);

  const readOrCreateShaderState = useCallback(
    (primitive: Model): ModelShaderState => {
      const existing = selectionStatesRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const originalShader = primitive.customShader ?? undefined;
      const usesModelShader = modelShader.is(originalShader);
      const originalSelectionUniforms =
        modelShader.readSelectionUniforms(originalShader);
      const initialFlash = selectionFlashRef.current;

      const state: ModelShaderState = {
        animationDurationMs: fadeDurationMsRef.current,
        animationEasing: fadeEasingRef.current,
        animationStartOpacity: 0,
        animationStartTimestampMs: null,
        flashColor: cloneColor(initialFlash.color),
        flashInDurationMs: initialFlash.inDurationMs,
        flashInEasing: initialFlash.inEasing,
        flashOpacity: initialFlash.opacity,
        flashOutDurationMs: initialFlash.outDurationMs,
        flashOutEasing: initialFlash.outEasing,
        flashStartTimestampMs: null,
        isFlashActive: false,
        ...(originalSelectionUniforms
          ? {
              originalSelectionColor: originalSelectionUniforms.color,
              originalSelectionOpacity: originalSelectionUniforms.opacity,
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
          usesModelShader && originalShader
            ? originalShader
            : modelShader.create({
                color: fillColorRef.current,
                opacity: 0,
              }),
        targetOpacity: 0,
        usesModelShader,
      };
      selectionStatesRef.current.set(primitive, state);
      return state;
    },
    []
  );

  const restorePrimitiveShader = useCallback(
    (primitive: Model) => {
      const state = selectionStatesRef.current.get(primitive);
      if (state && !primitive.isDestroyed()) {
        clearFlash(state);
        if (state.usesModelShader) {
          setSelectionUniforms(
            state,
            state.originalSelectionColor ?? fillColorRef.current,
            state.originalSelectionOpacity ?? 0
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
      selectionStatesRef.current.delete(primitive);
      if (selectedModelRef.current === primitive) {
        selectedModelRef.current = null;
      }
      if (hoveredModelRef.current === primitive) {
        hoveredModelRef.current = null;
      }
    },
    [clearFlash, requestRender, setSelectionUniforms]
  );

  const restoreShaders = useCallback(() => {
    if (hoverClearTimeoutRef.current !== null) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    if (selectionFrameRef.current !== null) {
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = null;
    }

    selectedModelRef.current = null;
    hoveredModelRef.current = null;
    Array.from(selectionStatesRef.current.keys()).forEach(
      restorePrimitiveShader
    );
  }, [restorePrimitiveShader]);

  const animateShaders = useCallback(
    (timestampMs: number) => {
      selectionFrameRef.current = null;
      let hasPendingAnimation = false;

      selectionStatesRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          selectionStatesRef.current.delete(primitive);
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
          const flashOpacity = getFlashOpacity(state, elapsedMs);
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
        selectionFrameRef.current = requestAnimationFrame(animateShaders);
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
    if (selectionFrameRef.current !== null) {
      return;
    }
    selectionFrameRef.current = requestAnimationFrame(animateShaders);
  }, [animateShaders]);

  const setSelectionTarget = useCallback(
    (
      primitive: Model,
      targetOpacity: number,
      options: {
        durationMs?: number;
        easing?: EasingFunction;
        flash?: ModelShaderFlashKind;
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
        selectedModelRef.current === primitive ||
        hoveredModelRef.current === primitive;
      const state = selectionStatesRef.current.get(primitive);

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
    const current = selectedModelRef.current;
    if (!current || current.isDestroyed()) {
      selectedModelRef.current = null;
      return;
    }
    selectedModelRef.current = null;
    refreshSelectionTarget(current);
  }, [refreshSelectionTarget]);

  const applySelection = useCallback(
    (primitive: Model, options: ModelShaderActionOptions = {}): void => {
      if (primitive.isDestroyed()) return;
      selectedModelRef.current = primitive;
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
    if (selectedModelRef.current !== primitive) {
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
        const current = hoveredModelRef.current;
        if (!current) {
          return;
        }

        hoverClearTimeoutRef.current = setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          const hovered = hoveredModelRef.current;
          hoveredModelRef.current = null;
          refreshSelectionTarget(hovered, "hover");
        }, hoverClearDelayMsRef.current);
        return;
      }

      const current = hoveredModelRef.current;
      if (current === primitive) {
        return;
      }

      hoveredModelRef.current = primitive;
      refreshSelectionTarget(current, "hover");
      refreshSelectionTarget(primitive, "hover");
    },
    [refreshSelectionTarget]
  );

  const isSelectedPrimitive = useCallback(
    (primitive: Model) => selectedModelRef.current === primitive,
    []
  );

  const isHoveredPrimitive = useCallback(
    (primitive: Model) => hoveredModelRef.current === primitive,
    []
  );

  const setPrimitiveOriginalShaderIfManaged = useCallback(
    (primitive: Model, shader: CustomShader | undefined) => {
      const state = selectionStatesRef.current.get(primitive);
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
      const state = selectionStatesRef.current.get(primitive);
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
    if (selectionFrameRef.current !== null) {
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = null;
    }
    selectedModelRef.current = null;
    hoveredModelRef.current = null;
    selectionStatesRef.current.clear();
  }, []);

  const restoreSamplingShader = useCallback(
    (primitive: Model, state: SamplingState) => {
      if (!primitive.isDestroyed() && primitive.customShader === state.shader) {
        primitive.customShader = state.originalShader;
      }
      samplingStatesRef.current.delete(primitive);
      if (sampledModelRef.current === primitive) {
        sampledModelRef.current = null;
      }
    },
    []
  );

  const cancelSamplingAnimation = useCallback(() => {
    if (samplingFrameRef.current !== null) {
      cancelAnimationFrame(samplingFrameRef.current);
      samplingFrameRef.current = null;
    }
    lastSamplingFrameMsRef.current = null;
  }, []);

  const restoreSamplingShaders = useCallback(() => {
    cancelSamplingAnimation();
    samplingStatesRef.current.forEach((state, primitive) => {
      restoreSamplingShader(primitive, state);
    });
    samplingStatesRef.current.clear();
    sampledModelRef.current = null;
  }, [cancelSamplingAnimation, restoreSamplingShader]);

  const readOrCreateSamplingState = useCallback(
    (primitive: Model): SamplingState => {
      const existing = samplingStatesRef.current.get(primitive);
      if (existing) {
        return existing;
      }

      const state = {
        originalShader: primitive.customShader ?? undefined,
        opacity: 0,
        shader: modelShader.createSampling(),
        targetOpacity: 0,
      };
      samplingStatesRef.current.set(primitive, state);
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
      samplingFrameRef.current = null;

      const previousTimestampMs = lastSamplingFrameMsRef.current;
      lastSamplingFrameMsRef.current = timestampMs;

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

      samplingStatesRef.current.forEach((state, primitive) => {
        if (primitive.isDestroyed()) {
          samplingStatesRef.current.delete(primitive);
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
        samplingFrameRef.current = requestAnimationFrame(animateSamplingShader);
        return;
      }

      lastSamplingFrameMsRef.current = null;
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
    if (samplingFrameRef.current !== null) {
      return;
    }
    lastSamplingFrameMsRef.current = null;
    samplingFrameRef.current = requestAnimationFrame(animateSamplingShader);
  }, [animateSamplingShader]);

  const applySamplingShader = useCallback(
    (primitive: Model | null) => {
      const targetOpacity = modelShader.clampOpacity(samplingOpacity);
      const current = sampledModelRef.current;
      if (current && current !== primitive && !current.isDestroyed()) {
        const currentState = samplingStatesRef.current.get(current);
        if (currentState) {
          currentState.targetOpacity = 0;
        }
      }

      sampledModelRef.current = primitive;

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
      if (selectedModelRef.current) {
        clearSelection();
      }
      return;
    }

    const matchingPrimitive = getPrimitiveBySelectionId(nextSelectedId);
    if (!matchingPrimitive) {
      if (selectedModelRef.current) {
        clearSelection();
      }
      return;
    }

    if (selectedModelRef.current === matchingPrimitive) return;

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
    resolveHighlight,
    restorePrimitiveShader,
    restoreShaders,
    setPrimitiveOriginalPresentationIfManaged,
    setPrimitiveOriginalShaderIfManaged,
  };
};
