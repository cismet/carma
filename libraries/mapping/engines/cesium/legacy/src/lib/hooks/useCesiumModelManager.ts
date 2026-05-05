import { useCallback, useEffect, useRef } from "react";

import type { ModelConfig } from "@carma-mapping/engines/cesium/core";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CustomShader,
  Model,
  type Cartesian2,
} from "@carma-cesium";

import { createModelPrimitiveFromConfig } from "../utils/createModelPrimitiveFromConfig";
import {
  clampModelHighlightOpacity,
  createModelSelectionHighlightShader,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY,
  setModelHighlightShaderUniforms,
} from "../utils/modelHighlightShader";
import {
  buildModelKey,
  extractPickedProperties,
  getPrimitiveSelectionId,
  isModelPick,
} from "../utils/modelManager";
import { useCesiumContext } from "./useCesiumContext";
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
    highlightFadeDurationMs?: number;
    highlightFadeEasing?: EasingFunction;
    highlightShader?: CustomShader;
    selectedId?: string | null;
  };
}

const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS = 500;
const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING = Easing.CUBIC_OUT;

const normalizeModelSelectionHighlightFadeDuration = (
  fadeDurationMs: number | undefined
) =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS;

const clampEasedProgress = (progress: number) =>
  Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;

type ModelWithReadyPromise = {
  readyPromise?: Promise<unknown>;
};

type ModelSelectionHighlightState = {
  animationStartOpacity: number;
  animationStartTimestampMs: number | null;
  isAnimated: boolean;
  originalShader: CustomShader | undefined;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
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
  const enabledRef = useRef<boolean>(enabled);
  const isUnmountedRef = useRef<boolean>(false);
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const hoveredPrimitiveRef = useRef<Model | null>(null);
  const selectionHighlightStateByPrimitiveRef = useRef<
    Map<Model, ModelSelectionHighlightState>
  >(new Map());
  const selectionHighlightAnimationFrameRef = useRef<number | null>(null);
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
  const highlightShaderRef = useRef<CustomShader | undefined>(
    selection?.highlightShader
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
    highlightShaderRef.current = selection?.highlightShader;
  }, [selection?.highlightShader]);

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
    enabledRef.current = enabled;
    desiredModelKeysRef.current = new Set(models.map(buildModelKey));
  }, [enabled, models]);

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

      const customHighlightShader = highlightShaderRef.current;
      const state = {
        animationStartOpacity: customHighlightShader ? 1 : 0,
        animationStartTimestampMs: null,
        isAnimated: !customHighlightShader,
        originalShader: primitive.customShader ?? undefined,
        opacity: customHighlightShader ? 1 : 0,
        shader:
          customHighlightShader ??
          createModelSelectionHighlightShader({
            color: DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
            opacity: 0,
          }),
        targetOpacity: customHighlightShader ? 1 : 0,
      };
      selectionHighlightStateByPrimitiveRef.current.set(primitive, state);
      return state;
    },
    []
  );

  const restoreSelectionHighlightShader = useCallback(
    (primitive: Model, state: ModelSelectionHighlightState) => {
      if (!primitive.isDestroyed() && primitive.customShader === state.shader) {
        applyShader(primitive, state.originalShader);
      }
      selectionHighlightStateByPrimitiveRef.current.delete(primitive);
      if (selectedPrimitiveRef.current === primitive) {
        selectedPrimitiveRef.current = null;
      }
      if (hoveredPrimitiveRef.current === primitive) {
        hoveredPrimitiveRef.current = null;
      }
    },
    [applyShader]
  );

  const restoreSelectionHighlightShaders = useCallback(() => {
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

          if (!state.isAnimated) {
            return;
          }

          if (state.animationStartTimestampMs === null) {
            state.animationStartTimestampMs = timestampMs;
          }

          const linearProgress =
            fadeDurationMs === 0
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
          setModelHighlightShaderUniforms({
            color: DEFAULT_MODEL_SELECTION_HIGHLIGHT_COLOR,
            opacity: nextOpacity,
            shader: state.shader,
          });
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
    [requestRender, restoreSelectionHighlightShader]
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
    (primitive: Model, targetOpacity: number) => {
      if (primitive.isDestroyed()) {
        return;
      }

      const state = readOrCreateSelectionHighlightState(primitive);
      const nextTargetOpacity = clampModelHighlightOpacity(
        targetOpacity,
        DEFAULT_MODEL_SELECTION_HIGHLIGHT_OPACITY
      );

      if (!state.isAnimated) {
        if (nextTargetOpacity > 0) {
          applyShader(primitive, state.shader);
        } else {
          restoreSelectionHighlightShader(primitive, state);
        }
        return;
      }

      if (primitive.customShader !== state.shader) {
        applyShader(primitive, state.shader);
      }

      if (
        state.targetOpacity === nextTargetOpacity &&
        state.opacity === nextTargetOpacity
      ) {
        return;
      }

      state.animationStartOpacity = state.opacity;
      state.animationStartTimestampMs = null;
      state.targetOpacity = nextTargetOpacity;
      scheduleSelectionHighlightAnimation();
    },
    [
      applyShader,
      readOrCreateSelectionHighlightState,
      restoreSelectionHighlightShader,
      scheduleSelectionHighlightAnimation,
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
      refreshSelectionHighlightTarget(primitive);
    },
    [refreshSelectionHighlightTarget]
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
    const primitivesByKey = modelPrimitivesRef.current;
    const pendingLoads = pendingModelLoadsRef.current;
    return () => {
      isUnmountedRef.current = true;
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
        const picks = scene.drillPick(position, 5);
        for (let i = 0; i < picks.length; i++) {
          const picked = picks[i];
          if (isModelPick(picked)) {
            return picked;
          }
        }
        return null;
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
