import { useCallback, useRef } from "react";
import { Viewer } from "cesium";

export function useRequestRender(viewer: Viewer | null) {
  const requestIdRef = useRef<number | null>(null);

  const requestRender = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Cancel any pending render request
    if (requestIdRef.current !== null) {
      cancelAnimationFrame(requestIdRef.current);
    }

    // Schedule a new render on the next frame
    requestIdRef.current = requestAnimationFrame(() => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
      requestIdRef.current = null;
    });
  }, [viewer]);

  return requestRender;
}
