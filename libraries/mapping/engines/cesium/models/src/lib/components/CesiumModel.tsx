import { useEffect, useRef } from "react";
import {
  useCesiumContext,
  loadModelPrimitive,
  type ModelConfig,
} from "@carma-mapping/engines/cesium/core";
import type { Model } from "@carma/cesium";
import { tryWithValidScene } from "@carma/cesium";

export interface CesiumModelProps {
  config: ModelConfig;
  visible?: boolean;
  enabled?: boolean;
}

export const CesiumModel: React.FC<CesiumModelProps> = ({
  config,
  visible = true,
  enabled = true,
}) => {
  const { sceneRef } = useCesiumContext();
  const modelRef = useRef<Model | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !enabled) return;

    let mounted = true;

    const loadModel = async () => {
      try {
        console.debug("[CESIUM|MODEL] Loading model:", config.model.uri);

        const model = await loadModelPrimitive(config);

        if (!mounted) {
          if (!model.isDestroyed()) {
            model.destroy();
          }
          return;
        }

        tryWithValidScene(scene, () => {
          scene.primitives.add(model);
          modelRef.current = model;
          model.show = visible;
          console.debug(
            "[CESIUM|MODEL] Model added to scene:",
            config.model.uri
          );
        });
      } catch (error) {
        console.error(
          "[CESIUM|MODEL] Failed to load model:",
          config.model.uri,
          error
        );
      }
    };

    loadModel();

    return () => {
      mounted = false;
      const currentScene = sceneRef.current;
      if (currentScene && modelRef.current) {
        tryWithValidScene(currentScene, (scene) => {
          if (modelRef.current && !modelRef.current.isDestroyed()) {
            scene.primitives.remove(modelRef.current);
          }
        });
      }
      modelRef.current = null;
    };
  }, [config, enabled, sceneRef]);

  useEffect(() => {
    if (modelRef.current && !modelRef.current.isDestroyed()) {
      modelRef.current.show = visible;
      sceneRef.current?.requestRender();
    }
  }, [visible, sceneRef]);

  return null;
};
