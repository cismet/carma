import { useEffect } from "react";
import { useCesiumContext } from "../../context";
import { isValidScene } from "../../utils/lazy-validators";
import type { ColorRgbaArray } from "@carma/types";

/**
 * Applies background color to the scene
 */
export const useBackgroundColor = (backgroundColor?: ColorRgbaArray) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !scene) return;

    if (backgroundColor) {
      (async () => {
        const { Color } = await import("@carma/cesium");
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
      })();
    }
  }, [sceneRef, backgroundColor]);
};

export default useBackgroundColor;
