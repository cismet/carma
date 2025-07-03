import { useEffect, useRef, useCallback, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  CallbackProperty,
  Viewer,
} from "cesium";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPoints";
import { MeasurementCollection } from "../types/MeasurementTypes";
import {
  createPointEntity,
  createSegmentLabel,
  createTotalLabel,
} from "../utils/cesiumMeasurmentMarkersDistance";
import { pick } from "resium";
import { point } from "leaflet";

export function useCesiumDistanceMeasurement(
  viewer: Viewer,
  enabled: boolean,
  setCollection: (collection: MeasurementCollection) => void,
  soloMode: boolean = true // Solo mode to replace existing measurements of the same type
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const activeTraversePointsRef = useRef<Cartesian3[]>([]);
  const activeTraverseSegmentsLengthsRef = useRef<number[]>([0]);
  const activeTraverseSegmentsLengthsCumulativeRef = useRef<number[]>([]);

  const isActiveTraverseRef = useRef<boolean>(false);

  const completedMeasurementsRef = useRef<number>(0);

  const clearMeasurements = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;
    traverseEntiesRef.current.forEach((entity) => {
      try {
        viewer.entities.remove(entity);
      } catch {}
    });
    traverseEntiesRef.current = [];
    if (currentPolylineRef.current) {
      try {
        viewer.entities.remove(currentPolylineRef.current);
      } catch {}
      currentPolylineRef.current = null;
    }
    activeTraversePointsRef.current = [];
    isActiveTraverseRef.current = false;
    completedMeasurementsRef.current = 0;
  }, [viewer]);

  const finishMeasurement = useCallback(() => {
    if (
      !viewer ||
      viewer.isDestroyed() ||
      activeTraversePointsRef.current.length < 2
    )
      return;
    let totalDistance = 0;
    for (let i = 1; i < activeTraversePointsRef.current.length; i++) {
      const distance = Cartesian3.distance(
        activeTraversePointsRef.current[i - 1],
        activeTraversePointsRef.current[i]
      );
      totalDistance += distance;
    }
    const totalLabel = createTotalLabel(
      activeTraversePointsRef.current,
      totalDistance,
      LABEL_FONT,
      SCALE_BY_DISTANCE
    );
    viewer.entities.add(totalLabel);
    traverseEntiesRef.current.push(totalLabel);
    if (currentPolylineRef.current) {
      traverseEntiesRef.current.push(currentPolylineRef.current);
      currentPolylineRef.current = null;
    }
    completedMeasurementsRef.current += 1;
    activeTraversePointsRef.current = [];
    isActiveTraverseRef.current = false;
  }, [viewer]);

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
      let points = activeTraversePointsRef.current;
      let currentIndex = activeTraversePointsRef.current.length;
      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (!pickedPosition) return;
      points[currentIndex] = pickedPosition;
      let currentCumulativeDistance = 0;
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        const segmentLength = Cartesian3.distance(
          pickedPosition,
          points[prevIndex]
        );
        activeTraverseSegmentsLengthsRef.current[currentIndex] = segmentLength;
        activeTraverseSegmentsLengthsCumulativeRef.current[currentIndex] =
          activeTraverseSegmentsLengthsCumulativeRef.current[prevIndex] +
          activeTraverseSegmentsLengthsRef.current[currentIndex];
      }
      const pointEntity = createPointEntity(
        pickedPosition,
        activeTraversePointsRef.current.length - 1,
        currentCumulativeDistance
      );
      viewer.entities.add(pointEntity);
      traverseEntiesRef.current.push(pointEntity);
      if (activeTraversePointsRef.current.length === 1) {
        isActiveTraverseRef.current = true;
        currentPolylineRef.current = new Entity({
          id: `measurement-polyline-${Date.now()}`,
          polyline: {
            positions: new CallbackProperty(() => {
              return activeTraversePointsRef.current;
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
              return activeTraversePointsRef.current;
            },
            false
          );
        }
        const lastTwoPoints = activeTraversePointsRef.current.slice(-2);
        const segmentDistance = Cartesian3.distance(
          lastTwoPoints[0],
          lastTwoPoints[1]
        );
        const segmentLabel = createSegmentLabel(
          lastTwoPoints[0],
          lastTwoPoints[1],
          segmentDistance,
          LABEL_FONT,
          SCALE_BY_DISTANCE
        );
        viewer.entities.add(segmentLabel);
        traverseEntiesRef.current.push(segmentLabel);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(() => {
      if (isActiveTraverseRef.current) {
        finishMeasurement();
      }
    }, ScreenSpaceEventType.RIGHT_CLICK);
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewer, enabled, clearMeasurements, finishMeasurement]);

  return {
    clearMeasurements,
    isActive: isActiveTraverseRef.current,
  };
}
