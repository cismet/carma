import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  Viewer,
} from "cesium";

export function useCesiumMousePosition(
  viewer: Viewer | null,
  enabled: boolean = true
) {
  const [mousePosition, setMousePosition] = useState<Cartesian3 | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled) {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      setMousePosition(null);
      // Reset cursor
      if (viewer?.scene?.canvas) {
        viewer.scene.canvas.style.cursor = "";
      }
      return;
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    // Set crosshair cursor when measurement mode is active
    viewer.scene.canvas.style.cursor = "crosshair";

    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const pickedPosition = viewer.scene.pickPosition(event.endPosition);
      setMousePosition(pickedPosition || null);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      // Reset cursor when cleaning up
      if (viewer?.scene?.canvas) {
        viewer.scene.canvas.style.cursor = "";
      }
    };
  }, [viewer, enabled]);

  return mousePosition;
}
