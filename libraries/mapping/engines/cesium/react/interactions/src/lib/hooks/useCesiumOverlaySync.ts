import { useCallback, useEffect, useRef, useState } from "react";

import { type Scene } from "@carma/cesium";
import { useCesiumSceneStateUpdateDriverOptional } from "@carma-mapping/engines/cesium/react/scene-state";

export const useCesiumOverlaySync = (scene: Scene | null) => {
  const overlayUpdateRef = useRef<(() => void) | null>(null);
  const sceneStateUpdateDriver = useCesiumSceneStateUpdateDriverOptional();
  const [overlayUpdateVersion, setOverlayUpdateVersion] = useState(0);

  useEffect(() => {
    if (!overlayUpdateRef.current) return;
    if (sceneStateUpdateDriver) {
      return sceneStateUpdateDriver(() => {
        overlayUpdateRef.current?.();
      });
    }

    if (!scene || scene.isDestroyed()) return;
    const removePreRenderListener = scene.preRender.addEventListener(() => {
      overlayUpdateRef.current?.();
    });
    return () => {
      removePreRenderListener?.();
    };
  }, [overlayUpdateVersion, scene, sceneStateUpdateDriver]);

  return useCallback((updateOverlayPositions: () => void) => {
    overlayUpdateRef.current = updateOverlayPositions;
    setOverlayUpdateVersion((previous) => previous + 1);
  }, []);
};
