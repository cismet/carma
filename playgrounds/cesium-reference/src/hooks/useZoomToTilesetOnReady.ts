import { useEffect, useRef } from "react";
import { Cesium3DTileset, Viewer } from "cesium";

// zoom on load to tileset bounds, with optional conditional behavior
export const useZoomToTilesetOnReady = (
  viewerRef: React.MutableRefObject<Viewer | null>,
  tilesetRef: React.MutableRefObject<Cesium3DTileset | null>,
  tilesetReady: boolean,
  shouldZoom = true // Optional parameter for conditional zoom behavior
) => {
  // Track if we've already processed a zoom request to prevent duplicates
  const hasProcessedZoomRef = useRef(false);

  useEffect(() => {
    if (
      viewerRef.current &&
      tilesetRef.current &&
      tilesetReady &&
      shouldZoom &&
      !hasProcessedZoomRef.current
    ) {
      try {
        // Add HMR robustness - check if viewer is not destroyed
        if (!viewerRef.current.isDestroyed()) {
          viewerRef.current.zoomTo(tilesetRef.current);
          hasProcessedZoomRef.current = true;
          console.debug("[useZoomToTilesetOnReady] Zoomed to tileset");
        }
      } catch (error) {
        console.error(
          "[useZoomToTilesetOnReady] Error zooming to tileset:",
          error
        );
      }
    }
  }, [tilesetReady, viewerRef, tilesetRef, shouldZoom]);

  // Reset the processed flag when shouldZoom changes from false to true
  useEffect(() => {
    if (shouldZoom) {
      hasProcessedZoomRef.current = false;
    }
  }, [shouldZoom]);

  // Manual zoom function for home button or programmatic use
  const zoomToTileset = () => {
    if (
      viewerRef.current &&
      tilesetRef.current &&
      !viewerRef.current.isDestroyed()
    ) {
      try {
        viewerRef.current.zoomTo(tilesetRef.current);
        console.debug("[useZoomToTilesetOnReady] Manual zoom to tileset");
      } catch (error) {
        console.error(
          "[useZoomToTilesetOnReady] Error manually zooming to tileset:",
          error
        );
      }
    }
  };

  return { zoomToTileset };
};
