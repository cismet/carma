import { useEffect, useState } from "react";
import { Cesium3DTileset, Viewer } from "cesium";

// zoom on load to tileset bounds
export const useZoomToTilesetOnReady = (
  viewerRef: React.MutableRefObject<Viewer | null>,
  tilesetRef: React.MutableRefObject<Cesium3DTileset | null>,
  tilesetReady: boolean
) => {
  const [hasZoomed, setHasZoomed] = useState(false);
  useEffect(() => {
    if (viewerRef.current && tilesetRef.current && tilesetReady && !hasZoomed) {
      try {
        // Add HMR robustness - check if viewer is not destroyed
        if (!viewerRef.current.isDestroyed()) {
          viewerRef.current.zoomTo(tilesetRef.current);
          setHasZoomed(true);
        }
      } catch (error) {
        console.error(
          "[useZoomToTilesetOnReady] Error zooming to tileset:",
          error
        );
      }
    }
  }, [tilesetReady, viewerRef, tilesetRef, hasZoomed]);
};
