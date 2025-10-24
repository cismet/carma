import { useEffect, useRef, type MutableRefObject } from "react";
import { Model, Scene, tryWithValidScene } from "@carma/cesium";
import type { ModelConfig } from "@carma/cesium/types";
import { loadModelPrimitive } from "../../loaders/models";

export const useModelsLoader = ({
  models,
  sceneRef,
}: {
  models?: ModelConfig[];
  sceneRef: MutableRefObject<Scene | null>;
}) => {
  const loadedModelsRef = useRef<Model[]>([]);

  useEffect(() => {
    if (!models || models.length === 0) return;

    const scene = sceneRef.current;
    if (!scene) return;

    const loadModels = async () => {
      for (const modelConfig of models) {
        try {
          console.debug(
            "[CESIUM|MODEL] Loading model from:",
            modelConfig.model.uri
          );

          const model = (await loadModelPrimitive(modelConfig)) as Model;

          tryWithValidScene(scene, () => {
            scene.primitives.add(model);
            loadedModelsRef.current.push(model);
            console.debug(
              "[CESIUM|MODEL] Model primitive added to scene:",
              modelConfig.model.uri
            );
          });
        } catch (error) {
          console.error(
            "[CESIUM|MODEL] Failed to load model:",
            modelConfig.model.uri,
            error
          );
        }
      }
    };

    loadModels();

    return () => {
      const currentScene = sceneRef.current;
      if (!currentScene) return;

      tryWithValidScene(currentScene, (scene: Scene) => {
        loadedModelsRef.current.forEach((model) => {
          if (!model.isDestroyed()) {
            scene.primitives.remove(model);
          }
        });
      });
      loadedModelsRef.current = [];
    };
  }, [models, sceneRef]);
};
