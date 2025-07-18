import { useMemo, useState, useCallback, useEffect } from "react";
import { usePointLabels, type PointLabelData } from "../../overlay";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import { formatNumberToEnclosed } from "../utils/cesiumLabels";
import { defined, Cartesian3 } from "cesium";

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

  // Cesium-specific visibility and occlusion detection
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !showLabels) return;

    const checkVisibilityAndOcclusion = () => {
      const newOcclusionResults: Record<string, boolean> = {};
      const newHiddenResults: Record<string, boolean> = {};

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
        const isInViewport =
          canvasPosition.x >= -VIEWPORT_PADDING_HORIZONTAL &&
          canvasPosition.x <=
            viewer.canvas.clientWidth + VIEWPORT_PADDING_HORIZONTAL &&
          canvasPosition.y >= -VIEWPORT_PADDING_VERTICAL &&
          canvasPosition.y <=
            viewer.canvas.clientHeight + VIEWPORT_PADDING_VERTICAL;

        if (!isInViewport) {
          // Point is outside viewport - mark as hidden (no DOM updates)
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false; // Not occluded, just hidden
          return;
        }

        // Point is in viewport, not hidden
        newHiddenResults[point.id] = false;

        // Use Cesium's scene.pick to test visibility against depth buffer
        const pickedObject = viewer.scene.pick(canvasPosition);

        if (defined(pickedObject)) {
          // Get the depth of the picked object
          const pickedCartesian = viewer.scene.pickPosition(canvasPosition);

          if (defined(pickedCartesian)) {
            // Calculate distances from camera
            const cameraPosition = viewer.scene.camera.position;
            const pointDistance = Cartesian3.distance(
              cameraPosition,
              point.geometryECEF
            );
            const pickedDistance = Cartesian3.distance(
              cameraPosition,
              pickedCartesian
            );

            // Point is occluded if something is closer to the camera
            const tolerance = 1.0; // 1 meter tolerance
            newOcclusionResults[point.id] =
              pickedDistance < pointDistance - tolerance;
          } else {
            newOcclusionResults[point.id] = false;
          }
        } else {
          newOcclusionResults[point.id] = false;
        }
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
  }, [viewer, points, showLabels, occlusionResults, hiddenResults]);

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
        getLocalUpVector: () => {
          // Calculate local up vector in screen space
          if (!viewer || viewer.isDestroyed()) return null;
          
          // Get the local up vector at this point (normal to ellipsoid surface)
          const ellipsoid = viewer.scene.globe.ellipsoid;
          const localUp = ellipsoid.geodeticSurfaceNormal(point.geometryECEF);
          
          // Create a point slightly above the original point using the up vector
          const upPoint = Cartesian3.add(
            point.geometryECEF, 
            Cartesian3.multiplyByScalar(localUp, 10.0, new Cartesian3()), 
            new Cartesian3()
          );
          
          // Project both points to screen space
          const baseCanvasPos = viewer.scene.cartesianToCanvasCoordinates(point.geometryECEF);
          const upCanvasPos = viewer.scene.cartesianToCanvasCoordinates(upPoint);
          
          if (!defined(baseCanvasPos) || !defined(upCanvasPos)) return null;
          
          // Calculate the screen space up vector (normalized)
          const screenUpVector = {
            x: upCanvasPos.x - baseCanvasPos.x,
            y: upCanvasPos.y - baseCanvasPos.y
          };
          
          // Normalize the vector
          const length = Math.sqrt(screenUpVector.x * screenUpVector.x + screenUpVector.y * screenUpVector.y);
          if (length === 0) return { x: 0, y: -1 }; // Default up if calculation fails
          
          return {
            x: screenUpVector.x / length,
            y: screenUpVector.y / length
          };
        },
        text: `${formatNumberToEnclosed(index + 1)} ${(
          point.geometryWGS84.height - referenceElevation
        ).toFixed(2)}m`,
        selected: point.isSelected,
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false, // Hidden (outside viewport) vs occluded (behind geometry)
      })),
    [points, referenceElevation, occlusionResults, hiddenResults, viewer]
  );

  // Use the built-in point labels hook
  usePointLabels(pointLabelData, showLabels);
};

export default useCesiumPointLabels;
