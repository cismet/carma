import { useEffect, type MutableRefObject } from "react";
import type { ImageryLayer, CesiumTerrainProvider, Scene } from "cesium";
import { Model, Cartesian3, HeadingPitchRoll, Transforms } from "cesium";
import type { ModelConfig } from "@carma/types";

import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  type ProviderConfig,
} from "../../../utils/cesiumProviders";
import { tryWithValidScene } from "../../../utils/instanceGates";

/**
 * Loads the imagery provider configuration
 */
export const useImageryProviderLoader = ({
  providerConfig,
  imageryLayerRef,
}: {
  providerConfig: ProviderConfig | undefined;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
}) => {
  useEffect(() => {
    if (providerConfig?.imageryProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumImageryLayer(
        imageryLayerRef,
        providerConfig.imageryProvider,
        signal
      );

      return () => {
        abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig, imageryLayerRef]);
};

/**
 * Adds imagery layer to scene when loaded
 */
export const useImageryLayer = ({
  sceneRef,
  imageryLayerRef,
}: {
  sceneRef: MutableRefObject<Scene | null>;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
}) => {
  useEffect(() => {
    if (!sceneRef.current || !imageryLayerRef.current) {
      return;
    }

    const scene = sceneRef.current;
    const imageryLayer = imageryLayerRef.current;

    // Check if layer is already in the collection
    let alreadyAdded = false;
    for (let i = 0; i < scene.imageryLayers.length; i++) {
      if (scene.imageryLayers.get(i) === imageryLayer) {
        alreadyAdded = true;
        break;
      }
    }

    if (!alreadyAdded && !imageryLayer.isDestroyed()) {
      console.debug("[CESIUM|CONTEXT] Adding imagery layer to scene");
      scene.imageryLayers.add(imageryLayer);
      // Start hidden - will be shown by secondary style
      imageryLayer.show = false;
    }
  }, [sceneRef, imageryLayerRef]);
};

/**
 * Loads terrain provider
 */
export const useTerrainProviderLoader = ({
  providerConfig,
  terrainProviderRef,
}: {
  providerConfig: ProviderConfig | undefined;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
}) => {
  useEffect(() => {
    if (!providerConfig) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    loadCesiumTerrainProvider(
      terrainProviderRef,
      providerConfig.terrainProvider.url,
      signal
    );

    return () => abortController.abort();
  }, [providerConfig, terrainProviderRef]);
};

/**
 * Loads surface provider
 */
export const useSurfaceProviderLoader = ({
  providerConfig,
  surfaceProviderRef,
}: {
  providerConfig: ProviderConfig | undefined;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
}) => {
  useEffect(() => {
    if (providerConfig?.surfaceProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumTerrainProvider(
        surfaceProviderRef,
        providerConfig.surfaceProvider.url,
        signal
      );

      return () => abortController.abort();
    }
  }, [providerConfig, surfaceProviderRef]);
};

/**
 * Loads models from config
 */
export const useModelsLoader = ({
  models,
  sceneRef,
}: {
  models?: ModelConfig[];
  sceneRef: MutableRefObject<Scene | null>;
}) => {
  useEffect(() => {
    if (!models || models.length === 0) return;

    const scene = sceneRef.current;
    if (!scene) return;

    const loadedModels: Model[] = [];

    const loadModels = async () => {
      for (const modelConfig of models) {
        try {
          console.debug(
            "[CESIUM|MODEL] Loading model from:",
            modelConfig.model.uri
          );

          const position = Cartesian3.fromDegrees(
            modelConfig.position.longitude,
            modelConfig.position.latitude,
            modelConfig.position.altitude
          );

          const hpr = HeadingPitchRoll.fromDegrees(
            modelConfig.orientation?.heading ?? 0,
            modelConfig.orientation?.pitch ?? 0,
            modelConfig.orientation?.roll ?? 0
          );

          const modelMatrix = Transforms.headingPitchRollToFixedFrame(
            position,
            hpr
          );

          const model = await Model.fromGltfAsync({
            url: modelConfig.model.uri as string,
            modelMatrix,
          });

          if (modelConfig.model.scale !== undefined) {
            model.scale =
              typeof modelConfig.model.scale === "number"
                ? modelConfig.model.scale
                : 1.0;
          }
          if (modelConfig.model.show !== undefined) {
            model.show =
              typeof modelConfig.model.show === "boolean"
                ? modelConfig.model.show
                : true;
          }

          tryWithValidScene(scene, () => {
            scene.primitives.add(model);
            loadedModels.push(model);
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

      tryWithValidScene(currentScene, (scene) => {
        loadedModels.forEach((model) => {
          if (!model.isDestroyed()) {
            scene.primitives.remove(model);
          }
        });
      });
    };
  }, [models, sceneRef]);
};
