import { useEffect, useRef } from "react";
import {
  Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CustomShader,
  Scene,
} from "cesium";
import {
  ModelConfig,
  createModelEntityConstructorOptions,
} from "@carma-commons/resources";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { DEFAULT_MODEL_HIGHLIGHT_SHADER } from "../utils/cesiumShaders";

type PrimitiveLike = { isCesium3DTileset?: boolean };
type WithPrimitive = { primitive?: PrimitiveLike };

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

// Manage Cesium 3D model entities with optional selection/highlighting
export const useCesiumModels = ({
  models,
  enabled,
  selection,
}: UseCesiumModelsOptions) => {
  const { viewerRef, isValidViewer, isViewerReady, requestRender } =
    useCesiumContext();
  const modelEntitiesRef = useRef<Entity[]>([]);
  const modelsLoadedRef = useRef(false);
  type DrillPickResult = ReturnType<Scene["drillPick"]>;
  type PickedObject = DrillPickResult[0];
  const selectedEntityRef = useRef<PickedObject | null>(null);
  const originalShaderRef = useRef<CustomShader | undefined>(undefined);
  const onSelectRef = useRef<((feature: unknown | null) => void) | undefined>(
    undefined
  );

  useEffect(() => {
    onSelectRef.current = selection?.onSelect;
  }, [selection?.onSelect]);

  useEffect(() => {
    const v = viewerRef.current;
    if (
      !enabled ||
      !isValidViewer() ||
      !isViewerReady ||
      models.length === 0 ||
      !v
    )
      return;

    // Prevent re-adding models if already loaded
    if (modelsLoadedRef.current && modelEntitiesRef.current.length > 0) {
      return;
    }

    const loadedEntities: Entity[] = [];

    try {
      models.forEach((modelConfig) => {
        const modelConstructorOptions =
          createModelEntityConstructorOptions(modelConfig);
        const modelEntity = new Entity(modelConstructorOptions);
        v.entities.add(modelEntity);
        loadedEntities.push(modelEntity);
      });

      modelEntitiesRef.current = loadedEntities;
      modelsLoadedRef.current = true;
      requestRender();
    } catch (error) {
      console.warn("[Cesium|Models] Model load failure:", error);
      loadedEntities.forEach((entity) => {
        try {
          v.entities.remove(entity);
        } catch (cleanupError) {
          console.warn(
            "[Cesium|Models] Failed to cleanup model entity:",
            cleanupError
          );
        }
      });
    }

    return () => {
      if (modelEntitiesRef.current.length > 0 && v && !v.isDestroyed()) {
        try {
          modelEntitiesRef.current.forEach((entity) => {
            v.entities.remove(entity);
          });
          modelEntitiesRef.current = [];
          modelsLoadedRef.current = false;
        } catch (error) {
          console.warn("[Cesium|Models] Cleanup failed:", error);
        }
      }
    };
  }, [enabled, models, viewerRef, isValidViewer, isViewerReady, requestRender]);

  useEffect(() => {
    const v = viewerRef.current;
    const selectionEnabled = !!selection?.enabled && enabled;
    if (!selectionEnabled || !isValidViewer() || !v || !v.scene || !v.canvas)
      return;

    const { scene, canvas } = v;
    const handler = new ScreenSpaceEventHandler(canvas);

    const highlightShader =
      selection?.highlightShader ?? DEFAULT_MODEL_HIGHLIGHT_SHADER;

    const isModelPick = (
      obj: PickedObject | undefined | null
    ): obj is PickedObject => {
      const candidate = obj as unknown as WithPrimitive | null | undefined;
      return !!(
        candidate &&
        candidate.primitive &&
        !candidate.primitive.isCesium3DTileset
      );
    };

    const clearPreviousHighlight = () => {
      if (selectedEntityRef.current?.id?.model) {
        selectedEntityRef.current.id.model.customShader =
          originalShaderRef.current ?? undefined;
        requestRender();
      }
    };

    const applyHighlight = (entity: PickedObject): void => {
      if (!entity.id?.model) return;
      originalShaderRef.current = entity.id.model.customShader ?? undefined;
      if (highlightShader) entity.id.model.customShader = highlightShader;
      requestRender();
    };

    const extractProperties = (
      entity: PickedObject
    ): Record<string, unknown> => {
      const entityProperties = entity.id?.properties;
      const extracted: Record<string, unknown> = {};
      if (entityProperties) {
        const propertyNames = entityProperties.propertyNames || [];
        propertyNames.forEach((name: string) => {
          const property = entityProperties[name];
          extracted[name] = property?.getValue ? property.getValue() : property;
        });
      }
      return extracted;
    };

    const deselect = () => {
      clearPreviousHighlight();
      selectedEntityRef.current = null;
      originalShaderRef.current = undefined;
      onSelectRef.current?.(null);
    };

    const handleLeftClick = ({
      position,
    }: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!position || !isValidViewer()) return;
      const entities = scene.drillPick(position, 5);
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (isModelPick(entity)) {
          clearPreviousHighlight();
          applyHighlight(entity);
          const id = (entity.id as Entity).id;
          onSelectRef.current?.({
            id,
            properties: extractProperties(entity),
            is3dModel: true,
          });
          selectedEntityRef.current = entity;
          return;
        }
      }
      if (selection?.deselectOnEmptyClick ?? true) deselect();
    };

    handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      try {
        if (selectedEntityRef.current?.id?.model) {
          selectedEntityRef.current.id.model.customShader =
            originalShaderRef.current ?? undefined;
          requestRender();
        }
        selectedEntityRef.current = null;
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
    viewerRef,
    isValidViewer,
    requestRender,
    selection?.enabled,
    selection?.deselectOnEmptyClick,
    selection?.highlightShader,
  ]);
};
