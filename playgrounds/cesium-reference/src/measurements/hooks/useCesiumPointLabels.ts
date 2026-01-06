import { useMemo, useState, useEffect } from "react";

import { defined } from "cesium";

import { usePointLabels, type PointLabelData } from "../../overlay";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import { formatNumberToEnclosed } from "../utils/cesiumLabels";
import {
  isPointOccluded,
  isPointInViewport,
} from "../utils/occlusionDetection";

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels

export const useCesiumPointLabels = (
  points: PointMeasurementEntry[],
  showLabels: boolean,
  referenceElevation: number = 0
) => {
  const { viewer } = useCesiumViewer();
  const [occlusionResults, setOcclusionResults] = useState<
    Record<string, boolean>
  >({});
  const [hiddenResults, setHiddenResults] = useState<Record<string, boolean>>(
    {}
  );
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);

  // Cesium-specific visibility and occlusion detection
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !showLabels) return;

    const checkVisibilityAndOcclusion = () => {
      const newOcclusionResults: Record<string, boolean> = {};
      const newHiddenResults: Record<string, boolean> = {};

      // Get current camera pitch once per frame for all points
      const currentPitch = viewer.scene.camera.pitch;
      if (Math.abs(currentPitch - cameraPitch) > 0.01) {
        // 0.01 radian threshold
        setCameraPitch(currentPitch);
      }

      points.forEach((point) => {
        // Convert 3D position to screen coordinates
        const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(
          point.geometryECEF
        );

        if (!defined(canvasPosition)) {
          // Point is behind camera or outside frustum - mark as hidden
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false; // Not occluded, just hidden
          return;
        }

        // Check if point is within viewport bounds with padding for smooth transitions
        const inViewport = isPointInViewport(
          canvasPosition,
          viewer.canvas.clientWidth,
          viewer.canvas.clientHeight,
          VIEWPORT_PADDING_HORIZONTAL,
          VIEWPORT_PADDING_VERTICAL
        );

        if (!inViewport) {
          // Point is outside viewport - mark as hidden (no DOM updates)
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false; // Not occluded, just hidden
          return;
        }

        // Point is in viewport, not hidden
        newHiddenResults[point.id] = false;

        // Check if point is occluded by terrain or other geometry
        newOcclusionResults[point.id] = isPointOccluded(
          viewer,
          point.geometryECEF,
          canvasPosition,
          1.0 // 1 meter tolerance
        );
      });

      // Only update state if results changed
      const occlusionChanged = points.some(
        (point) => occlusionResults[point.id] !== newOcclusionResults[point.id]
      );
      const hiddenChanged = points.some(
        (point) => hiddenResults[point.id] !== newHiddenResults[point.id]
      );

      if (occlusionChanged) {
        setOcclusionResults(newOcclusionResults);
      }
      if (hiddenChanged) {
        setHiddenResults(newHiddenResults);
      }
    };

    // Check visibility and occlusion on camera movement
    const removeListener = viewer.scene.preRender.addEventListener(
      checkVisibilityAndOcclusion
    );

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [
    viewer,
    points,
    showLabels,
    occlusionResults,
    hiddenResults,
    cameraPitch,
  ]);

  // Transform measurement points to point label data
  const pointLabelData: PointLabelData[] = useMemo(
    () =>
      points.map((point, index) => ({
        id: point.id,
        getCanvasPosition: () => {
          // Fresh screen coordinate calculation at render time
          if (!viewer || viewer.isDestroyed()) return null;
          const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(
            point.geometryECEF
          );
          return defined(canvasPosition)
            ? { x: canvasPosition.x, y: canvasPosition.y }
            : null;
        },
        pitch: cameraPitch, // Use current camera pitch
        text: `${formatNumberToEnclosed(index + 1)} ${(
          point.geometryWGS84.height - referenceElevation
        ).toFixed(2)}m`,
        selected: point.isSelected,
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false, // Hidden (outside viewport) vs occluded (behind geometry)
      })),
    [
      points,
      referenceElevation,
      occlusionResults,
      hiddenResults,
      viewer,
      cameraPitch,
    ]
  );

  // Use the built-in point labels hook
  usePointLabels(pointLabelData, showLabels);
};

export default useCesiumPointLabels;
