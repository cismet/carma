import { useEffect, useRef, useCallback, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  CallbackProperty,
} from "cesium";

import { cesiumSafeRequestRender } from "@carma-mapping/cesium-engine";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPPoints";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import { PointInfoData } from "../components/measurements/PointMeasurementPanel";

export enum MeasurementMode {
  PointQuery = "point",
  Distance = "distance",
  Elevation = "elevation",
}

export const useMeasurement = (enabled: boolean = false) => {
  const { viewerRef } = useCesiumViewer();
  const viewer = viewerRef.current;

  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const measurementEntitiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const currentPointsRef = useRef<Cartesian3[]>([]);
  const isActiveRef = useRef<boolean>(false);
  const [measurementCount, setMeasurementCount] = useState<number>(0);
  const [activeMeasurementPoints, setActiveMeasurementPoints] = useState<Cartesian3[]>([]);
  const completedMeasurementsRef = useRef<number>(0);
  const [measurementMode, setMeasurementMode] = useState(MeasurementMode.PointQuery);
  const [searchRadius, setSearchRadius] = useState(10);
  const [pointData, setPointData] = useState<PointInfoData | null>(null);



  // Update measurement count based on completed measurements only
  const updateMeasurementCount = useCallback(() => {
    setMeasurementCount(completedMeasurementsRef.current);
    console.debug(
      `[Measurement] Updated measurement count: ${completedMeasurementsRef.current} completed measurements`
    );
  }, []);

  // Check if there are any measurement entities (for clear button state)
  const hasAnyMeasurementEntities = useCallback(() => {
    return (
      measurementEntitiesRef.current.length > 0 ||
      currentPolylineRef.current !== null
    );
  }, []);

  const clearMeasurements = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

    console.debug(
      `[Measurement] Clearing ${measurementEntitiesRef.current.length} measurement entities`
    );

    // Remove all tracked measurement entities
    measurementEntitiesRef.current.forEach((entity) => {
      try {
        viewer.entities.remove(entity);
        console.debug(
          `[Measurement] Removed entity: ${entity.id || "unnamed"}`
        );
      } catch (error) {
        console.warn(
          `[Measurement] Failed to remove entity: ${entity.id || "unnamed"}`,
          error
        );
      }
    });
    measurementEntitiesRef.current = [];

    // Remove current active polyline if exists
    if (currentPolylineRef.current) {
      try {
        viewer.entities.remove(currentPolylineRef.current);
        console.debug("[Measurement] Removed current polyline");
      } catch (error) {
        console.warn("[Measurement] Failed to remove current polyline", error);
      }
      currentPolylineRef.current = null;
    }

    // Reset all state
    currentPointsRef.current = [];
    isActiveRef.current = false;
    completedMeasurementsRef.current = 0;
    setActiveMeasurementPoints([]);
    updateMeasurementCount();

    cesiumSafeRequestRender(viewer);
    console.debug("[Measurement] Cleared all measurements - reset complete");
  }, [viewer, updateMeasurementCount]);

  const formatDistance = useCallback((distance: number): string => {
    if (distance < 1000) {
      return `${distance.toFixed(2)} m`;
    } else {
      return `${(distance / 1000).toFixed(3)} km`;
    }
  }, []);

  const createPointEntity = useCallback(
    (
      position: Cartesian3,
      pointIndex: number,
      cumulativeDistance: number
    ): Entity => {
      const pointLabelText =
        pointIndex === 0 // For the first point, don't show distance, just "1"
          ? "1"
          : `${pointIndex + 1}\n${formatDistance(cumulativeDistance)}`; // Subsequent points: "Index\nCumulativeDist"
      return new Entity({
        id: `measurement-point-${Date.now()}-${pointIndex}`,
        position: position,
        point: {
          pixelSize: 8,
          color: Color.LIGHTYELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          heightReference: 0, // NONE
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: pointLabelText,
          font: "bold 16px Arial",
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.7),
          backgroundPadding: new Cartesian2(4, 4),
          style: 0,
          pixelOffset: new Cartesian2(0, -25),
          scale: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    [formatDistance]
  );

  const createSegmentLabel = useCallback(
    (
      startPoint: Cartesian3,
      endPoint: Cartesian3,
      segmentDistance: number
    ): Entity => {
      const midpoint = Cartesian3.midpoint(
        startPoint,
        endPoint,
        new Cartesian3()
      );

      const labelText = formatDistance(segmentDistance); // Only segment distance

      return new Entity({
        id: `measurement-segment-${Date.now()}-${Math.random()}`,
        position: midpoint,
        label: {
          text: labelText,
          font: LABEL_FONT,
          fillColor: Color.LIGHTYELLOW,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.7),
          backgroundPadding: new Cartesian2(8, 4),
          style: 0,
          pixelOffset: new Cartesian2(0, -20),
          scaleByDistance: SCALE_BY_DISTANCE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    [formatDistance]
  );

  const createTotalLabel = useCallback(
    (points: Cartesian3[], totalDistance: number): Entity => {
      const lastPoint = points[points.length - 1];

      return new Entity({
        id: `measurement-total-${Date.now()}`,
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
    },
    [formatDistance]
  );

  const finishMeasurement = useCallback(() => {
    if (!viewer || viewer.isDestroyed() || currentPointsRef.current.length < 2)
      return;

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
    const totalLabel = createTotalLabel(
      currentPointsRef.current,
      totalDistance
    );
    viewer.entities.add(totalLabel);
    measurementEntitiesRef.current.push(totalLabel);
    console.debug(
      `[Measurement] Added total label: ${totalLabel.id}, total entities: ${measurementEntitiesRef.current.length}`
    );

    // Finalize the polyline
    if (currentPolylineRef.current) {
      measurementEntitiesRef.current.push(currentPolylineRef.current);
      console.debug(
        `[Measurement] Added polyline to tracking: ${currentPolylineRef.current.id}, total entities: ${measurementEntitiesRef.current.length}`
      );
      currentPolylineRef.current = null;
    }

    // Update measurement count - increment completed measurements
    completedMeasurementsRef.current += 1;
    updateMeasurementCount();
    console.debug(
      `[Measurement] Finished measurement ${
        completedMeasurementsRef.current
      }, total distance: ${formatDistance(totalDistance)}`
    );

    // Reset for next measurement
    currentPointsRef.current = [];
    isActiveRef.current = false;
    setActiveMeasurementPoints([]);

    cesiumSafeRequestRender(viewer);
    console.debug(
      `[Measurement] Finished measurement: ${formatDistance(totalDistance)}`
    );
  }, [viewer, createTotalLabel, formatDistance, updateMeasurementCount]);

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
      setActiveMeasurementPoints(currentPointsRef.current);

      // Calculate cumulative distance up to this point
      let currentCumulativeDistance = 0;
      if (currentPointsRef.current.length > 1) {
        for (let i = 1; i < currentPointsRef.current.length; i++) {
          currentCumulativeDistance += Cartesian3.distance(
            currentPointsRef.current[i - 1],
            currentPointsRef.current[i]
          );
        }
      }

      // Add point entity for this measurement point
      const pointEntity = createPointEntity(
        pickedPosition,
        currentPointsRef.current.length - 1,
        currentCumulativeDistance
      );
      viewer.entities.add(pointEntity);
      measurementEntitiesRef.current.push(pointEntity);
      console.debug(
        `[Measurement] Added point entity: ${pointEntity.id}, total entities: ${measurementEntitiesRef.current.length}`
      );

      if (currentPointsRef.current.length === 1) {
        // First point - start new polyline
        isActiveRef.current = true;
        currentPolylineRef.current = new Entity({
          id: `measurement-polyline-${Date.now()}`,
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
          currentPolylineRef.current.polyline!.positions = new CallbackProperty(
            () => {
              return currentPointsRef.current;
            },
            false
          );
        }

        // Calculate distance for the new segment
        const lastTwoPoints = currentPointsRef.current.slice(-2);
        const segmentDistance = Cartesian3.distance(
          lastTwoPoints[0],
          lastTwoPoints[1]
        );

        // Create segment label with only segment distance
        const segmentLabel = createSegmentLabel(
          lastTwoPoints[0],
          lastTwoPoints[1],
          segmentDistance
        );
        viewer.entities.add(segmentLabel);
        measurementEntitiesRef.current.push(segmentLabel);
        console.debug(
          `[Measurement] Added segment label: ${segmentLabel.id}, total entities: ${measurementEntitiesRef.current.length}`
        );

        console.debug(
          `[Measurement] Added segment ${
            currentPointsRef.current.length - 1
          }: ${formatDistance(segmentDistance)}`
        );
      }

      cesiumSafeRequestRender(viewer);
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
  }, [
    viewer,
    enabled,
    clearMeasurements,
    createSegmentLabel,
    createPointEntity,
    finishMeasurement,
    formatDistance,
    updateMeasurementCount,
  ]);

  return {
    clearMeasurements,
    isActive: isActiveRef.current,
    measurementCount,
    hasAnyMeasurementEntities: hasAnyMeasurementEntities(),
    activeMeasurementPoints,
    measurementMode,
    setMeasurementMode,
    setSearchRadius,
    pointData,
    setPointData,
    searchRadius,
  };
};

export default useMeasurement;
