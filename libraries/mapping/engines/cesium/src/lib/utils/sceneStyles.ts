import { ClassificationType, Color, Scene } from "cesium";

import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { isValidScene, SceneStyle } from "../..";
import { fromColorRgbaArray } from "./cesiumSerializer";
import { SCENE_STYLES } from "../constants";
import {
  WithCallback,
  TerrainProviderCallback,
} from "../hooks/useValidInstances";
import { sceneRequestRender } from "./sceneRequestRender";
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
  const hideAllImageryLayers = () => {
    if (!isValidScene(scene)) return;

    for (let i = 0; i < scene.imageryLayers.length; i++) {
      const layer = scene.imageryLayers.get(i);
      if (layer && !layer.isDestroyed() && layer.show) {
        layer.show = false;
        console.debug("[STYLES|IMAGERY|CESIUM] hide imagery layer", i);
      }
    }
  };

  const ensureImageryHidden = () => {
    const ensureOnce = () => {
      if (!isValidScene(scene)) return;
      hideAllImageryLayers();
      scene.requestRender();
      scene.postRender.removeEventListener(ensureOnce);
    };
    if (!isValidScene(scene)) return;
    scene.postRender.addEventListener(ensureOnce);
  };

  waitAndSetTerrainProvider(scene, withTerrainProvider, {
    label: SCENE_STYLES.PRIMARY,
    onReady: ensureImageryHidden,
  });

  hideAllImageryLayers();
  sceneRequestRender(scene);
};

export const setupSecondaryStyle = (
  scene: Scene,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  style?: Partial<SceneStyle>
) => {
  if (!isValidScene(scene)) return;

  scene.globe.baseColor =
    fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
  scene.backgroundColor =
    fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

  const ensureImageryLayersVisible = () => {
    // Defer to postRender to avoid mutating collection mid-frame
    const ensureOnce = () => {
      if (!isValidScene(scene)) return;

      // Show all existing imagery layers
      for (let i = 0; i < scene.imageryLayers.length; i++) {
        const layer = scene.imageryLayers.get(i);
        if (layer && !layer.isDestroyed()) {
          layer.show = true;
          console.debug(
            "[STYLES|IMAGERY|CESIUM] show imagery layer",
            i,
            scene.imageryLayers.length
          );
        }
      }

      scene.requestRender();
      scene.postRender.removeEventListener(ensureOnce);
    };
    if (!isValidScene(scene)) return;
    scene.postRender.addEventListener(ensureOnce);
  };

  waitAndSetTerrainProvider(scene, withTerrainProvider, {
    label: SCENE_STYLES.SECONDARY,
    onReady: ensureImageryLayersVisible,
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
