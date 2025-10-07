import { ClassificationType, Color } from "cesium";

import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { SceneStyle } from "../..";
import { fromColorRgbaArray } from "./cesiumSerializer";
import { RequestRenderFn } from "../CesiumContextProvider";
import { SceneCallback } from "../hooks/useValidInstances";
import {
  ImageryLayerCallback,
  WithCallback,
  TerrainProviderCallback,
} from "../hooks/useValidInstances";

// TODO have configurable setup functions for primary and secondary styles
// TODO MOVE THE ID into viewer config/state
const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const waitAndSetTerrainProvider = (
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;
    withTerrainProvider((terrainProvider, { scene }) => {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      scene.terrainProvider = terrainProvider;
      isTerrainProviderSet = true;
      onReady?.();
    });
    if (!isTerrainProviderSet) {
      requestAnimationFrame(checkTerrainProvider);
    }
  };

  withTerrainProvider((terrainProvider, { scene }) => {
    scene.terrainProvider = terrainProvider;
    isTerrainProviderSet = true;
    onReady?.();
    console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
  });
  if (!isTerrainProviderSet) {
    checkTerrainProvider();
  }
};

export const setupPrimaryStyle = (
  withScene: WithCallback<SceneCallback>,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  withImageryLayer: WithCallback<ImageryLayerCallback>,
  requestRender: RequestRenderFn,
  style?: Partial<SceneStyle>
) => {
  withScene((scene) => {
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
  });

  // ensure the correct terrain provider is set (not the surface provider)
  waitAndSetTerrainProvider(withTerrainProvider, {
    label: "primary",
  });

  // If an imagery layer exists and is present in the collection, hide it for primary style
  withImageryLayer((imageryLayer, { scene }) => {
    if (imageryLayer.isDestroyed()) return;
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

  requestRender();
};

export const setupSecondaryStyle = (
  withScene: WithCallback<SceneCallback>,
  withTerrainProvider: WithCallback<TerrainProviderCallback>,
  withImageryLayer: WithCallback<ImageryLayerCallback>,
  requestRender: RequestRenderFn,
  style?: Partial<SceneStyle>
) => {
  withScene((scene) => {
    scene.globe.baseColor =
      fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
    scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    const addImageryLayer = () => {
      // Defer add/show to postRender to avoid mutating collection mid-frame
      withScene((scene) => {
        const addOnce = () => {
          withImageryLayer((imageryLayer) => {
            if (imageryLayer.isDestroyed()) {
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
          scene.postRender.removeEventListener(addOnce);
        };
        scene.postRender.addEventListener(addOnce);
      });
    };

    waitAndSetTerrainProvider(withTerrainProvider, {
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
    requestRender();
  });
};
