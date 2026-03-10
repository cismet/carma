import { useCallback, useEffect, useRef } from "react";

import { type Scene } from "@carma/cesium";

export const useCesiumOverlaySync = (scene: Scene | null) => {
  const overlayUpdateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const removePreRenderListener = scene.preRender.addEventListener(() => {
      overlayUpdateRef.current?.();
    });

    return () => {
      removePreRenderListener();
    };
  }, [scene]);

  return useCallback((updateOverlayPositions: () => void) => {
    overlayUpdateRef.current = updateOverlayPositions;
  }, []);
};
