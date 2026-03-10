import { createElement, useEffect, useMemo, useRef } from "react";

import { SceneTransforms, type Scene, defined } from "@carma/cesium";
import {
  buildPolylinePreviewCornerMarkers,
  type PolylinePreviewMeasurement,
} from "@carma-mapping/annotations/core";
import { useLabelOverlay } from "@carma-providers/label-overlay";

const VERTICAL_CORNER_OVERLAY_ID_PREFIX = "distance-vertical-corner";
const VERTICAL_CORNER_MARKER_SIZE_PX = 10;
const VERTICAL_CORNER_MARKER_STROKE_WIDTH_PX = 1;

export type PolylineOverlayVisualizerOptions = Record<string, never>;

export const usePolylineOverlayVisualizer = (
  scene: Scene | null,
  polylineMeasurements: PolylinePreviewMeasurement[],
  _options: PolylineOverlayVisualizerOptions = {}
) => {
  const verticalCornerOverlayIdsRef = useRef<string[]>([]);
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const verticalCornerMarkers = useMemo(
    () => buildPolylinePreviewCornerMarkers(polylineMeasurements),
    [polylineMeasurements]
  );

  const verticalCornerMarkerContent = useMemo(
    () =>
      createElement("div", {
        style: {
          width: `${VERTICAL_CORNER_MARKER_SIZE_PX}px`,
          height: `${VERTICAL_CORNER_MARKER_SIZE_PX}px`,
          borderRadius: "50%",
          border: `${VERTICAL_CORNER_MARKER_STROKE_WIDTH_PX}px solid rgba(255, 255, 255, 0.95)`,
          background: "transparent",
          boxSizing: "border-box",
          pointerEvents: "none",
        },
      }),
    []
  );

  useEffect(() => {
    verticalCornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    verticalCornerOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];
    verticalCornerMarkers.forEach((marker) => {
      const overlayId = `${VERTICAL_CORNER_OVERLAY_ID_PREFIX}-${marker.id}`;
      addLabelOverlayElement({
        id: overlayId,
        zIndex: 9,
        content: verticalCornerMarkerContent,
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

    verticalCornerOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      verticalCornerOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    verticalCornerMarkerContent,
    verticalCornerMarkers,
    removeLabelOverlayElement,
    scene,
  ]);

  useEffect(() => {
    return () => {
      verticalCornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      verticalCornerOverlayIdsRef.current = [];
    };
  }, [removeLabelOverlayElement]);
};

export default usePolylineOverlayVisualizer;
