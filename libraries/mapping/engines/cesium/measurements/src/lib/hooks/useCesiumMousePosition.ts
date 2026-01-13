import { useEffect, useRef, useState } from "react";

import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "@carma/cesium";

export function useCesiumMousePosition(
  scene: Scene | null,
  enabled: boolean = true
) {
  const [mousePosition, setMousePosition] = useState<Cartesian3 | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      setMousePosition(null);
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handlerRef.current = handler;

    // Set crosshair cursor when measurement mode is active
    scene.canvas.style.cursor = "crosshair";

    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const pickedPosition = scene.pickPosition(event.endPosition);
      if (pickedPosition) {
        setMousePosition(pickedPosition);
        scene.requestRender();
      } else {
        setMousePosition(null);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      // Reset cursor when cleaning up
      if (scene && !scene.isDestroyed()) {
        scene.canvas.style.cursor = "";
      }
    };
  }, [scene, enabled]);

  return mousePosition;
}
