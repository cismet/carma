import { useState, useEffect, useMemo, useRef } from "react";
import { defined, Cartesian3 } from "cesium";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import {
  MeasurementCollection,
  isPointMeasurementEntry,
  isTraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import {
  ProjectionState,
  ProjectionStateWithCamera,
} from "../types/ProjectionTypes";
import { isPointInViewport } from "../utils/occlusionDetection";

// Viewport padding constants for smooth transitions
const VIEWPORT_PADDING_HORIZONTAL = 100;
const VIEWPORT_PADDING_VERTICAL = 50;

// Performance throttling constants
const OCCLUSION_CHECK_INTERVAL = 100; // 10 FPS for occlusion detection
const CAMERA_PITCH_THRESHOLD = 0.01; // Minimum change to update camera pitch

// Occlusion detection constants
const OCCLUSION_TOLERANCE = 1.0; // meters - distance tolerance for occlusion detection

/**
 * Centralized projection hook that computes screen coordinates and visibility
 * for all points in the measurements collection with optimized batching
 */
export const useCartesian3ToScreenCoords = (
  measurements: MeasurementCollection,
  enabled: boolean = true
): ProjectionStateWithCamera => {
  const { viewer } = useCesiumViewer();
  const [projectionState, setProjectionState] = useState<ProjectionState>({});
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMovingRef = useRef<boolean>(false);
  const lastUpdateRef = useRef<number>(0);

  // Extract all 3D points from measurements collection
  const allPoints = useMemo(() => {
    const points: Array<{ id: string; position: Cartesian3 }> = [];

    measurements.forEach((measurement) => {
      if (isPointMeasurementEntry(measurement)) {
        points.push({
          id: measurement.id,
          position: measurement.geometryECEF,
        });
      } else if (isTraverseMeasurementEntry(measurement)) {
        measurement.geometryECEF.forEach((position, index) => {
          points.push({
            id: `${measurement.id}-${index}`,
            position,
          });
        });
      }
    });

    return points;
  }, [measurements]);

  // Optimized batch projection calculation
  const updateProjections = useMemo(() => {
    return () => {
      if (!viewer || viewer.isDestroyed() || allPoints.length === 0) {
        return;
      }

      const now = performance.now();
      const newProjectionState: ProjectionState = {};

      // Update camera pitch tracking
      const currentPitch = viewer.scene.camera.pitch;
      if (Math.abs(currentPitch - cameraPitch) > CAMERA_PITCH_THRESHOLD) {
        setCameraPitch(currentPitch);
      }

      // Batch process all points in single frame
      allPoints.forEach((point) => {
        // Convert 3D position to screen coordinates
        const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(
          point.position
        );

        if (!defined(canvasPosition)) {
          // Point is behind camera or outside frustum
          newProjectionState[point.id] = {
            id: point.id,
            canvasPosition: null,
            isVisible: false,
            isOccluded: false,
            isInViewport: false,
          };
          return;
        }

        // Viewport culling with padding for smooth transitions
        const isInViewport = isPointInViewport(
          canvasPosition,
          viewer.canvas.clientWidth,
          viewer.canvas.clientHeight,
          VIEWPORT_PADDING_HORIZONTAL,
          VIEWPORT_PADDING_VERTICAL
        );

        if (!isInViewport) {
          // Point is outside viewport - mark as hidden
          newProjectionState[point.id] = {
            id: point.id,
            canvasPosition,
            isVisible: false,
            isOccluded: false,
            isInViewport: false,
          };
          return;
        }

        // Point is in viewport, check occlusion using optimized depth buffer sampling
        let isOccluded = false;
        try {
          // Primary method: Depth buffer-based occlusion detection
          const depth = viewer.scene.pickPosition(canvasPosition);
          if (defined(depth)) {
            const pointDistance = Cartesian3.distance(
              viewer.scene.camera.position,
              point.position
            );
            const depthDistance = Cartesian3.distance(
              viewer.scene.camera.position,
              depth
            );
            // Point is occluded if something is significantly closer
            isOccluded = depthDistance < pointDistance - OCCLUSION_TOLERANCE;
          } else {
            // If no depth information available, assume not occluded
            // This handles cases where depth buffer sampling fails
            isOccluded = false;
          }
        } catch (error) {
          // Fallback: If depth buffer sampling completely fails, use scene.pick as backup
          try {
            const pickedObject = viewer.scene.pick(canvasPosition);
            if (defined(pickedObject)) {
              // If something was picked at this position, the point might be occluded
              // This is a less accurate fallback but better than nothing
              const pickedPosition = viewer.scene.pickPosition(canvasPosition);
              if (defined(pickedPosition)) {
                const pointDistance = Cartesian3.distance(
                  viewer.scene.camera.position,
                  point.position
                );
                const pickedDistance = Cartesian3.distance(
                  viewer.scene.camera.position,
                  pickedPosition
                );
                isOccluded =
                  pickedDistance < pointDistance - OCCLUSION_TOLERANCE;
              }
            }
          } catch (fallbackError) {
            // Ultimate fallback: assume not occluded
            isOccluded = false;
          }
        }

        newProjectionState[point.id] = {
          id: point.id,
          canvasPosition,
          isVisible: !isOccluded,
          isOccluded,
          isInViewport: true,
        };
      });

      // Only update state if projections changed
      setProjectionState((prevState) => {
        const hasChanges = allPoints.some((point) => {
          const prev = prevState[point.id];
          const current = newProjectionState[point.id];

          if (!prev && !current) return false;
          if (!prev || !current) return true;

          return (
            prev.isVisible !== current.isVisible ||
            prev.isOccluded !== current.isOccluded ||
            prev.isInViewport !== current.isInViewport ||
            prev.canvasPosition?.x !== current.canvasPosition?.x ||
            prev.canvasPosition?.y !== current.canvasPosition?.y
          );
        });

        return hasChanges ? newProjectionState : prevState;
      });

      lastUpdateRef.current = now;
    };
  }, [viewer, allPoints, cameraPitch]);

  // Single preRender listener with camera movement detection
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled || allPoints.length === 0) {
      setProjectionState({});
      return;
    }

    // Camera movement detection for performance throttling
    const onMoveStart = () => {
      isMovingRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const onMoveEnd = () => {
      isMovingRef.current = false;
      // Immediate update when movement stops
      updateProjections();

      // Start throttled updates for occlusion detection
      if (!intervalRef.current) {
        intervalRef.current = setInterval(
          updateProjections,
          OCCLUSION_CHECK_INTERVAL
        );
      }
    };

    // Register single preRender listener for real-time projection updates
    const removePreRenderListener = viewer.scene.preRender.addEventListener(
      () => {
        if (isMovingRef.current) {
          // During movement, only update projections (skip expensive occlusion)
          const now = performance.now();
          if (now - lastUpdateRef.current > 16) {
            // ~60 FPS limit
            updateProjections();
          }
        }
      }
    );

    // Register camera movement listeners
    const removeMoveStartListener =
      viewer.camera.moveStart.addEventListener(onMoveStart);
    const removeMoveEndListener =
      viewer.camera.moveEnd.addEventListener(onMoveEnd);

    // Initial projection calculation
    updateProjections();

    // Start throttled occlusion detection
    if (!intervalRef.current) {
      intervalRef.current = setInterval(
        updateProjections,
        OCCLUSION_CHECK_INTERVAL
      );
    }

    console.log(
      "[CentralizedProjection] Started single preRender listener for",
      allPoints.length,
      "points"
    );

    return () => {
      if (removePreRenderListener) removePreRenderListener();
      if (removeMoveStartListener) removeMoveStartListener();
      if (removeMoveEndListener) removeMoveEndListener();

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      console.log("[CentralizedProjection] Cleaned up projection listeners");
    };
  }, [viewer, allPoints, enabled, updateProjections]);

  return { projectionState, cameraPitch };
};
