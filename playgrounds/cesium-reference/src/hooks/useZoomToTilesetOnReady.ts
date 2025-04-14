import { useEffect, useState } from "react";
import { Cesium3DTileset, Viewer } from "cesium";

// zoom on load to tileset bounds
export const useZoomToTilesetOnReady = (
  viewer: Viewer | undefined,
  tilesetRef: React.MutableRefObject<Cesium3DTileset | null>,
  tilesetReady: boolean
) => {
  const [hasZoomed, setHasZoomed] = useState(false);
  useEffect(() => {
    if (viewer && tilesetRef.current && tilesetReady && !hasZoomed) {
      viewer.zoomTo(tilesetRef.current);
      setHasZoomed(true);
    }
  }, [tilesetReady, viewer, tilesetRef, hasZoomed]);
};
