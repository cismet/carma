import { createElement, useEffect, useMemo, useRef } from "react";

import {
  SceneTransforms,
  defined,
  isValidScene,
  type Scene,
} from "@carma/cesium";
import {
  buildPolylinePreviewCornerMarkers,
  type PolylinePreviewMeasurement,
} from "@carma-mapping/annotations/core";
import { useLabelOverlay } from "@carma-providers/label-overlay";

const POLYLINE_OVERLAY_DEFAULTS = {
  ids: {
    verticalCornerOverlayPrefix: "distance-vertical-corner",
  },
  verticalCornerMarker: {
    sizePx: 10,
    strokeWidthPx: 1,
    strokeColor: "rgba(255, 255, 255, 0.95)",
  },
} as const;

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
          width: `${POLYLINE_OVERLAY_DEFAULTS.verticalCornerMarker.sizePx}px`,
          height: `${POLYLINE_OVERLAY_DEFAULTS.verticalCornerMarker.sizePx}px`,
          borderRadius: "50%",
          border: `${POLYLINE_OVERLAY_DEFAULTS.verticalCornerMarker.strokeWidthPx}px solid ${POLYLINE_OVERLAY_DEFAULTS.verticalCornerMarker.strokeColor}`,
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

    if (!isValidScene(scene)) {
      return;
    }

    const nextOverlayIds: string[] = [];
    verticalCornerMarkers.forEach((marker) => {
      const overlayId = `${POLYLINE_OVERLAY_DEFAULTS.ids.verticalCornerOverlayPrefix}-${marker.id}`;
      addLabelOverlayElement({
        id: overlayId,
        zIndex: 9,
        content: verticalCornerMarkerContent,
        updatePosition: (elementDiv) => {
          if (!isValidScene(scene)) return false;
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
