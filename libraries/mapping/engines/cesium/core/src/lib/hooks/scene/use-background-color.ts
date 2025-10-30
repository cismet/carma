import { useEffect, type MutableRefObject } from "react";
import { Color } from "@carma/cesium";
import { useCesiumContext } from "../../context";

export const useBackgroundColor = (
  styleCallbacksRef: MutableRefObject<{
    onBackgroundColorChange?: (color: [number, number, number, number]) => void;
  }>,
  onBackgroundReady?: () => void
) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const handleBackgroundColorChange = (
      backgroundColor: [number, number, number, number]
    ) => {
      const scene = sceneRef.current;
      if (!scene) return;

      const [r, g, b, a] = backgroundColor;
      const bgColor = new Color(r, g, b, a);
      scene.backgroundColor = bgColor;

      const container = scene.canvas.parentElement;
      if (container) {
        const cssColor = bgColor.toCssColorString();
        container.style.backgroundColor = cssColor;
        scene.canvas.style.backgroundColor = cssColor;

        console.debug(
          "[CESIUM|BACKGROUND] Background color set:",
          backgroundColor,
          "CSS color:",
          cssColor
        );
      }
      scene.requestRender();
    };

    const currentCallbacks = styleCallbacksRef.current;
    currentCallbacks.onBackgroundColorChange = (backgroundColor) => {
      handleBackgroundColorChange(backgroundColor);
      onBackgroundReady?.();
    };

    return () => {
      currentCallbacks.onBackgroundColorChange = undefined;
    };
  }, [sceneRef, styleCallbacksRef, onBackgroundReady]);
};
