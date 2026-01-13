import { useEffect, useRef, useCallback } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

export const useCesiumOverlaySync = () => {
  const { getScene } = useCesiumContext();
  const scene = getScene();
  // Use a ref that persists across renders but initially is null
  const overlayUpdateRef = useRef<(() => void) | null>(null);

  // Sync label overlay with Cesium render loop
  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const onPreRender = () => {
      if (overlayUpdateRef.current) {
        overlayUpdateRef.current();
      }
    };

    const removeListener = scene.preRender.addEventListener(onPreRender);
    return () => {
      // Standard cleanup
      removeListener();
    };
  }, [scene]);

  // This callback is passed to the LabelOverlayProvider
  // It allows the provider to register its update function with us
  const requestUpdateCallback = useCallback((fn: () => void) => {
    overlayUpdateRef.current = fn;
  }, []);

  return requestUpdateCallback;
};
