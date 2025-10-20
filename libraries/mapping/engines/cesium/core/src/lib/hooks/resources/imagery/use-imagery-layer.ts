import { useEffect, type MutableRefObject } from "react";
import type { ImageryLayer, Scene } from "@carma/cesium";

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
      imageryLayer.show = false;
    }
  }, [sceneRef, imageryLayerRef]);
};
