import type { Cartographic, Model, Scene } from "cesium";

import type { MarkerPrimitiveData, MarkerModelAsset, PolylineConfig } from ".";

import { attachListeners, detachListeners } from "./listeners";
import { buildMarkerData } from "./data";

const addMarkerModelToScene = (
  scene: Scene,
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

  scene.primitives.add(model);

  return true;
};

export const addCesiumMarker = async (
  scene: Scene,
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
    scene,
    pos,
    groundPos,
    modelConfig,
    options,
  });

  if (!addMarkerModelToScene(scene, markerData)) {
    return undefined;
  }

  attachListeners(scene, markerData);

  markerData.cleanup = () => {
    console.debug("[CESIUM|MARKER] cleaning up listeners for", markerData.id);
    detachListeners(scene, markerData);
  };

  return markerData;
};

export const removeCesiumMarker = (
  scene: Scene,
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
    try {
      data.model &&
        !data.model.isDestroyed() &&
        !scene.primitives.isDestroyed() &&
        scene.primitives.remove(data.model);
    } catch (e) {
      console.error("[CESIUM|MARKER] error removing model", e);
    }
    scene.requestRender();
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
    scene.requestRender();
  }
};
