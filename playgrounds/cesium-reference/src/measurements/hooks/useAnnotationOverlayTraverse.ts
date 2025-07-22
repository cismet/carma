import { useMemo, useState, useEffect } from "react";

import {
  defined,
  Cartesian3,
  Transforms,
  Matrix4,
  Ellipsoid,
  Cartesian4,
} from "cesium";

import {
  usePointLabels,
  type PointLabelData,
  MarkerStyle,
} from "../../overlay";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { TraverseMeasurementEntry } from "../types/MeasurementTypes";
import { formatNumberToEnclosed } from "../utils/cesiumLabels";
import {
  isPointOccluded,
  isPointInViewport,
} from "../utils/occlusionDetection";

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels

const getLocalElevatedPoint = (
  position: Cartesian3,
  heightOffset: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): Cartesian3 => {
  if (heightOffset === 0) return position;

  // Get the local up direction at this position
  const localToFixedFrame = Transforms.eastNorthUpToFixedFrame(
    position,
    ellipsoid
  );
  const localUp = Matrix4.getColumn(localToFixedFrame, 2, new Cartesian4());

  // Convert to Cartesian3 (ignore w component)
  const upVector = new Cartesian3(localUp.x, localUp.y, localUp.z);

  // Scale the up vector by the height offset
  const offsetVector = Cartesian3.multiplyByScalar(
    upVector,
    heightOffset,
    new Cartesian3()
  );

  // Add the offset to the original position
  return Cartesian3.add(position, offsetVector, new Cartesian3());
};

export const useAnnotationOverlayTraverse = (
  traverses: TraverseMeasurementEntry[],
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

  // Extract all points from all traverses with ground and offset positions
  const allPoints = useMemo(() => {
    const points: Array<{
      id: string;
      groundPosition: Cartesian3;
      offsetPosition: Cartesian3;
      traverseId: string;
      pointIndex: number;
      cumulativeDistance: number;
      height: number;
    }> = [];

    traverses.forEach((traverse) => {
      const heightOffset = traverse.heightOffset || 0;

      traverse.geometryECEF.forEach((groundPosition, index) => {
        const pointGeographic = traverse.geometryWGS84[index];
        const cumulativeDistance =
          traverse.derived?.segmentLengthsCumulative[index] || 0;

        // Calculate offset position for the label
        const offsetPosition =
          heightOffset > 0
            ? getLocalElevatedPoint(groundPosition, heightOffset)
            : groundPosition;

        points.push({
          id: `${traverse.id}-${index}`,
          groundPosition,
          offsetPosition,
          traverseId: traverse.id,
          pointIndex: index,
          cumulativeDistance,
          height: pointGeographic.height,
        });
      });
    });

    return points;
  }, [traverses]);

  // Cesium-specific visibility and occlusion detection
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !showLabels) return;

    const checkVisibilityAndOcclusion = () => {
      const newOcclusionResults: Record<string, boolean> = {};
      const newHiddenResults: Record<string, boolean> = {};

      // Get current camera pitch once per frame for all points
      const currentPitch = viewer.scene.camera.pitch;
      if (Math.abs(currentPitch - cameraPitch) > 0.01) {
        setCameraPitch(currentPitch);
      }

      allPoints.forEach((point) => {
        // Convert 3D ground position to screen coordinates (visibility check only on ground point)
        const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(
          point.groundPosition
        );

        if (!defined(canvasPosition)) {
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
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
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
          return;
        }

        newHiddenResults[point.id] = false;

        // Check if point is occluded by terrain or other geometry
        newOcclusionResults[point.id] = isPointOccluded(
          viewer,
          point.groundPosition,
          canvasPosition,
          1.0
        );
      });

      // Only update state if results changed
      const occlusionChanged = allPoints.some(
        (point) => occlusionResults[point.id] !== newOcclusionResults[point.id]
      );
      const hiddenChanged = allPoints.some(
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
    console.log('[TraverseLabels] Registering preRender listener');
    const removeListener = viewer.scene.preRender.addEventListener(
      checkVisibilityAndOcclusion
    );
    console.log('[TraverseLabels] Registered preRender listener');

    return () => {
      if (removeListener) {
        removeListener();
        console.log('[TraverseLabels] Removed preRender listener');
      }
    };
  }, [
    viewer,
    allPoints,
    showLabels,
    occlusionResults,
    hiddenResults,
    cameraPitch,
  ]);

  // Transform traverse points to point label data using LINE marker style
  const pointLabelData: PointLabelData[] = useMemo(
    () =>
      allPoints.map((point) => ({
        id: point.id,
        getCanvasPosition: () => {
          if (!viewer || viewer.isDestroyed()) return null;
          const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(
            point.offsetPosition
          );
          return defined(canvasPosition)
            ? { x: canvasPosition.x, y: canvasPosition.y }
            : null;
        },
        pitch: cameraPitch,
        text: `${formatNumberToEnclosed(point.pointIndex + 1)} ${(
          point.height - referenceElevation
        ).toFixed(2)}m`,
        selected: false, // TODO: Add selection support for traverse points
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false,
        markerStyle: MarkerStyle.LINE, // Use LINE style for no circle marker
      })),
    [
      allPoints,
      referenceElevation,
      occlusionResults,
      hiddenResults,
      viewer,
      cameraPitch,
    ]
  );

  // Use the point labels hook with LINE marker style
  usePointLabels(pointLabelData, showLabels);
};

export default useAnnotationOverlayTraverse;
