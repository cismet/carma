import { useCallback, useEffect, useRef, useState } from "react";

import { type Scene } from "@carma/cesium";
export const useCesiumOverlaySync = (scene: Scene | null) => {
  const overlayUpdateRef = useRef<(() => void) | null>(null);
  const [overlayUpdateVersion, setOverlayUpdateVersion] = useState(0);

  useEffect(() => {
    if (!overlayUpdateRef.current) return;

    if (!scene || scene.isDestroyed()) return;
    const removePreRenderListener = scene.preRender.addEventListener(() => {
      overlayUpdateRef.current?.();
    });
    return () => {
      removePreRenderListener?.();
    };
  }, [overlayUpdateVersion, scene]);

  return useCallback((updateOverlayPositions: () => void) => {
    overlayUpdateRef.current = updateOverlayPositions;
    setOverlayUpdateVersion((previous) => previous + 1);
  }, []);
};
