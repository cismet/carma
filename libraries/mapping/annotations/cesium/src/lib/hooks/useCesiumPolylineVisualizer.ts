import { createElement, useEffect, useMemo, useRef } from "react";

import { Color, SceneTransforms, type Scene, defined } from "@carma/cesium";
import {
  createLineVisualizer,
  type LineVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import {
  buildPolylinePreviewCornerMarkers,
  buildPolylinePreviewEdgeSegments,
  POLYGON_PREVIEW_STROKE,
  POLYGON_PREVIEW_STROKE_WIDTH_PX,
  type FacadePreviewEdgeSegment,
  type PolylinePreviewMeasurement,
} from "@carma-mapping/annotations/core";
import {
  useLabelOverlay,
  useLineVisualizers,
} from "@carma-providers/label-overlay";

const FACADE_CORNER_OVERLAY_ID_PREFIX = "distance-facade-corner";
const FACADE_CORNER_MARKER_SIZE_PX = 10;
const FACADE_CORNER_MARKER_STROKE_WIDTH_PX = 1;

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

export type CesiumPolylineVisualizerOptions = {
  scene: Scene | null;
  polylineMeasurements: PolylinePreviewMeasurement[];
};

export const useCesiumPolylineVisualizer = ({
  scene,
  polylineMeasurements,
}: CesiumPolylineVisualizerOptions): {
  facadePreviewEdgeSegments: FacadePreviewEdgeSegment[];
} => {
  const facadePreviewEdgeLineRefs = useRef<Record<string, LineVisualizer>>({});
  const facadeCornerOverlayIdsRef = useRef<string[]>([]);
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const facadePreviewEdgeSegments = useMemo(
    () => buildPolylinePreviewEdgeSegments(polylineMeasurements),
    [polylineMeasurements]
  );

  const facadeCornerMarkers = useMemo(
    () => buildPolylinePreviewCornerMarkers(polylineMeasurements),
    [polylineMeasurements]
  );
  const facadePreviewOverlayLines = useMemo(
    () =>
      facadePreviewEdgeSegments.map((segment) => ({
        id: `polygon-preview-edge-${segment.id}`,
        getCanvasLine: () => {
          if (!scene || scene.isDestroyed()) return null;
          const start = SceneTransforms.worldToWindowCoordinates(
            scene,
            segment.start
          );
          const end = SceneTransforms.worldToWindowCoordinates(
            scene,
            segment.end
          );
          if (!defined(start) || !defined(end)) return null;
          return {
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
          };
        },
        stroke: POLYGON_PREVIEW_STROKE,
        strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
        hitTargetStrokeWidth: 10,
      })),
    [facadePreviewEdgeSegments, scene]
  );

  useLineVisualizers(
    facadePreviewOverlayLines,
    facadePreviewOverlayLines.length > 0
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
    if (!scene) return;

    destroyLineVisualizerMap(facadePreviewEdgeLineRefs);

    if (facadePreviewEdgeSegments.length === 0) {
      scene.requestRender();
      return;
    }

    const facadeEdgeColor = Color.WHITE;
    facadePreviewEdgeSegments.forEach((segment) => {
      const lineVisualizer = createLineVisualizer(
        `polygon-preview-edge-${segment.id}`,
        {
          start: segment.start,
          end: segment.end,
          color: facadeEdgeColor,
          width: POLYGON_PREVIEW_STROKE_WIDTH_PX,
          dashed: false,
        }
      );
      facadePreviewEdgeLineRefs.current[segment.id] = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
    });
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(facadePreviewEdgeLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [facadePreviewEdgeSegments, scene]);

  useEffect(() => {
    return () => {
      facadeCornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      facadeCornerOverlayIdsRef.current = [];
      destroyLineVisualizerMap(facadePreviewEdgeLineRefs);
    };
  }, [removeLabelOverlayElement]);

  return {
    facadePreviewEdgeSegments,
  };
};

export default useCesiumPolylineVisualizer;
