import { type MutableRefObject, useEffect, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import type { ModelConfig } from "@carma-mapping/engines/cesium/core";
import { Model, type Scene } from "@carma-cesium";

import { createModelPrimitiveFromConfig } from "../utils/createModelPrimitiveFromConfig";
import {
  applyModelCustomShader,
  applyModelConfigRenderStylePresentation,
  buildModelKey,
  getModelConfigCustomShader,
  getModelConfigCustomShaderSignature,
  getModelConfigRenderStylePresentation,
  getModelConfigRenderStylePresentationSignature,
  getPrimitiveSelectionId,
} from "../utils/modelManager";
import type { CesiumModelShaderController } from "./useCesiumModelSelectionHighlight";
import { useCesiumModelStylePresentationAnimator } from "./useCesiumModelStylePresentationAnimator";

type UseCesiumModelPrimitivesOptions = {
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  modelPrimitivesRef: MutableRefObject<Map<string, Model>>;
  models: ModelConfig[];
  onClearSelection?: () => void;
  onModelAdded?: (primitiveId: string, primitive: Model) => void;
  onModelFirstRendered?: (primitiveId: string, primitive: Model) => void;
  requestRender: () => void;
  selectedId?: string | null;
  selectionEnabled: boolean;
  stylePresentationFadeDurationMs?: number;
  stylePresentationFadeEasing?: EasingFunction;
  selectionHighlight: Pick<
    CesiumModelShaderController,
    | "applyHighlight"
    | "clearPreviousHighlight"
    | "clearRuntimeState"
    | "isSelectedPrimitive"
    | "restorePrimitiveHighlight"
    | "setPrimitiveOriginalPresentationIfHighlighted"
    | "setPrimitiveOriginalShaderIfHighlighted"
  >;
};

export const useCesiumModelPrimitives = ({
  enabled,
  getScene,
  modelPrimitivesRef,
  models,
  onClearSelection,
  onModelAdded,
  onModelFirstRendered,
  requestRender,
  selectedId,
  selectionEnabled,
  stylePresentationFadeDurationMs,
  stylePresentationFadeEasing,
  selectionHighlight,
}: UseCesiumModelPrimitivesOptions) => {
  const pendingModelLoadsRef = useRef<Map<string, Promise<Model>>>(new Map());
  const desiredModelKeysRef = useRef<Set<string>>(new Set());
  const modelsByKeyRef = useRef<Map<string, ModelConfig>>(new Map());
  const customShaderSignatureByPrimitiveRef = useRef<Map<Model, string | null>>(
    new Map()
  );
  const presentationSignatureByPrimitiveRef = useRef<Map<Model, string | null>>(
    new Map()
  );
  const enabledRef = useRef<boolean>(enabled);
  const isUnmountedRef = useRef<boolean>(false);
  const selectedIdRef = useRef<string | null>(selectedId ?? null);
  const selectionEnabledRef = useRef<boolean>(selectionEnabled);
  const onClearSelectionRef = useRef<(() => void) | undefined>(
    onClearSelection
  );
  const onModelAddedRef = useRef<
    ((primitiveId: string, primitive: Model) => void) | undefined
  >(onModelAdded);
  const onModelFirstRenderedRef = useRef<
    ((primitiveId: string, primitive: Model) => void) | undefined
  >(onModelFirstRendered);

  useEffect(() => {
    selectedIdRef.current = selectedId ?? null;
  }, [selectedId]);

  useEffect(() => {
    selectionEnabledRef.current = selectionEnabled;
  }, [selectionEnabled]);

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  useEffect(() => {
    onModelAddedRef.current = onModelAdded;
  }, [onModelAdded]);

  useEffect(() => {
    onModelFirstRenderedRef.current = onModelFirstRendered;
  }, [onModelFirstRendered]);

  useEffect(() => {
    enabledRef.current = enabled;
    const nextModelsByKey = new Map(
      models.map((modelConfig) => [buildModelKey(modelConfig), modelConfig])
    );
    modelsByKeyRef.current = nextModelsByKey;
    desiredModelKeysRef.current = new Set(nextModelsByKey.keys());
  }, [enabled, models]);

  const {
    applyHighlight,
    clearPreviousHighlight,
    clearRuntimeState,
    isSelectedPrimitive,
    restorePrimitiveHighlight,
    setPrimitiveOriginalPresentationIfHighlighted,
    setPrimitiveOriginalShaderIfHighlighted,
  } = selectionHighlight;
  const {
    animateStylePresentation,
    cancelStylePresentationAnimation,
    clearStylePresentationAnimations,
  } = useCesiumModelStylePresentationAnimator({
    fadeDurationMs: stylePresentationFadeDurationMs,
    fadeEasing: stylePresentationFadeEasing,
    isAnimationSuppressed: isSelectedPrimitive,
    requestRender,
  });

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
        if (isSelectedPrimitive(primitive) && enabled) {
          onClearSelectionRef.current?.();
        }
        restorePrimitiveHighlight(primitive);
        customShaderSignatureByPrimitiveRef.current.delete(primitive);
        presentationSignatureByPrimitiveRef.current.delete(primitive);
        cancelStylePresentationAnimation(primitive);
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
          const latestPresentationSignature = latestModelConfig
            ? getModelConfigRenderStylePresentationSignature(latestModelConfig)
            : getModelConfigRenderStylePresentationSignature(modelConfig);
          if (modelPrimitive.customShader !== latestCustomShader) {
            modelPrimitive.customShader = latestCustomShader;
          }
          applyModelConfigRenderStylePresentation(
            modelPrimitive,
            latestModelConfig ?? modelConfig
          );
          customShaderSignatureByPrimitiveRef.current.set(
            modelPrimitive,
            latestCustomShaderSignature
          );
          presentationSignatureByPrimitiveRef.current.set(
            modelPrimitive,
            latestPresentationSignature
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

          const nextSelectedId = selectedIdRef.current;
          if (selectionEnabledRef.current && nextSelectedId) {
            if (modelPrimitiveId === nextSelectedId) {
              console.debug("[ADHOC|MODEL] applying selected highlight", {
                key,
                selectedId: nextSelectedId,
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
    cancelStylePresentationAnimation,
    clearPreviousHighlight,
    enabled,
    getScene,
    isSelectedPrimitive,
    modelPrimitivesRef,
    models,
    requestRender,
    restorePrimitiveHighlight,
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
      const presentationSignature =
        getModelConfigRenderStylePresentationSignature(modelConfig);
      const presentation = getModelConfigRenderStylePresentation(modelConfig);
      const previousCustomShaderSignature =
        customShaderSignatureByPrimitiveRef.current.get(primitive) ?? null;
      const previousPresentationSignature =
        presentationSignatureByPrimitiveRef.current.get(primitive) ?? null;
      const shouldUpdateShader =
        previousCustomShaderSignature !== customShaderSignature ||
        primitive.customShader !== customShader;
      const shouldUpdatePresentation =
        previousPresentationSignature !== presentationSignature;
      if (!shouldUpdateShader && !shouldUpdatePresentation) {
        continue;
      }

      const hasHighlightedShaderState = shouldUpdateShader
        ? setPrimitiveOriginalShaderIfHighlighted(primitive, customShader)
        : false;
      const hasHighlightedPresentationState =
        shouldUpdatePresentation && presentation
          ? setPrimitiveOriginalPresentationIfHighlighted(primitive, {
              silhouetteColor: presentation.outlineColor,
              silhouetteSize: presentation.outlineWidthPx,
            })
          : false;
      const isHighlighted =
        hasHighlightedShaderState || hasHighlightedPresentationState;
      if (isHighlighted) {
        cancelStylePresentationAnimation(primitive);
        customShaderSignatureByPrimitiveRef.current.set(
          primitive,
          customShaderSignature
        );
        presentationSignatureByPrimitiveRef.current.set(
          primitive,
          presentationSignature
        );
        requestRender();
        continue;
      }
      if (shouldUpdatePresentation) {
        if (presentation) {
          animateStylePresentation(primitive, presentation);
        }
      }
      if (shouldUpdateShader) {
        applyModelCustomShader(primitive, customShader, requestRender);
      } else {
        requestRender();
      }
      customShaderSignatureByPrimitiveRef.current.set(
        primitive,
        customShaderSignature
      );
      presentationSignatureByPrimitiveRef.current.set(
        primitive,
        presentationSignature
      );
    }
  }, [
    enabled,
    modelPrimitivesRef,
    models,
    requestRender,
    animateStylePresentation,
    cancelStylePresentationAnimation,
    setPrimitiveOriginalPresentationIfHighlighted,
    setPrimitiveOriginalShaderIfHighlighted,
  ]);

  useEffect(() => {
    const primitivesByKey = modelPrimitivesRef.current;
    const pendingLoads = pendingModelLoadsRef.current;
    return () => {
      isUnmountedRef.current = true;
      pendingLoads.clear();
      const scene = getScene();
      clearRuntimeState();
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
      presentationSignatureByPrimitiveRef.current.clear();
      clearStylePresentationAnimations();
    };
  }, [
    clearRuntimeState,
    clearStylePresentationAnimations,
    getScene,
    modelPrimitivesRef,
  ]);
};
