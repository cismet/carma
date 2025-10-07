import { ClassificationType, Color, Scene } from "cesium";

import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { isValidScene, SceneStyle } from "../..";
import { fromColorRgbaArray } from "./cesiumSerializer";
import {
  ImageryLayerCallback,
  WithCallback,
  SceneCallback,
  TerrainProviderCallback,
} from "../hooks/useValidInstances";
import { sceneRequestRender } from "./sceneRequestRender";
import { MutableRefObject } from "react";
import { tryWithValidScene } from "./instanceGates";

// TODO have configurable setup functions for primary and secondary styles
// TODO MOVE THE ID into viewer config/state
const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const waitAndSetTerrainProvider = (
  scene: Scene,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;
    withTerrainProvider((terrainProvider) => {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      tryWithValidScene(scene, () => {
        scene.terrainProvider = terrainProvider;
        isTerrainProviderSet = true;
        onReady?.();
      });
    });
    if (!isTerrainProviderSet) {
      requestAnimationFrame(checkTerrainProvider);
    }
  };

  withTerrainProvider((terrainProvider) => {
    tryWithValidScene(scene, () => {
      scene.terrainProvider = terrainProvider;
      isTerrainProviderSet = true;
      onReady?.();
      console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
    });
  });
  if (!isTerrainProviderSet) {
    checkTerrainProvider();
  }
};

export const setupPrimaryStyle = (
  scene: Scene,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  withImageryLayer: WithCallback<ImageryLayerCallback>,
  style?: Partial<SceneStyle>
) => {
  if (!isValidScene(scene)) return;
  scene.globe.baseColor =
    fromColorRgbaArray(style?.globe?.baseColor) ?? Color.LIGHTGREY;
  scene.backgroundColor =
    fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

  console.debug("[STYLES|TERRAIN|CESIUM] setup primary style");

  const invertedSelection = getGroundPrimitiveById(
    scene,
    INVERTED_SELECTED_POLYGON_ID
  );
  if (invertedSelection) {
    invertedSelection.classificationType = ClassificationType.CESIUM_3D_TILE;
  }

  // ensure the correct terrain provider is set (not the surface provider)
  waitAndSetTerrainProvider(scene, withTerrainProvider, {
    label: "primary",
  });

  // If an imagery layer exists and is present in the collection, hide it for primary style
  withImageryLayer((imageryLayer) => {
    if (imageryLayer.isDestroyed() || !isValidScene(scene)) return;
    const layers = scene.imageryLayers;
    let present = false;
    for (let i = 0; i < layers.length; i++) {
      if (layers.get(i) === imageryLayer) {
        present = true;
        break;
      }
    }
    if (present) {
      console.debug("[STYLES|IMAGERY|CESIUM] hide imagery layer");
      imageryLayer.show = false;
    }
  });
  sceneRequestRender(scene);
};

export const setupSecondaryStyle = (
  scene: Scene,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  withImageryLayer: WithCallback<ImageryLayerCallback>,
  style?: Partial<SceneStyle>
) => {
  if (!isValidScene(scene)) return;

  scene.globe.baseColor =
    fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
  scene.backgroundColor =
    fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

  const addImageryLayer = () => {
    // Defer add/show to postRender to avoid mutating collection mid-frame
    const addOnce = () => {
      withImageryLayer((imageryLayer) => {
        if (imageryLayer.isDestroyed() || !isValidScene(scene)) {
          console.debug("[STYLES|IMAGERY] skip add/show; layer destroyed");
          return;
        }
        const layers = scene.imageryLayers;
        let alreadyAdded = false;
        for (let i = 0; i < layers.length; i++) {
          if (layers.get(i) === imageryLayer) {
            alreadyAdded = true;
            break;
          }
        }
        if (!alreadyAdded) {
          layers.add(imageryLayer);
          console.debug(
            "Secondary Style Setup: add imagery layer",
            layers.length
          );
        }
        imageryLayer.show = true;
        scene.requestRender();
      });
      if (!isValidScene(scene)) return;
      scene.postRender.removeEventListener(addOnce);
    };
    if (!isValidScene(scene)) return;
    scene.postRender.addEventListener(addOnce);
  };

  waitAndSetTerrainProvider(scene, withTerrainProvider, {
    label: "secondary",
    onReady: addImageryLayer,
  });

  const invertedSelection = getGroundPrimitiveById(
    scene,
    INVERTED_SELECTED_POLYGON_ID
  );
  if (invertedSelection) {
    invertedSelection.classificationType = ClassificationType.BOTH;
  }
  sceneRequestRender(scene);
};
