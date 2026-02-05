import { useCallback, useEffect, useRef } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CustomShader,
  Model,
  Scene,
} from "@carma/cesium";
import type { ModelConfig } from "@carma-commons/resources";
import {
  createModelPrimitiveFromConfig,
  DEFAULT_MODEL_HIGHLIGHT_SHADER,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";

interface UseCesiumModelsOptions {
  models: ModelConfig[];
  enabled: boolean;
  selection?: {
    enabled?: boolean;
    onSelect?: (feature: unknown | null) => void;
    deselectOnEmptyClick?: boolean;
    highlightShader?: CustomShader;
    selectedId?: string | null;
  };
}

// Manage Cesium 3D model primitives with optional selection/highlighting
export const useCesiumModels = ({
  models,
  enabled,
  selection,
}: UseCesiumModelsOptions) => {
  const { getScene, requestRender } = useCesiumContext();
  const modelPrimitivesRef = useRef<Map<string, Model>>(new Map());
  type DrillPickResult = ReturnType<Scene["drillPick"]>;
  type PickedObject = DrillPickResult[0];
  const selectedPrimitiveRef = useRef<Model | null>(null);
  const originalShaderRef = useRef<CustomShader | undefined>(undefined);
  const onSelectRef = useRef<((feature: unknown | null) => void) | undefined>(
    undefined
  );
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
    selectedIdRef.current = selection?.selectedId ?? null;
  }, [selection?.selectedId]);

  useEffect(() => {
    selectionEnabledRef.current = Boolean(selection?.enabled && enabled);
  }, [enabled, selection?.enabled]);

  useEffect(() => {
    highlightShaderRef.current =
      selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER;
  }, [selection?.highlightShader]);

  const getPrimitiveSelectionId = (primitive: Model): string | null => {
    const pickId = primitive.id as { id?: unknown } | undefined;
    return typeof pickId?.id === "string" ? pickId.id : null;
  };

  const applyShader = useCallback((primitive: Model, shader?: CustomShader) => {
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
  }, [requestRender]);

  const clearPreviousHighlight = useCallback(() => {
    const current = selectedPrimitiveRef.current;
    if (!current || current.isDestroyed()) {
      selectedPrimitiveRef.current = null;
      originalShaderRef.current = undefined;
      return;
    }
    applyShader(current, originalShaderRef.current ?? undefined);
  }, [applyShader]);

  const applyHighlight = useCallback((
    primitive: Model,
    shader: CustomShader
  ): void => {
    if (primitive.isDestroyed()) return;
    originalShaderRef.current = primitive.customShader ?? undefined;
    applyShader(primitive, shader);
  }, [applyShader]);

  const buildModelKey = (config: ModelConfig): string => {
    const model = config.model;
    const position = config.position;
    const orientation = config.orientation ?? {};
    return JSON.stringify({
      uri: model.uri,
      scale: typeof model.scale === "number" ? model.scale : null,
      position: {
        longitude: position.longitude,
        latitude: position.latitude,
        altitude: position.altitude,
      },
      orientation: {
        heading: orientation.heading ?? null,
        pitch: orientation.pitch ?? null,
        roll: orientation.roll ?? null,
      },
      name: typeof config.name === "string" ? config.name : null,
      title:
        typeof config.properties?.title === "string"
          ? config.properties.title
          : null,
    });
  };

  useEffect(() => {
    const scene = getScene();
    if (!scene || scene.isDestroyed()) {
      return;
    }

    const desiredKeys = new Set(models.map(buildModelKey));
    const primitivesByKey = modelPrimitivesRef.current;
    primitivesByKey.forEach((primitive, key) => {
      if (enabled && desiredKeys.has(key)) return;
      try {
        if (selectedPrimitiveRef.current === primitive) {
          selectedPrimitiveRef.current = null;
          originalShaderRef.current = undefined;
          onSelectRef.current?.(null);
        }
        scene.primitives.remove(primitive);
        if (!primitive.isDestroyed()) {
          primitive.destroy();
        }
      } catch (cleanupError) {
        console.warn("[Cesium|Models] Failed to cleanup model primitive:", cleanupError);
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
        const key = buildModelKey(modelConfig);
        const existing = modelPrimitivesRef.current.get(key);
        if (existing && !existing.isDestroyed()) {
          continue;
        }
        try {
          const modelPrimitive = await createModelPrimitiveFromConfig(
            modelConfig
          );
          if (cancelled || scene.isDestroyed()) {
            if (!modelPrimitive.isDestroyed()) {
              modelPrimitive.destroy();
            }
            return;
          }
          scene.primitives.add(modelPrimitive);
          modelPrimitivesRef.current.set(key, modelPrimitive);

          const selectedId = selectedIdRef.current;
          if (selectionEnabledRef.current && selectedId) {
            const modelSelectionId = getPrimitiveSelectionId(modelPrimitive);
            if (modelSelectionId === selectedId) {
              clearPreviousHighlight();
              applyHighlight(modelPrimitive, highlightShaderRef.current);
              selectedPrimitiveRef.current = modelPrimitive;
            }
          }

          requestRender();
        } catch (error) {
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
    return () => {
      const scene = getScene();
      selectedPrimitiveRef.current = null;
      originalShaderRef.current = undefined;
      onSelectRef.current?.(null);
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
    const scene = getScene();
    if (!selectionEnabled || !scene || scene.isDestroyed() || !scene.canvas) {
      return;
    }
    const { canvas } = scene;
    const handler = new ScreenSpaceEventHandler(canvas);

    const highlightShader = highlightShaderRef.current;

    const isModelPick = (
      obj: PickedObject | undefined | null
    ): obj is PickedObject & { primitive: Model } => {
      const candidate = obj as { primitive?: unknown } | null | undefined;
      return (
        candidate?.primitive instanceof Model &&
        !candidate.primitive.isDestroyed()
      );
    };

    const applyHighlightFromClick = (primitive: Model): void => {
      applyHighlight(primitive, highlightShader);
    };

    const extractProperties = (
      picked: PickedObject
    ): Record<string, unknown> => {
      const pickId = picked?.id as { properties?: Record<string, unknown> };
      const entityProperties = pickId?.properties;
      const extracted: Record<string, unknown> = {};
      if (entityProperties) {
        Object.entries(entityProperties).forEach(([key, value]) => {
          extracted[key] = value;
        });
      }
      return extracted;
    };

    const deselect = () => {
      clearPreviousHighlight();
      selectedPrimitiveRef.current = null;
      originalShaderRef.current = undefined;
      onSelectRef.current?.(null);
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
            properties: extractProperties(picked),
            is3dModel: true,
          });
          selectedPrimitiveRef.current = picked.primitive as Model;
          return;
        }
      }
      if (selection?.deselectOnEmptyClick ?? true) deselect();
    };

    handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      try {
        clearPreviousHighlight();
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
        onSelectRef.current?.(null);
        handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
        handler.destroy();
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
