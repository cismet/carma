import { useEffect } from "react";
import { useCesiumContext } from "../context";
import { isValidScene } from "@carma-mapping/engines/cesium/api";

/**
 * Configures shadow settings for the scene
 */
export const useShadows = () => {
  const { sceneRef, config } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !scene) return;

    const shadowsEnabled = config.shadows ?? false; // Default to disabled

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
  }, [sceneRef, config.shadows]);
};

export default useShadows;
