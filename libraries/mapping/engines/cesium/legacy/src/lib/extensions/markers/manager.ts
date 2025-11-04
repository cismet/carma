import type { Cartographic, Model } from "cesium";

import type { MarkerPrimitiveData, MarkerModelAsset, PolylineConfig } from ".";
import type { CesiumContextType } from "../../CesiumContext";

import { attachListeners, detachListeners } from "./listeners";
import { buildMarkerData } from "./data";

const addMarkerModelToScene = (
  ctx: CesiumContextType,
  markerData: MarkerPrimitiveData
) => {
  const { model, id } = markerData;

  if (!model) {
    console.warn("[CESIUM|MARKER] missing marker model", id);
    return false;
  }

  if (model.isDestroyed()) {
    console.warn("[CESIUM|MARKER] marker model is destroyed", id);
    return false;
  }

  ctx.withScene((scene) => {
    scene.primitives.add(model);
  });

  return true;
};

export const addCesiumMarker = async (
  ctx: CesiumContextType,
  pos: Cartographic,
  groundPos: Cartographic,
  modelConfig: MarkerModelAsset,
  options: {
    model?: Model | null;
    id?: string;
    stemline?: PolylineConfig;
  } = {}
) => {
  console.debug("[CESIUM|SCENE] addMarker", pos, modelConfig);

  const markerData = await buildMarkerData({
    ctx,
    pos,
    groundPos,
    modelConfig,
    options,
  });

  if (!addMarkerModelToScene(ctx, markerData)) {
    return undefined;
  }

  attachListeners(ctx, markerData);

  markerData.cleanup = () => {
    console.debug("[CESIUM|MARKER] cleaning up listeners for", markerData.id);
    detachListeners(ctx, markerData);
  };

  return markerData;
};

export const removeCesiumMarker = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData | null | undefined
) => {
  console.debug(
    "[CESIUM|MARKER] removing marker primitive from scene",
    data?.model,
    data
  );
  if (data) {
    // remove listeners before removing the primitives
    // so no updates are triggered after the primitive is removed
    data.cleanup && data.cleanup();
    ctx.withScene(async (scene) => {
      try {
        data.model &&
          !data.model.isDestroyed() &&
          !scene.primitives.isDestroyed() &&
          scene.primitives.remove(data.model);
      } catch (e) {
        console.error("[CESIUM|MARKER] error removing model", e);
      }
      ctx.requestRender();
    });
    ctx.withScene(async (scene) => {
      try {
        const hasValidStemline = data.stemline && !data.stemline.isDestroyed();

        const hasValidCollection =
          scene.primitives && !scene.primitives.isDestroyed();

        const isInCollection = scene.primitives.contains(data.stemline);
        console.debug(
          "[CESIUM|MARKER] removing stemline",
          data.stemline,
          hasValidStemline,
          hasValidCollection,
          isInCollection
        );
        if (hasValidStemline && hasValidCollection && isInCollection) {
          scene.primitives.remove(data.stemline);
        }
      } catch (e) {
        // Expected during scene reinitialization (2D↔3D transitions)
        // Primitives from old scene are destroyed - silently skip
        console.debug(
          "[CESIUM|MARKER] stemline already destroyed (likely scene transition)",
          e
        );
      }
      ctx.requestRender();
    });
  }
};
