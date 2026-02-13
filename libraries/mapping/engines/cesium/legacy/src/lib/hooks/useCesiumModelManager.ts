import { useCallback, useEffect, useRef } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CustomShader,
  Model,
} from "@carma/cesium";
import type { ModelConfig } from "@carma-commons/resources";

import { DEFAULT_MODEL_HIGHLIGHT_SHADER } from "../utils/modelHighlightShader";
import { createModelPrimitiveFromConfig } from "../utils/createModelPrimitiveFromConfig";
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
    highlightShader?: CustomShader;
    selectedId?: string | null;
  };
}

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
  const originalShaderRef = useRef<CustomShader | undefined>(undefined);
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
  const highlightShaderRef = useRef<CustomShader>(
    selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER
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
    highlightShaderRef.current =
      selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER;
  }, [selection?.highlightShader]);

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
      const readyPromise = (
        primitive as unknown as { readyPromise?: Promise<unknown> }
      ).readyPromise;
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

  const clearPreviousHighlight = useCallback(() => {
    const current = selectedPrimitiveRef.current;
    if (!current || current.isDestroyed()) {
      selectedPrimitiveRef.current = null;
      originalShaderRef.current = undefined;
      return;
    }
    applyShader(current, originalShaderRef.current ?? undefined);
  }, [applyShader]);

  const applyHighlight = useCallback(
    (primitive: Model, shader: CustomShader): void => {
      if (primitive.isDestroyed()) return;
      originalShaderRef.current = primitive.customShader ?? undefined;
      applyShader(primitive, shader);
    },
    [applyShader]
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
          originalShaderRef.current = undefined;
          if (enabled) {
            onClearSelectionRef.current?.();
          }
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
              applyHighlight(modelPrimitive, highlightShaderRef.current);
              selectedPrimitiveRef.current = modelPrimitive;
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
  ]);

  useEffect(() => {
    const primitivesByKey = modelPrimitivesRef.current;
    const pendingLoads = pendingModelLoadsRef.current;
    return () => {
      isUnmountedRef.current = true;
      pendingLoads.clear();
      const scene = getScene();
      selectedPrimitiveRef.current = null;
      originalShaderRef.current = undefined;
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

      const highlightShader = highlightShaderRef.current;

      const applyHighlightFromClick = (primitive: Model): void => {
        applyHighlight(primitive, highlightShader);
      };

      const deselect = () => {
        clearPreviousHighlight();
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
        onClearSelectionRef.current?.();
      };

      const handleLeftClick = ({
        position,
      }: ScreenSpaceEventHandler.PositionedEvent) => {
        if (!position) return;
        const picks = scene.drillPick(position, 5);
        for (let i = 0; i < picks.length; i++) {
          const picked = picks[i];
          if (isModelPick(picked)) {
            clearPreviousHighlight();
            applyHighlightFromClick(picked.primitive as Model);
            const pickId = picked.id as { id?: string } | undefined;
            const id = pickId?.id ?? undefined;
            onSelectRef.current?.({
              id,
              properties: extractPickedProperties(picked),
              is3dModel: true,
            });
            selectedPrimitiveRef.current = picked.primitive as Model;
            return;
          }
        }
        if (selection?.deselectOnEmptyClick ?? true) deselect();
      };

      handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);
    };

    attachSelectionHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      try {
        clearPreviousHighlight();
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
        handler?.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
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
    requestRender,
    selection?.enabled,
    selection?.deselectOnEmptyClick,
    selection?.highlightShader,
  ]);

  useEffect(() => {
    const selectionEnabled = Boolean(selection?.enabled && enabled);
    if (!selectionEnabled) {
      if (selectedPrimitiveRef.current) {
        clearPreviousHighlight();
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
      }
      return;
    }

    const selectedId = selection?.selectedId ?? null;
    if (!selectedId) {
      if (selectedPrimitiveRef.current) {
        clearPreviousHighlight();
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
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
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
      }
      return;
    }

    if (selectedPrimitiveRef.current === matchingPrimitive) return;

    clearPreviousHighlight();
    applyHighlight(
      matchingPrimitive,
      selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER
    );
    selectedPrimitiveRef.current = matchingPrimitive;
  }, [
    applyHighlight,
    clearPreviousHighlight,
    enabled,
    selection?.enabled,
    selection?.highlightShader,
    selection?.selectedId,
  ]);
};
