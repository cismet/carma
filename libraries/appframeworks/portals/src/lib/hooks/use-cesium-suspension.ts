import { useEffect } from "react";
import { useCesiumContext } from "@carma/cesium/core";
import { type Scene, isValidScene, isValidImageryLayer } from "@carma/cesium";
import { usePortalContext } from "../contexts/PortalContext";

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
 * Uses PortalContext as the single source of truth for suspension state.
 *
 * @returns {boolean} Current suspension state
 */
export const useCesiumSuspension = (): boolean => {
  const { sceneRef } = useCesiumContext();
  const { getEngines } = usePortalContext();

  // Get current suspension state from PortalContext (single source of truth)
  const engines = getEngines();
  const cesiumEngine = engines.find((e) => e.engine === "cesium3d");
  const isSuspended = cesiumEngine?.isSuspended ?? true;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!isValidScene(scene)) return;

    console.debug("[useCesiumSuspension] Handling suspension state", {
      suspended: isSuspended,
    });

    /*

    if (isSuspended) {
      console.debug("[useCesiumSuspension] Hiding cesium imagery layers");
      hideLayers(scene);
    } else {
      console.debug("[useCesiumSuspension] Showing cesium imagery layers");
      showLayers(scene);
    }
    */
  }, [isSuspended, sceneRef]);

  return isSuspended;
};

export default useCesiumSuspension;
