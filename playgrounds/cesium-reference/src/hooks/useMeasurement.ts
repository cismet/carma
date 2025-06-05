import { useEffect, useRef, useCallback, useState } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  CallbackProperty,
} from "cesium";

import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPPoints";

const useMeasurement = (
  viewer: Viewer | null,
  enabled: boolean = false
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const measurementEntitiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const currentPointsRef = useRef<Cartesian3[]>([]);
  const isActiveRef = useRef<boolean>(false);
  const [measurementCount, setMeasurementCount] = useState<number>(0);

  const clearMeasurements = useCallback(() => {
    if (!viewer) return;

    // Remove all measurement entities
    measurementEntitiesRef.current.forEach((entity) => {
      viewer.entities.remove(entity);
    });
    measurementEntitiesRef.current = [];
    setMeasurementCount(0);

    // Clear current polyline and points
    if (currentPolylineRef.current) {
      viewer.entities.remove(currentPolylineRef.current);
      currentPolylineRef.current = null;
    }
    currentPointsRef.current = [];
    isActiveRef.current = false;

    viewer.scene.requestRender();
    console.debug("[Measurement] Cleared all measurements");
  }, [viewer]);

  const formatDistance = useCallback((distance: number): string => {
    if (distance < 1000) {
      return `${distance.toFixed(2)} m`;
    } else {
      return `${(distance / 1000).toFixed(3)} km`;
    }
  }, []);

  const createSegmentLabel = useCallback((
    startPoint: Cartesian3,
    endPoint: Cartesian3,
    segmentDistance: number,
    totalDistance: number
  ): Entity => {
    // Calculate midpoint for label placement
    const midpoint = Cartesian3.midpoint(startPoint, endPoint, new Cartesian3());

    // Format: "10.12m (5.33m)" - total distance (segment distance)
    const labelText = `${formatDistance(totalDistance)} (${formatDistance(segmentDistance)})`;

    return new Entity({
      position: midpoint,
      label: {
        text: labelText,
        font: LABEL_FONT,
        fillColor: Color.LIGHTYELLOW,
        showBackground: true,
        backgroundColor: Color.BLACK.withAlpha(0.7),
        backgroundPadding: new Cartesian2(8, 4),
        style: 0, // FILL_AND_OUTLINE
        pixelOffset: new Cartesian2(0, -20),
        scaleByDistance: SCALE_BY_DISTANCE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, [formatDistance]);

  const createTotalLabel = useCallback((points: Cartesian3[], totalDistance: number): Entity => {
    const lastPoint = points[points.length - 1];
    
    return new Entity({
      position: lastPoint,
      label: {
        text: `Total: ${formatDistance(totalDistance)}`,
        font: LABEL_FONT,
        fillColor: Color.WHITE,
        showBackground: true,
        backgroundColor: Color.BLACK.withAlpha(0.8),
        backgroundPadding: new Cartesian2(12, 6),
        style: 0, // FILL_AND_OUTLINE
        pixelOffset: new Cartesian2(0, 30),
        scaleByDistance: SCALE_BY_DISTANCE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, [formatDistance]);

  const finishMeasurement = useCallback(() => {
    if (!viewer || currentPointsRef.current.length < 2) return;

    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < currentPointsRef.current.length; i++) {
      const distance = Cartesian3.distance(
        currentPointsRef.current[i - 1],
        currentPointsRef.current[i]
      );
      totalDistance += distance;
    }

    // Add total distance label
    const totalLabel = createTotalLabel(currentPointsRef.current, totalDistance);
    viewer.entities.add(totalLabel);
    measurementEntitiesRef.current.push(totalLabel);

    // Finalize the polyline
    if (currentPolylineRef.current) {
      measurementEntitiesRef.current.push(currentPolylineRef.current);
      currentPolylineRef.current = null;
    }

    // Update measurement count
    setMeasurementCount(measurementEntitiesRef.current.length);

    // Reset for next measurement
    currentPointsRef.current = [];
    isActiveRef.current = false;

    viewer.scene.requestRender();
    console.debug(`[Measurement] Finished measurement: ${formatDistance(totalDistance)}`);
  }, [viewer, createTotalLabel, formatDistance]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled) {
      // Clean up if disabled
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      clearMeasurements();
      return;
    }

    // Create click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    // Left click to add points
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const pickedPosition = viewer.scene.pickPosition(event.position);
      
      if (!pickedPosition) {
        console.debug("[Measurement] No position picked");
        return;
      }

      currentPointsRef.current.push(pickedPosition);

      if (currentPointsRef.current.length === 1) {
        // First point - start new polyline
        isActiveRef.current = true;
        currentPolylineRef.current = new Entity({
          polyline: {
            positions: new CallbackProperty(() => {
              return currentPointsRef.current;
            }, false),
            width: 3,
            material: Color.LIGHTYELLOW,
            clampToGround: false,
          },
        });
        viewer.entities.add(currentPolylineRef.current);
        console.debug("[Measurement] Started new measurement");
      } else {
        // Subsequent points - update polyline and add segment label
        if (currentPolylineRef.current) {
          currentPolylineRef.current.polyline!.positions = new CallbackProperty(() => {
            return currentPointsRef.current;
          }, false);
        }

        // Calculate distance for the new segment
        const lastTwoPoints = currentPointsRef.current.slice(-2);
        const segmentDistance = Cartesian3.distance(lastTwoPoints[0], lastTwoPoints[1]);

        // Calculate total distance up to this point
        let totalDistance = 0;
        for (let i = 1; i < currentPointsRef.current.length; i++) {
          const distance = Cartesian3.distance(
            currentPointsRef.current[i - 1],
            currentPointsRef.current[i]
          );
          totalDistance += distance;
        }

        // Create segment label with total and segment distance
        const segmentLabel = createSegmentLabel(
          lastTwoPoints[0],
          lastTwoPoints[1],
          segmentDistance,
          totalDistance
        );
        viewer.entities.add(segmentLabel);
        measurementEntitiesRef.current.push(segmentLabel);
        setMeasurementCount(measurementEntitiesRef.current.length);

        console.debug(
          `[Measurement] Added segment ${currentPointsRef.current.length - 1}: ${formatDistance(segmentDistance)}`
        );
      }

      viewer.scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Right click or double click to finish measurement
    handler.setInputAction(() => {
      if (isActiveRef.current) {
        finishMeasurement();
      }
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // Double click to finish measurement (alternative)
    handler.setInputAction(() => {
      if (isActiveRef.current) {
        finishMeasurement();
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    console.debug("[Measurement] Measurement handler enabled");

    // Cleanup function
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      console.debug("[Measurement] Measurement handler cleaned up");
    };
  }, [viewer, enabled, clearMeasurements, createSegmentLabel, finishMeasurement, formatDistance]);

  return {
    clearMeasurements,
    isActive: isActiveRef.current,
    measurementCount,
  };
};

export default useMeasurement;
