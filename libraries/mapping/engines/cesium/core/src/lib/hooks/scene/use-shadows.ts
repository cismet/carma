import { useEffect } from "react";
import { useCesiumContext } from "../../context";
import { isValidScene } from "@carma/cesium";

/**
 * Configures shadow settings for the scene
 */
export const useShadows = (shadowsEnabled = false) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !scene) return;

    console.debug(
      "[CESIUM|SHADOWS] Configuring shadows:",
      shadowsEnabled ? "ENABLED" : "DISABLED"
    );

    scene.globe.enableLighting = shadowsEnabled;

    if (shadowsEnabled && scene.shadowMap) {
      scene.shadowMap.enabled = true;
    } else if (scene.shadowMap) {
      scene.shadowMap.enabled = false;
    }

    scene.requestRender();
  }, [sceneRef, shadowsEnabled]);
};

export default useShadows;
