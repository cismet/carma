import { useCallback, useEffect, useRef } from "react";

import { useCesiumContext } from "@carma-mapping/engines/cesium";

export const useCesiumOverlaySync = () => {
  const { getScene } = useCesiumContext();
  const scene = getScene();
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
