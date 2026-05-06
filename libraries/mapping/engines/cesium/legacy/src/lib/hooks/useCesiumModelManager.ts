import { useCallback, useEffect, useRef } from "react";

import type { ModelConfig } from "@carma-mapping/engines/cesium/core";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import {
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Model,
  type Cartesian2,
  type CustomShader,
} from "@carma-cesium";

import { createModelPrimitiveFromConfig } from "../utils/createModelPrimitiveFromConfig";
import {
  clampModelHighlightEdgeOpacity,
  clampModelHighlightOpacity,
  createModelSelectionHighlightShader,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_OPACITY,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY,
  isModelIntegratedHighlightShader,
  normalizeModelHighlightEdgeWidthPx,
  setModelHighlightShaderUniforms,
} from "../utils/modelHighlightShader";
import {
  buildModelKey,
  extractPickedProperties,
  getPrimitiveSelectionId,
  isModelPick,
} from "../utils/modelManager";
import { useCesiumContext } from "./useCesiumContext";

const MODEL_SELECTION_HIGHLIGHT_EDGE_MODE_PROPERTY =
  "modelSelectionHighlightEdgeMode";

export type ModelSelectionHighlightEdgeMode = "silhouette" | "none";

export interface UseCesiumModelManagerOptions {
  models: ModelConfig[];
  enabled: boolean;
  selection?: {
    enabled?: boolean;
    onSelect?: (feature: unknown) => void;
    onClearSelection?: () => void;
    onModelAdded?: (primitiveId: string, primitive: Model) => void;
    onModelFirstRendered?: (primitiveId: string, primitive: Model) => void;
    deselectOnEmptyClick?: boolean;
    highlightEdgeColor?: Color;
    highlightEdgeOpacity?: number;
    highlightEdgeWidthPx?: number;
    highlightFadeDurationMs?: number;
    highlightFadeEasing?: EasingFunction;
    highlightEdgeMode?: ModelSelectionHighlightEdgeMode;
    highlightMinimumPixelSize?: number;
    selectedId?: string | null;
  };
}

const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS = 220;
const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING = Easing.CUBIC_OUT;
const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_DURATION_MS = 160;
const DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS = 40;
const DEFAULT_MODEL_SELECTION_HIGHLIGHT_MINIMUM_PIXEL_SIZE = 1;
const MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT = 1.5;
const MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR = new Color(1, 1, 1, 1);

const normalizeModelSelectionHighlightFadeDuration = (
  fadeDurationMs: number | undefined
) =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS;

const normalizeModelSelectionHighlightMinimumPixelSize = (
  minimumPixelSize: number | undefined
) =>
  typeof minimumPixelSize === "number" &&
  Number.isFinite(minimumPixelSize) &&
  minimumPixelSize >= 0
    ? minimumPixelSize
    : DEFAULT_MODEL_SELECTION_HIGHLIGHT_MINIMUM_PIXEL_SIZE;

const clampEasedProgress = (progress: number) =>
  Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;

const interpolateColor = (from: Color, to: Color, progress: number) =>
  new Color(
    from.red + (to.red - from.red) * progress,
    from.green + (to.green - from.green) * progress,
    from.blue + (to.blue - from.blue) * progress,
    from.alpha + (to.alpha - from.alpha) * progress
  );

const createNonAccumulatingSilhouetteColor = (
  edgeColor: Color,
  edgeOpacity: number
) => {
  const strength =
    edgeColor.alpha * clampModelHighlightEdgeOpacity(edgeOpacity);

  return new Color(
    1 + (edgeColor.red - 1) * strength,
    1 + (edgeColor.green - 1) * strength,
    1 + (edgeColor.blue - 1) * strength,
    1
  );
};

const calculateTaperedSilhouetteSize = (
  edgeWidthPx: number,
  highlightOpacity: number
) =>
  normalizeModelHighlightEdgeWidthPx(edgeWidthPx) *
  Math.pow(
    clampModelHighlightOpacity(highlightOpacity, 0),
    MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT
  );

const readPrimitiveHighlightEdgeMode = (
  primitive: Model,
  fallback: ModelSelectionHighlightEdgeMode
): ModelSelectionHighlightEdgeMode => {
  const pickId = primitive.id as
    | { properties?: Record<string, unknown> }
    | undefined;
  const configuredMode =
    pickId?.properties?.[MODEL_SELECTION_HIGHLIGHT_EDGE_MODE_PROPERTY];
  return configuredMode === "silhouette" || configuredMode === "none"
    ? configuredMode
    : fallback;
};

type ModelWithReadyPromise = {
  readyPromise?: Promise<unknown>;
};

const getModelConfigCustomShader = (
  config: ModelConfig
): CustomShader | undefined =>
  config.model.customShader
    ? (config.model.customShader as CustomShader)
    : undefined;

const getModelConfigCustomShaderSignature = (
  config: ModelConfig
): string | null =>
  typeof config.model.renderStyleSignature === "string"
    ? config.model.renderStyleSignature
    : null;

type ModelSelectionHighlightState = {
  animationStartOpacity: number;
  animationStartTimestampMs: number | null;
  flashStartTimestampMs: number | null;
  isFlashActive: boolean;
  originalOutlineColor: Color;
  originalShowOutline: boolean;
  originalShader: CustomShader | undefined;
  originalSilhouetteColor: Color;
  originalSilhouetteSize: number;
  originalMinimumPixelSize: number;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
  usesIntegratedShader: boolean;
};

export const useCesiumModelManager = ({
  models,
  enabled,
  selection,
}: UseCesiumModelManagerOptions) => {
  const { getScene, requestRender } = useCesiumContext();
  const modelPrimitivesRef = useRef<Map<string, Model>>(new Map());
  const pendingModelLoadsRef = useRef<Map<string, Promise<Model>>>(new Map());
  const desiredModelKeysRef = useRef<Set<string>>(new Set());
  const modelsByKeyRef = useRef<Map<string, ModelConfig>>(new Map());
  const customShaderSignatureByPrimitiveRef = useRef<Map<Model, string | null>>(
    new Map()
  );
  const enabledRef = useRef<boolean>(enabled);
  const isUnmountedRef = useRef<boolean>(false);
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const hoveredPrimitiveRef = useRef<Model | null>(null);
  const selectionHighlightStateByPrimitiveRef = useRef<
    Map<Model, ModelSelectionHighlightState>
  >(new Map());
  const selectionHighlightAnimationFrameRef = useRef<number | null>(null);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const onSelectRef = useRef<((feature: unknown) => void) | undefined>(
    undefined
  );
  const onClearSelectionRef = useRef<(() => void) | undefined>(undefined);
  const onModelAddedRef = useRef<
    ((primitiveId: string, primitive: Model) => void) | undefined
  >(undefined);
  const onModelFirstRenderedRef = useRef<
    ((primitiveId: string, primitive: Model) => void) | undefined
  >(undefined);
  const selectedIdRef = useRef<string | null>(selection?.selectedId ?? null);
  const selectionEnabledRef = useRef<boolean>(
    Boolean(selection?.enabled && enabled)
  );
  const highlightFadeDurationMsRef = useRef<number>(
    normalizeModelSelectionHighlightFadeDuration(
      selection?.highlightFadeDurationMs
    )
  );
  const highlightFadeEasingRef = useRef<EasingFunction>(
    selection?.highlightFadeEasing ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING
  );
  const highlightEdgeColorRef = useRef<Color>(
    selection?.highlightEdgeColor ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR
  );
  const highlightEdgeOpacityRef = useRef<number>(
    clampModelHighlightEdgeOpacity(selection?.highlightEdgeOpacity)
  );
  const highlightEdgeWidthPxRef = useRef<number>(
    normalizeModelHighlightEdgeWidthPx(selection?.highlightEdgeWidthPx)
  );
  const highlightEdgeModeRef = useRef<ModelSelectionHighlightEdgeMode>(
    selection?.highlightEdgeMode ?? "silhouette"
  );
  const highlightMinimumPixelSizeRef = useRef<number>(
    normalizeModelSelectionHighlightMinimumPixelSize(
      selection?.highlightMinimumPixelSize
    )
  );

  useEffect(() => {
    onSelectRef.current = selection?.onSelect;
  }, [selection?.onSelect]);

  useEffect(() => {
    onClearSelectionRef.current = selection?.onClearSelection;
  }, [selection?.onClearSelection]);

  useEffect(() => {
    onModelAddedRef.current = selection?.onModelAdded;
  }, [selection?.onModelAdded]);

  useEffect(() => {
    onModelFirstRenderedRef.current = selection?.onModelFirstRendered;
  }, [selection?.onModelFirstRendered]);

  useEffect(() => {
    selectedIdRef.current = selection?.selectedId ?? null;
  }, [selection?.selectedId]);

  useEffect(() => {
    selectionEnabledRef.current = Boolean(selection?.enabled && enabled);
  }, [enabled, selection?.enabled]);

  useEffect(() => {
    highlightFadeDurationMsRef.current =
      normalizeModelSelectionHighlightFadeDuration(
        selection?.highlightFadeDurationMs
      );
  }, [selection?.highlightFadeDurationMs]);

  useEffect(() => {
    highlightFadeEasingRef.current =
      selection?.highlightFadeEasing ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING;
  }, [selection?.highlightFadeEasing]);

  useEffect(() => {
    highlightEdgeColorRef.current =
      selection?.highlightEdgeColor ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_COLOR;
  }, [selection?.highlightEdgeColor]);

  useEffect(() => {
    highlightEdgeOpacityRef.current = clampModelHighlightEdgeOpacity(
      selection?.highlightEdgeOpacity
    );
  }, [selection?.highlightEdgeOpacity]);

  useEffect(() => {
    highlightEdgeWidthPxRef.current = normalizeModelHighlightEdgeWidthPx(
      selection?.highlightEdgeWidthPx
    );
  }, [selection?.highlightEdgeWidthPx]);

  useEffect(() => {
    highlightEdgeModeRef.current = selection?.highlightEdgeMode ?? "silhouette";
  }, [selection?.highlightEdgeMode]);

  useEffect(() => {
    highlightMinimumPixelSizeRef.current =
      normalizeModelSelectionHighlightMinimumPixelSize(
        selection?.highlightMinimumPixelSize
      );
  }, [selection?.highlightMinimumPixelSize]);

  useEffect(() => {
    enabledRef.current = enabled;
    const nextModelsByKey = new Map(
      models.map((modelConfig) => [buildModelKey(modelConfig), modelConfig])
    );
    modelsByKeyRef.current = nextModelsByKey;
    desiredModelKeysRef.current = new Set(nextModelsByKey.keys());
  }, [enabled, models]);

  const readSelectionSilhouetteOptions = useCallback(
    () => ({
      edgeColor: highlightEdgeColorRef.current,
      edgeOpacity: highlightEdgeOpacityRef.current,
      edgeWidthPx: highlightEdgeWidthPxRef.current,
      minimumPixelSize: highlightMinimumPixelSizeRef.current,
    }),
    []
  );

  const setSelectionHighlightShaderUniforms = useCallback(
    (state: ModelSelectionHighlightState, color: Color, opacity: number) => {
      setModelHighlightShaderUniforms({
        color,
        opacity,
        shader: state.shader,
      });
    },
    []
  );

  const applySelectionMinimumPixelSize = useCallback(
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

  const applySelectionPresentation = useCallback(
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
        highlightEdgeModeRef.current
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
      applySelectionMinimumPixelSize(primitive, state, opacity);
    },
    [applySelectionMinimumPixelSize, readSelectionSilhouetteOptions]
  );

  useEffect(() => {
    if (selectionHighlightStateByPrimitiveRef.current.size === 0) {
      return;
    }

    selectionHighlightStateByPrimitiveRef.current.forEach(
      (state, primitive) => {
        setSelectionHighlightShaderUniforms(
          state,
          state.isFlashActive
            ? MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR
            : DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
          state.opacity
        );
        applySelectionPresentation(primitive, state, state.opacity);
      }
    );
    requestRender();
  }, [
    applySelectionPresentation,
    requestRender,
    selection?.highlightEdgeColor,
    selection?.highlightEdgeOpacity,
    selection?.highlightEdgeWidthPx,
    selection?.highlightMinimumPixelSize,
    setSelectionHighlightShaderUniforms,
  ]);

  const applyShader = useCallback(
    (primitive: Model, shader?: CustomShader) => {
      if (primitive.isDestroyed()) return;
      if (primitive.ready) {
        primitive.customShader = shader;
        requestRender();
        return;
      }
      const readyPromise = (primitive as ModelWithReadyPromise).readyPromise;
      if (!readyPromise) {
        primitive.customShader = shader;
        requestRender();
        return;
      }
      readyPromise
        .then(() => {
          if (!primitive.isDestroyed()) {
            primitive.customShader = shader;
            requestRender();
          }
        })
        .catch(() => undefined);
    },
    [requestRender]
  );

  const readOrCreateSelectionHighlightState = useCallback(
    (primitive: Model): ModelSelectionHighlightState => {
      const existing =
        selectionHighlightStateByPrimitiveRef.current.get(primitive);
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
        shader: usesIntegratedShader && originalShader
          ? originalShader
          : createModelSelectionHighlightShader({
              color: DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
              opacity: 0,
            }),
        targetOpacity: 0,
        usesIntegratedShader,
      };
      selectionHighlightStateByPrimitiveRef.current.set(primitive, state);
      return state;
    },
    []
  );

  const restoreSelectionHighlightShader = useCallback(
    (primitive: Model, state: ModelSelectionHighlightState) => {
      if (!primitive.isDestroyed()) {
        if (state.usesIntegratedShader) {
          setSelectionHighlightShaderUniforms(
            state,
            DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
            0
          );
          if (
            state.originalShader !== state.shader &&
            primitive.customShader === state.shader
          ) {
            applyShader(primitive, state.originalShader);
          }
        } else if (primitive.customShader === state.shader) {
          applyShader(primitive, state.originalShader);
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
      selectionHighlightStateByPrimitiveRef.current.delete(primitive);
      if (selectedPrimitiveRef.current === primitive) {
        selectedPrimitiveRef.current = null;
      }
      if (hoveredPrimitiveRef.current === primitive) {
        hoveredPrimitiveRef.current = null;
      }
    },
    [applyShader, requestRender]
  );

  const restoreSelectionHighlightShaders = useCallback(() => {
    if (hoverClearTimeoutRef.current !== null) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    if (selectionHighlightAnimationFrameRef.current !== null) {
      cancelAnimationFrame(selectionHighlightAnimationFrameRef.current);
      selectionHighlightAnimationFrameRef.current = null;
    }

    selectedPrimitiveRef.current = null;
    hoveredPrimitiveRef.current = null;
    Array.from(selectionHighlightStateByPrimitiveRef.current.entries()).forEach(
      ([primitive, state]) => restoreSelectionHighlightShader(primitive, state)
    );
  }, [restoreSelectionHighlightShader]);

  const animateSelectionHighlights = useCallback(
    (timestampMs: number) => {
      selectionHighlightAnimationFrameRef.current = null;
      const fadeDurationMs = highlightFadeDurationMsRef.current;
      const easing = highlightFadeEasingRef.current;
      let hasPendingAnimation = false;

      selectionHighlightStateByPrimitiveRef.current.forEach(
        (state, primitive) => {
          if (primitive.isDestroyed()) {
            selectionHighlightStateByPrimitiveRef.current.delete(primitive);
            return;
          }

          if (state.animationStartTimestampMs === null) {
            state.animationStartTimestampMs = timestampMs;
          }

          const linearProgress =
            fadeDurationMs === 0 ||
            state.animationStartOpacity === state.targetOpacity
              ? 1
              : clampEasedProgress(
                  (timestampMs - state.animationStartTimestampMs) /
                    fadeDurationMs
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

          setSelectionHighlightShaderUniforms(
            state,
            highlightColor,
            nextOpacity
          );
          applySelectionPresentation(primitive, state, nextOpacity);
          requestRender();

          if (linearProgress < 1) {
            hasPendingAnimation = true;
            return;
          }

          state.opacity = state.targetOpacity;
          state.animationStartOpacity = state.targetOpacity;
          state.animationStartTimestampMs = null;

          if (state.targetOpacity === 0) {
            restoreSelectionHighlightShader(primitive, state);
          }
        }
      );

      if (hasPendingAnimation) {
        selectionHighlightAnimationFrameRef.current = requestAnimationFrame(
          animateSelectionHighlights
        );
      }
    },
    [
      requestRender,
      applySelectionPresentation,
      restoreSelectionHighlightShader,
      setSelectionHighlightShaderUniforms,
    ]
  );

  const scheduleSelectionHighlightAnimation = useCallback(() => {
    if (selectionHighlightAnimationFrameRef.current !== null) {
      return;
    }
    selectionHighlightAnimationFrameRef.current = requestAnimationFrame(
      animateSelectionHighlights
    );
  }, [animateSelectionHighlights]);

  const setSelectionHighlightTarget = useCallback(
    (
      primitive: Model,
      targetOpacity: number,
      options: { flash?: boolean } = {}
    ) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const state = readOrCreateSelectionHighlightState(primitive);
      const nextTargetOpacity = clampModelHighlightOpacity(
        targetOpacity,
        DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY
      );

      if (primitive.customShader !== state.shader) {
        applyShader(primitive, state.shader);
      }

      if (options.flash && nextTargetOpacity > 0) {
        state.opacity = nextTargetOpacity;
        state.animationStartOpacity = nextTargetOpacity;
        state.animationStartTimestampMs = null;
        state.targetOpacity = nextTargetOpacity;
        state.isFlashActive = true;
        state.flashStartTimestampMs = null;
        setSelectionHighlightShaderUniforms(
          state,
          MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR,
          nextTargetOpacity
        );
        applySelectionPresentation(primitive, state, nextTargetOpacity);
        requestRender();
        scheduleSelectionHighlightAnimation();
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
      applySelectionPresentation(primitive, state, state.opacity);
      scheduleSelectionHighlightAnimation();
    },
    [
      applyShader,
      applySelectionPresentation,
      readOrCreateSelectionHighlightState,
      requestRender,
      scheduleSelectionHighlightAnimation,
      setSelectionHighlightShaderUniforms,
    ]
  );

  const refreshSelectionHighlightTarget = useCallback(
    (primitive: Model | null) => {
      if (!primitive || primitive.isDestroyed()) {
        return;
      }
      const isHighlighted =
        selectedPrimitiveRef.current === primitive ||
        hoveredPrimitiveRef.current === primitive;
      const state =
        selectionHighlightStateByPrimitiveRef.current.get(primitive);

      if (!isHighlighted && !state) {
        return;
      }

      setSelectionHighlightTarget(
        primitive,
        isHighlighted ? DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY : 0
      );
    },
    [setSelectionHighlightTarget]
  );

  const clearPreviousHighlight = useCallback(() => {
    const current = selectedPrimitiveRef.current;
    if (!current || current.isDestroyed()) {
      selectedPrimitiveRef.current = null;
      return;
    }
    selectedPrimitiveRef.current = null;
    refreshSelectionHighlightTarget(current);
  }, [refreshSelectionHighlightTarget]);

  const applyHighlight = useCallback(
    (primitive: Model): void => {
      if (primitive.isDestroyed()) return;
      selectedPrimitiveRef.current = primitive;
      setSelectionHighlightTarget(
        primitive,
        DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY,
        { flash: true }
      );
    },
    [setSelectionHighlightTarget]
  );

  useEffect(() => {
    const scene = getScene();
    if (!scene || scene.isDestroyed()) {
      return;
    }

    const desiredKeys = new Set(models.map(buildModelKey));
    const primitivesByKey = modelPrimitivesRef.current;
    primitivesByKey.forEach((primitive, key) => {
      if (enabled && desiredKeys.has(key)) return;
      const primitiveId = getPrimitiveSelectionId(primitive);
      console.debug("[ADHOC|MODEL] removing primitive from scene", {
        key,
        primitiveId,
        reason: enabled ? "no-longer-desired" : "manager-disabled",
      });
      try {
        if (selectedPrimitiveRef.current === primitive) {
          selectedPrimitiveRef.current = null;
          if (enabled) {
            onClearSelectionRef.current?.();
          }
        }
        if (hoveredPrimitiveRef.current === primitive) {
          hoveredPrimitiveRef.current = null;
        }
        const highlightState =
          selectionHighlightStateByPrimitiveRef.current.get(primitive);
        if (highlightState) {
          restoreSelectionHighlightShader(primitive, highlightState);
        }
        customShaderSignatureByPrimitiveRef.current.delete(primitive);
        scene.primitives.remove(primitive);
        if (!primitive.isDestroyed()) {
          primitive.destroy();
        }
        console.debug("[ADHOC|MODEL] primitive removed", {
          key,
          primitiveId,
        });
      } catch (cleanupError) {
        console.warn(
          "[Cesium|Models] Failed to cleanup model primitive:",
          cleanupError
        );
      }
      primitivesByKey.delete(key);
    });

    if (!enabled || models.length === 0) {
      requestRender();
      return;
    }

    let cancelled = false;

    const addModels = async () => {
      for (const modelConfig of models) {
        if (cancelled) break;

        const key = buildModelKey(modelConfig);
        const existing = modelPrimitivesRef.current.get(key);
        if (existing && !existing.isDestroyed()) {
          continue;
        }

        const pendingLoad = pendingModelLoadsRef.current.get(key);
        if (pendingLoad) {
          continue;
        }

        const loadPromise = createModelPrimitiveFromConfig(modelConfig);
        pendingModelLoadsRef.current.set(key, loadPromise);

        try {
          const modelPrimitive = await loadPromise;
          if (pendingModelLoadsRef.current.get(key) === loadPromise) {
            pendingModelLoadsRef.current.delete(key);
          }

          const existingAfterLoad = modelPrimitivesRef.current.get(key);
          if (existingAfterLoad && !existingAfterLoad.isDestroyed()) {
            if (!modelPrimitive.isDestroyed()) {
              modelPrimitive.destroy();
            }
            continue;
          }

          const attachScene = getScene();
          const shouldAttach =
            !isUnmountedRef.current &&
            enabledRef.current &&
            desiredModelKeysRef.current.has(key) &&
            !!attachScene &&
            !attachScene.isDestroyed();
          if (!shouldAttach) {
            if (!modelPrimitive.isDestroyed()) {
              modelPrimitive.destroy();
            }
            continue;
          }

          const modelPrimitiveId = getPrimitiveSelectionId(modelPrimitive);
          const latestModelConfig = modelsByKeyRef.current.get(key);
          const latestCustomShader = latestModelConfig
            ? getModelConfigCustomShader(latestModelConfig)
            : getModelConfigCustomShader(modelConfig);
          const latestCustomShaderSignature = latestModelConfig
            ? getModelConfigCustomShaderSignature(latestModelConfig)
            : getModelConfigCustomShaderSignature(modelConfig);
          if (modelPrimitive.customShader !== latestCustomShader) {
            modelPrimitive.customShader = latestCustomShader;
          }
          customShaderSignatureByPrimitiveRef.current.set(
            modelPrimitive,
            latestCustomShaderSignature
          );
          console.debug("[ADHOC|MODEL] primitive created", {
            key,
            primitiveId: modelPrimitiveId,
            ready: modelPrimitive.ready,
          });
          attachScene.primitives.add(modelPrimitive);
          modelPrimitivesRef.current.set(key, modelPrimitive);

          console.debug("[ADHOC|MODEL] primitive added to scene", {
            key,
            primitiveId: modelPrimitiveId,
            ready: modelPrimitive.ready,
            selectedId: selectedIdRef.current,
          });
          if (modelPrimitiveId) {
            onModelAddedRef.current?.(modelPrimitiveId, modelPrimitive);
          }

          if (modelPrimitiveId) {
            let emittedFirstRender = false;
            const removePostRenderListener =
              attachScene.postRender.addEventListener(() => {
                if (emittedFirstRender || modelPrimitive.isDestroyed()) {
                  removePostRenderListener();
                  return;
                }
                if (!modelPrimitive.ready) {
                  return;
                }
                emittedFirstRender = true;
                console.debug("[ADHOC|MODEL] primitive first rendered", {
                  key,
                  primitiveId: modelPrimitiveId,
                });
                onModelFirstRenderedRef.current?.(
                  modelPrimitiveId,
                  modelPrimitive
                );
                removePostRenderListener();
              });
          }

          const selectedId = selectedIdRef.current;
          if (selectionEnabledRef.current && selectedId) {
            if (modelPrimitiveId === selectedId) {
              console.debug("[ADHOC|MODEL] applying selected highlight", {
                key,
                selectedId,
              });
              clearPreviousHighlight();
              applyHighlight(modelPrimitive);
            }
          }

          requestRender();
        } catch (error) {
          if (pendingModelLoadsRef.current.get(key) === loadPromise) {
            pendingModelLoadsRef.current.delete(key);
          }
          console.warn("[Cesium|Models] Model load failure:", error);
        }
      }
    };

    void addModels();

    return () => {
      cancelled = true;
    };
  }, [
    applyHighlight,
    clearPreviousHighlight,
    enabled,
    getScene,
    models,
    requestRender,
    restoreSelectionHighlightShader,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    for (const modelConfig of models) {
      const primitive = modelPrimitivesRef.current.get(
        buildModelKey(modelConfig)
      );
      if (!primitive || primitive.isDestroyed()) {
        continue;
      }

      const customShader = getModelConfigCustomShader(modelConfig);
      const customShaderSignature =
        getModelConfigCustomShaderSignature(modelConfig);
      const previousCustomShaderSignature =
        customShaderSignatureByPrimitiveRef.current.get(primitive) ?? null;
      if (previousCustomShaderSignature === customShaderSignature) {
        continue;
      }

      const highlightState =
        selectionHighlightStateByPrimitiveRef.current.get(primitive);
      if (highlightState) {
        highlightState.originalShader = customShader;
        customShaderSignatureByPrimitiveRef.current.set(
          primitive,
          customShaderSignature
        );
        requestRender();
        continue;
      }
      if (primitive.customShader !== customShader) {
        applyShader(primitive, customShader);
      } else {
        requestRender();
      }
      customShaderSignatureByPrimitiveRef.current.set(
        primitive,
        customShaderSignature
      );
    }
  }, [applyShader, enabled, models, requestRender]);

  useEffect(() => {
    const primitivesByKey = modelPrimitivesRef.current;
    const pendingLoads = pendingModelLoadsRef.current;
    return () => {
      isUnmountedRef.current = true;
      if (hoverClearTimeoutRef.current !== null) {
        clearTimeout(hoverClearTimeoutRef.current);
        hoverClearTimeoutRef.current = null;
      }
      if (selectionHighlightAnimationFrameRef.current !== null) {
        cancelAnimationFrame(selectionHighlightAnimationFrameRef.current);
        selectionHighlightAnimationFrameRef.current = null;
      }
      pendingLoads.clear();
      const scene = getScene();
      selectedPrimitiveRef.current = null;
      hoveredPrimitiveRef.current = null;
      if (!scene || scene.isDestroyed()) return;
      primitivesByKey.forEach((primitive) => {
        try {
          scene.primitives.remove(primitive);
          if (!primitive.isDestroyed()) {
            primitive.destroy();
          }
        } catch (cleanupError) {
          console.warn(
            "[Cesium|Models] Failed to cleanup model primitive:",
            cleanupError
          );
        }
      });
      primitivesByKey.clear();
      customShaderSignatureByPrimitiveRef.current.clear();
      selectionHighlightStateByPrimitiveRef.current.clear();
    };
  }, [getScene]);

  useEffect(() => {
    const selectionEnabled = !!selection?.enabled && enabled;
    if (!selectionEnabled) {
      return;
    }

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachSelectionHandler = () => {
      if (disposed) return;

      const scene = getScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachSelectionHandler, 100);
        return;
      }

      const { canvas } = scene;
      handler = new ScreenSpaceEventHandler(canvas);

      const deselect = () => {
        clearPreviousHighlight();
        onClearSelectionRef.current?.();
      };

      const applyHoverHighlight = (primitive: Model | null): void => {
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
            refreshSelectionHighlightTarget(hovered);
          }, DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS);
          return;
        }

        const current = hoveredPrimitiveRef.current;
        if (current === primitive) {
          return;
        }

        hoveredPrimitiveRef.current = primitive;
        refreshSelectionHighlightTarget(current);
        refreshSelectionHighlightTarget(primitive);
      };

      const findPickedModel = (position: Cartesian2 | undefined) => {
        if (!position) {
          return null;
        }
        const picked = scene.pick(position, 1, 1);
        return isModelPick(picked) ? picked : null;
      };

      const handleLeftClick = ({
        position,
      }: ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = findPickedModel(position);
        if (picked) {
          clearPreviousHighlight();
          applyHighlight(picked.primitive as Model);
          const pickId = picked.id as { id?: string } | undefined;
          const id = pickId?.id ?? undefined;
          onSelectRef.current?.({
            id,
            properties: extractPickedProperties(picked),
            is3dModel: true,
          });
          return;
        }
        if (selection?.deselectOnEmptyClick ?? true) deselect();
      };

      const handleMouseMove = (event: { endPosition?: Cartesian2 }) => {
        const position = event.endPosition;
        const picked = position ? findPickedModel(position) : null;
        applyHoverHighlight((picked?.primitive as Model | undefined) ?? null);
      };

      handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction(handleMouseMove, ScreenSpaceEventType.MOUSE_MOVE);
    };

    attachSelectionHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (hoverClearTimeoutRef.current !== null) {
        clearTimeout(hoverClearTimeoutRef.current);
        hoverClearTimeoutRef.current = null;
      }
      try {
        restoreSelectionHighlightShaders();
        handler?.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
        handler?.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
        handler?.destroy();
      } catch (error) {
        console.warn("[Cesium|Models] Selection cleanup failed:", error);
      }
    };
  }, [
    applyHighlight,
    clearPreviousHighlight,
    enabled,
    getScene,
    refreshSelectionHighlightTarget,
    requestRender,
    restoreSelectionHighlightShaders,
    selection?.enabled,
    selection?.deselectOnEmptyClick,
  ]);

  useEffect(() => {
    const selectionEnabled = Boolean(selection?.enabled && enabled);
    if (!selectionEnabled) {
      restoreSelectionHighlightShaders();
      return;
    }

    const selectedId = selection?.selectedId ?? null;
    if (!selectedId) {
      if (selectedPrimitiveRef.current) {
        clearPreviousHighlight();
      }
      return;
    }

    let matchingPrimitive: Model | null = null;
    modelPrimitivesRef.current.forEach((primitive) => {
      if (primitive.isDestroyed()) return;
      if (getPrimitiveSelectionId(primitive) === selectedId) {
        matchingPrimitive = primitive;
      }
    });

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
    refreshSelectionHighlightTarget,
    restoreSelectionHighlightShaders,
    selection?.enabled,
    selection?.selectedId,
  ]);
};
