import { createElement, useEffect, useMemo, useRef } from "react";

import { SceneTransforms, type Scene, defined } from "@carma/cesium";
import {
  buildPolylinePreviewCornerMarkers,
  type PolylinePreviewMeasurement,
} from "@carma-mapping/annotations/core";
import { useLabelOverlay } from "@carma-providers/label-overlay";

const FACADE_CORNER_OVERLAY_ID_PREFIX = "distance-facade-corner";
const FACADE_CORNER_MARKER_SIZE_PX = 10;
const FACADE_CORNER_MARKER_STROKE_WIDTH_PX = 1;

export type PolylineOverlayVisualizerOptions = {
  scene: Scene | null;
  polylineMeasurements: PolylinePreviewMeasurement[];
};

export const usePolylineOverlayVisualizer = ({
  scene,
  polylineMeasurements,
}: PolylineOverlayVisualizerOptions) => {
  const facadeCornerOverlayIdsRef = useRef<string[]>([]);
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const facadeCornerMarkers = useMemo(
    () => buildPolylinePreviewCornerMarkers(polylineMeasurements),
    [polylineMeasurements]
  );

  const facadeCornerMarkerContent = useMemo(
    () =>
      createElement("div", {
        style: {
          width: `${FACADE_CORNER_MARKER_SIZE_PX}px`,
          height: `${FACADE_CORNER_MARKER_SIZE_PX}px`,
          borderRadius: "50%",
          border: `${FACADE_CORNER_MARKER_STROKE_WIDTH_PX}px solid rgba(255, 255, 255, 0.95)`,
          background: "transparent",
          boxSizing: "border-box",
          pointerEvents: "none",
        },
      }),
    []
  );

  useEffect(() => {
    facadeCornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    facadeCornerOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];
    facadeCornerMarkers.forEach((marker) => {
      const overlayId = `${FACADE_CORNER_OVERLAY_ID_PREFIX}-${marker.id}`;
      addLabelOverlayElement({
        id: overlayId,
        zIndex: 9,
        content: facadeCornerMarkerContent,
        updatePosition: (elementDiv) => {
          if (!scene || scene.isDestroyed()) return false;
          const screenPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            marker.position
          );
          if (!defined(screenPosition)) return false;
          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${screenPosition.x}px`;
          elementDiv.style.top = `${screenPosition.y}px`;
          elementDiv.style.transform = "translate(-50%, -50%)";
          elementDiv.style.pointerEvents = "none";
          return true;
        },
      });
      nextOverlayIds.push(overlayId);
    });

    facadeCornerOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      facadeCornerOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    facadeCornerMarkerContent,
    facadeCornerMarkers,
    removeLabelOverlayElement,
    scene,
  ]);

  useEffect(() => {
    return () => {
      facadeCornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      facadeCornerOverlayIdsRef.current = [];
    };
  }, [removeLabelOverlayElement]);
};

export default usePolylineOverlayVisualizer;
