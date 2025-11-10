import {
  ClassificationType,
  Color,
  colorFromConstructorArgs,
} from "@carma/cesium";

import type { CesiumContextType } from "../CesiumContext";
import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { SceneStyle } from "../..";

// TODO have configurable setup functions for primary and secondary styles
// TODO MOVE THE ID into viewer config/state
const INVERTED_SELECTED_POLYGON_ID = "searchgaz-inverted-polygon";

const waitAndSetTerrainProvider = (
  ctx: CesiumContextType,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;
    const hasProvider = ctx.withTerrainProvider((terrainProvider, viewer) => {
      console.debug(
        "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
        performance.now() - startTime,
        "ms",
        label
      );
      viewer.scene.terrainProvider = terrainProvider;
      isTerrainProviderSet = true;
      onReady?.();
    });
    if (!hasProvider) {
      requestAnimationFrame(checkTerrainProvider);
    }
  };

  const isSet = ctx.withTerrainProvider((terrainProvider, viewer) => {
    viewer.scene.terrainProvider = terrainProvider;
    isTerrainProviderSet = true;
    onReady?.();
    console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
  });
  if (!isSet) {
    checkTerrainProvider();
  }
};

export const setupPrimaryStyle = (
  ctx: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  ctx.withScene((scene) => {
    if (scene.globe) {
      scene.globe.baseColor =
        colorFromConstructorArgs(style?.globe?.baseColor) ?? Color.LIGHTGREY;
    }
    scene.backgroundColor =
      colorFromConstructorArgs(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

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
  waitAndSetTerrainProvider(ctx, {
    label: "primary",
  });

  // If an imagery layer exists and is present in the collection, hide it for primary style
  ctx.withImageryLayer((imageryLayer, scene) => {
    const layers = scene.imageryLayers;
    let present = false;
    for (let i = 0; i < layers.length; i++) {
      if (layers.get(i) === imageryLayer) {
        present = true;
        break;
      }
    }
    if (present) {
      imageryLayer.show = false;
    }
  });

  ctx.requestRender();
};

export const setupSecondaryStyle = (
  ctx: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  ctx.withScene((scene) => {
    if (scene.globe) {
      scene.globe.baseColor =
        colorFromConstructorArgs(style?.globe?.baseColor) ?? Color.WHITE;
    }
    scene.backgroundColor =
      colorFromConstructorArgs(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    const addImageryLayer = () => {
      // Defer add/show to postRender to avoid mutating collection mid-frame
      ctx.withScene((scene) => {
        const addOnce = () => {
          ctx.withImageryLayer((imageryLayer, scene) => {
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

    waitAndSetTerrainProvider(ctx, {
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
    ctx.requestRender();
  });
};
