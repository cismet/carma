import { useEffect, useRef } from "react";
import { Entity } from "cesium";
import {
  ModelConfig,
  createModelEntityConstructorOptions,
} from "@carma-commons/resources";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

interface UseCesiumModelsOptions {
  models: ModelConfig[];
  enabled: boolean;
}

/**
 * Hook for managing Cesium 3D model entities
 *
 * This hook handles loading, managing, and cleanup of 3D models in Cesium.
 * It automatically adds models to the viewer when enabled and removes them
 * when the component unmounts or when models change.
 *
 * @param options - Configuration options for the models hook
 * @param options.models - Array of model configurations to load
 * @param options.enabled - Whether to enable model loading
 */
export const useCesiumModels = ({
  models,
  enabled,
}: UseCesiumModelsOptions) => {
  const { viewerRef, isViewerReady } = useCesiumContext();
  const modelEntitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!enabled || !viewer || !isViewerReady || models.length === 0) return;

    const loadedEntities: Entity[] = [];

    try {
      models.forEach((modelConfig) => {
        const modelConstructorOptions =
          createModelEntityConstructorOptions(modelConfig);
        const modelEntity = new Entity(modelConstructorOptions);
        viewer.entities.add(modelEntity);
        loadedEntities.push(modelEntity);
      });

      modelEntitiesRef.current = loadedEntities;
      viewer.scene.requestRender();
      console.log(
        `[Cesium|Models] Successfully loaded ${loadedEntities.length} models`
      );
    } catch (error) {
      console.error("[Cesium|Models] Failed to add models:", error);

      loadedEntities.forEach((entity) => {
        try {
          viewer.entities.remove(entity);
        } catch (cleanupError) {
          console.error("Failed to cleanup model entity:", cleanupError);
        }
      });
    }

    return () => {
      if (
        modelEntitiesRef.current.length > 0 &&
        viewer &&
        !viewer.isDestroyed()
      ) {
        try {
          modelEntitiesRef.current.forEach((entity) => {
            viewer.entities.remove(entity);
          });
          modelEntitiesRef.current = [];
        } catch (error) {
          console.error("Failed to remove models:", error);
        }
      }
    };
  }, [enabled, viewerRef, isViewerReady, models]);
};
