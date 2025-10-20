import { useEffect } from "react";
import { Color } from "@carma/cesium";
import { useCesiumContext } from "../../context";
import { isValidScene } from "@carma/cesium";
import type { ColorRgbaArray } from "../../types/config/scene-style";

/**
 * Applies background color to the scene
 */
export const useBackgroundColor = (backgroundColor?: ColorRgbaArray) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !scene) return;

    if (backgroundColor) {
      // backgroundColor is [r, g, b, a] in 0-1 range (normalized)
      const [r, g, b, a] = backgroundColor;
      const bgColor = new Color(r, g, b, a);
      scene.backgroundColor = bgColor;

      // Also set the container background color for consistency
      const container = scene.canvas.parentElement;
      if (container) {
        const cssColor = bgColor.toCssColorString();
        container.style.backgroundColor = cssColor;
      }

      console.debug(
        "[CESIUM|BACKGROUND] Background color set:",
        backgroundColor
      );
      scene.requestRender();
    }
  }, [sceneRef, backgroundColor]);
};

export default useBackgroundColor;
