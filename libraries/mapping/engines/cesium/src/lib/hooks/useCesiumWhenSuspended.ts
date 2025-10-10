import { useEffect } from "react";
import { isValidImageryLayer, isValidScene } from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";
import { Scene } from "cesium";

const hideLayers = (scene: Scene) => {
  const hideOnce = () => {
    if (!isValidScene(scene)) return;
    for (let i = 0; i < scene.imageryLayers.length; i++) {
      const layer = scene.imageryLayers.get(i);
      if (isValidImageryLayer(layer)) {
        layer.show = false; // Hide the layer
      } else {
        console.debug("[CESIUM|VIEWER] skip invalid imagery layer");
      }
    }
    scene.postRender.removeEventListener(hideOnce);
  };
  scene.postRender.addEventListener(hideOnce);
};

const showLayers = (scene: Scene) => {
  const showOnce = () => {
    if (!isValidScene(scene)) return;
    for (let i = 0; i < scene.imageryLayers.length; i++) {
      const layer = scene.imageryLayers.get(i);
      if (isValidImageryLayer(layer)) {
        layer.show = true; // unHide the layer
      } else {
        console.debug("[CESIUM|VIEWER] skip invalid imagery layer");
      }
    }
    scene.postRender.removeEventListener(showOnce);
  };
  scene.postRender.addEventListener(showOnce);
};

/**
 * Reduces resource usage when Cesium is suspended (not active/visible).
 * Hides imagery layers to save memory and GPU resources.
 */
export const useCesiumWhenSuspended = (delay = 0) => {
  const { sceneRef, isSuspendedRef } = useCesiumContext();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    console.debug("HOOK: [CESIUM] useCesiumWhenSuspended", {
      suspended: isSuspendedRef.current,
    });
    if (isSuspendedRef.current) {
      if (delay > 0) {
        setTimeout(() => {
          console.debug(
            "HOOK: [CESIUM] hiding cesium imagery layer with delay",
            delay
          );
          hideLayers(scene);
        }, delay);
      } else {
        console.debug("HOOK: [CESIUM] hiding cesium imagery layer undelayed");
        hideLayers(scene);
      }
    } else {
      console.debug("HOOK: [CESIUM] showing cesium imagery layer");
      showLayers(scene);
    }
  }, [delay, sceneRef, isSuspendedRef]);
};

export default useCesiumWhenSuspended;
