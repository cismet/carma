import { useEffect, useRef } from "react";
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
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import { DEFAULT_MODEL_HIGHLIGHT_SHADER } from "@carma-mapping/engines/cesium";

interface UseCesiumModelsOptions {
  models: ModelConfig[];
  enabled: boolean;
  selection?: {
    enabled?: boolean;
    onSelect?: (feature: unknown | null) => void;
    deselectOnEmptyClick?: boolean;
    highlightShader?: CustomShader;
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

  useEffect(() => {
    onSelectRef.current = selection?.onSelect;
  }, [selection?.onSelect]);

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
    if (!enabled || models.length === 0 || !scene || scene.isDestroyed()) {
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
  }, [enabled, models, getScene, requestRender]);

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

    const highlightShader =
      selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER;

    const applyShader = (primitive: Model, shader?: CustomShader) => {
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
    };

    const isModelPick = (
      obj: PickedObject | undefined | null
    ): obj is PickedObject & { primitive: Model } => {
      const candidate = obj as { primitive?: unknown } | null | undefined;
      return (
        candidate?.primitive instanceof Model &&
        !candidate.primitive.isDestroyed()
      );
    };

    const clearPreviousHighlight = () => {
      const current = selectedPrimitiveRef.current;
      if (!current || current.isDestroyed()) {
        selectedPrimitiveRef.current = null;
        originalShaderRef.current = undefined;
        return;
      }
      applyShader(current, originalShaderRef.current ?? undefined);
    };

    const applyHighlight = (primitive: Model): void => {
      if (primitive.isDestroyed()) return;
      originalShaderRef.current = primitive.customShader ?? undefined;
      applyShader(primitive, highlightShader);
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
          applyHighlight(picked.primitive as Model);
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
    enabled,
    getScene,
    requestRender,
    selection?.enabled,
    selection?.deselectOnEmptyClick,
    selection?.highlightShader,
  ]);
};
