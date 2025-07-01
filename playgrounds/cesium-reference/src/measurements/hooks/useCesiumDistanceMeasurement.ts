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
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPPoints";
import { formatDistance } from "../../utils/formatters";
import { MeasurementCollection } from "../CesiumMeasurementsContext";

const createPointEntity = (
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
};

export function useCesiumDistanceMeasurement(
  viewer: any,
  enabled: boolean,
  collection: MeasurementCollection,
  setCollection: (collection: MeasurementCollection) => void
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const measurementEntitiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const currentPointsRef = useRef<Cartesian3[]>([]);
  const isActiveRef = useRef<boolean>(false);
  const [measurementCount, setMeasurementCount] = useState<number>(0);
  const [activeMeasurementPoints, setActiveMeasurementPoints] = useState<
    Cartesian3[]
  >([]);
  const completedMeasurementsRef = useRef<number>(0);

  const updateMeasurementCount = useCallback(() => {
    setMeasurementCount(completedMeasurementsRef.current);
  }, []);

  const hasAnyMeasurementEntities = useCallback(() => {
    return (
      measurementEntitiesRef.current.length > 0 ||
      currentPolylineRef.current !== null
    );
  }, []);

  const clearMeasurements = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;
    measurementEntitiesRef.current.forEach((entity) => {
      try {
        viewer.entities.remove(entity);
      } catch {}
    });
    measurementEntitiesRef.current = [];
    if (currentPolylineRef.current) {
      try {
        viewer.entities.remove(currentPolylineRef.current);
      } catch {}
      currentPolylineRef.current = null;
    }
    currentPointsRef.current = [];
    isActiveRef.current = false;
    completedMeasurementsRef.current = 0;
    setActiveMeasurementPoints([]);
    updateMeasurementCount();
  }, [viewer, updateMeasurementCount]);

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
      const labelText = formatDistance(segmentDistance);
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
    []
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
          style: 0,
          pixelOffset: new Cartesian2(0, 30),
          scaleByDistance: SCALE_BY_DISTANCE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    []
  );

  const finishMeasurement = useCallback(() => {
    if (!viewer || viewer.isDestroyed() || currentPointsRef.current.length < 2)
      return;
    let totalDistance = 0;
    for (let i = 1; i < currentPointsRef.current.length; i++) {
      const distance = Cartesian3.distance(
        currentPointsRef.current[i - 1],
        currentPointsRef.current[i]
      );
      totalDistance += distance;
    }
    const totalLabel = createTotalLabel(
      currentPointsRef.current,
      totalDistance
    );
    viewer.entities.add(totalLabel);
    measurementEntitiesRef.current.push(totalLabel);
    if (currentPolylineRef.current) {
      measurementEntitiesRef.current.push(currentPolylineRef.current);
      currentPolylineRef.current = null;
    }
    completedMeasurementsRef.current += 1;
    updateMeasurementCount();
    currentPointsRef.current = [];
    isActiveRef.current = false;
    setActiveMeasurementPoints([]);
  }, [viewer, createTotalLabel, updateMeasurementCount]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled) {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      clearMeasurements();
      return;
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!enabled) return;
      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (!pickedPosition) return;
      currentPointsRef.current.push(pickedPosition);
      setActiveMeasurementPoints(currentPointsRef.current);
      let currentCumulativeDistance = 0;
      if (currentPointsRef.current.length > 1) {
        for (let i = 1; i < currentPointsRef.current.length; i++) {
          currentCumulativeDistance += Cartesian3.distance(
            currentPointsRef.current[i - 1],
            currentPointsRef.current[i]
          );
        }
      }
      const pointEntity = createPointEntity(
        pickedPosition,
        currentPointsRef.current.length - 1,
        currentCumulativeDistance
      );
      viewer.entities.add(pointEntity);
      measurementEntitiesRef.current.push(pointEntity);
      if (currentPointsRef.current.length === 1) {
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
      } else {
        if (currentPolylineRef.current) {
          currentPolylineRef.current.polyline!.positions = new CallbackProperty(
            () => {
              return currentPointsRef.current;
            },
            false
          );
        }
        const lastTwoPoints = currentPointsRef.current.slice(-2);
        const segmentDistance = Cartesian3.distance(
          lastTwoPoints[0],
          lastTwoPoints[1]
        );
        const segmentLabel = createSegmentLabel(
          lastTwoPoints[0],
          lastTwoPoints[1],
          segmentDistance
        );
        viewer.entities.add(segmentLabel);
        measurementEntitiesRef.current.push(segmentLabel);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(() => {
      if (isActiveRef.current) {
        finishMeasurement();
      }
    }, ScreenSpaceEventType.RIGHT_CLICK);
    handler.setInputAction(() => {
      if (isActiveRef.current) {
        finishMeasurement();
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [
    viewer,
    enabled,
    clearMeasurements,
    createSegmentLabel,
    finishMeasurement,
  ]);

  return {
    clearMeasurements,
    isActive: isActiveRef.current,
    measurementCount,
    hasAnyMeasurementEntities: hasAnyMeasurementEntities(),
    activeMeasurementPoints,
  };
}
