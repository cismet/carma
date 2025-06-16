import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  Color,
} from "cesium";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import type { InfoData } from "../components/InfoPanel";
import { create3DCrossGroup } from "../utils/cesium3DCross";

// Returns the picked point and info on click, no Cesium side effects
const useScenePick = (
  enabled: boolean,
  searchRadius: number,
  onPick: (picked: {
    cartesian: Cartesian3;
    info: InfoData;
  }) => void
) => {
  const { viewerRef } = useCesiumViewer();
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !enabled) {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      return;
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (!pickedPosition) return;
      const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(pickedPosition);
      if (!cartographic) return;
      const longitude = cartographic.longitude * (180 / Math.PI);
      const latitude = cartographic.latitude * (180 / Math.PI);
      const height = cartographic.height;
      onPick({
        cartesian: pickedPosition,
        info: {
          title: "Terrain Elevation Point",
          elevation: height,
          longitude,
          latitude,
          type: "terrain",
        },
      });
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, enabled, searchRadius, onPick]);
};

export const use3DCrossMarker = (picked: { cartesian: Cartesian3 } | null, searchRadius: number) => {
  const { viewerRef } = useCesiumViewer();
  useEffect(() => {
    if (!viewerRef.current || !picked) return;
    const viewer = viewerRef.current;
    const cross3D = create3DCrossGroup({
      position: picked.cartesian,
      radius: searchRadius,
      color: Color.ORANGE,
      width: 2,
      id: "terrain-click-cross-3d",
      xyCirclePlane: true,
      colorCircle: Color.WHITE.withAlpha(0.3),
    });
    cross3D.addToViewer(viewer);
    return () => {
      cross3D.cleanup(viewer);
    };
  }, [picked, searchRadius, viewerRef]);
};

export default useScenePick;
