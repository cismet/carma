import { ClassificationType, Color } from "cesium";

import type { CesiumContextType } from "../CesiumContext";
import { getGroundPrimitiveById } from "./cesiumGroundPrimitives";
import { SceneStyle } from "../..";
import { fromColorRgbaArray } from "./cesiumSerializer";

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
  async () => {
    ctx.withScene((scene) => {
      scene.globe.baseColor =
        fromColorRgbaArray(style?.globe?.baseColor) ?? Color.LIGHTGREY;
      scene.backgroundColor =
        fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

      console.debug("[STYLES|TERRAIN|CESIUM] setup primary style");

      // use terrain provider not the surface provider to prevent camera jitter on move
      waitAndSetTerrainProvider(ctx, {
        label: "secondary",
        //onReady: addImageryLayer,
      });

      // Defer hide to postRender to avoid toggling during tile processing
      ctx.withScene((scene) => {
        const hideOnce = () => {
          ctx.withImageryLayer((imageryLayer) => {
            if (!imageryLayer.isDestroyed()) {
              imageryLayer.show = false;
            } else {
              console.debug("[STYLES|IMAGERY] skip hide; layer destroyed");
            }
          });
          scene.postRender.removeEventListener(hideOnce);
        };
        scene.postRender.addEventListener(hideOnce);
      });

      ctx.withScene((scene) => {
        const invertedSelection = getGroundPrimitiveById(
          scene,
          INVERTED_SELECTED_POLYGON_ID
        );
        if (invertedSelection) {
          invertedSelection.classificationType =
            ClassificationType.CESIUM_3D_TILE;
        }
      });
    });
    ctx.requestRender();
  };
};

export const setupSecondaryStyle = (
  ctx: CesiumContextType,
  style?: Partial<SceneStyle>
) => {
  ctx.withScene((scene) => {
    scene.globe.baseColor =
      fromColorRgbaArray(style?.globe?.baseColor) ?? Color.WHITE;
    scene.backgroundColor =
      fromColorRgbaArray(style?.backgroundColor) ?? new Color(0, 0, 0, 0);

    const addImageryLayer = () => {
      // Defer add/show to postRender to avoid mutating collection mid-frame
      ctx.withScene((scene) => {
        const addOnce = () => {
          ctx.withImageryLayer((imageryLayer, viewer) => {
            if (imageryLayer.isDestroyed()) {
              console.debug("[STYLES|IMAGERY] skip add/show; layer destroyed");
              return;
            }
            const layers = viewer.imageryLayers;
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
            viewer.scene.requestRender();
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
