import { useEffect, useRef, useCallback } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  CallbackProperty,
  Viewer,
  ConstantProperty,
  ConstantPositionProperty,
} from "cesium";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPoints";
import {
  MeasurementMode,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { updateCollection } from "../utils/measurementCollection";
import {
  createPointEntity,
  createSegmentLabel,
  createTotalLabel,
} from "../utils/cesiumTraverseEntities";
import { formatDistance } from "../../utils/formatters";

export function useCesiumTraverseQuery(
  viewer: Viewer,
  enabled: boolean,
  setCollection: (collection: TraverseMeasurementEntry[]) => void,
  soloMode: boolean = true // Solo mode to replace existing measurements of the same type
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const activeTraversePointsRef = useRef<Cartesian3[]>([]);
  const activeTraverseSegmentsLengthsRef = useRef<number[]>([0]);
  const activeTraverseSegmentsLengthsCumulativeRef = useRef<number[]>([0]);

  const isActiveTraverseRef = useRef<boolean>(false);

  const completedMeasurementsRef = useRef<number>(0);

  const clearTraverseQuery = useCallback(() => {
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
    activeTraverseSegmentsLengthsRef.current = [0];
    activeTraverseSegmentsLengthsCumulativeRef.current = [0];
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
      clearTraverseQuery();
      return;
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!enabled) return;
      let points = activeTraversePointsRef.current;
      let currentIndex = activeTraversePointsRef.current.length;
      let currentTotal = 0;
      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (!pickedPosition) return;
      // Remove preview label if present before locking in the new point
      if (
        traverseEntiesRef.current.length > 0 &&
        traverseEntiesRef.current[traverseEntiesRef.current.length - 1].name ===
          "__previewLabel"
      ) {
        const previewLabel = traverseEntiesRef.current.pop();
        if (previewLabel) {
          try {
            viewer.entities.remove(previewLabel);
          } catch {}
        }
      }
      points[currentIndex] = pickedPosition;
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        const segmentLength = Cartesian3.distance(
          pickedPosition,
          points[prevIndex]
        );
        // Update lengths
        const lastSum =
          activeTraverseSegmentsLengthsCumulativeRef.current[prevIndex];
        currentTotal = lastSum + segmentLength;

        activeTraverseSegmentsLengthsRef.current[currentIndex] = segmentLength;
        activeTraverseSegmentsLengthsCumulativeRef.current[currentIndex] =
          currentTotal;
      }
      const pointEntity = createPointEntity(
        pickedPosition,
        currentIndex,
        currentTotal
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

      // Compose TraverseMeasurementEntry
      const entry: TraverseMeasurementEntry = {
        id: `traverse-${Date.now()}`,
        type: MeasurementMode.Traverse,
        timestamp: Date.now(),
        geometryECEF: [...points],
        geometryWGS84: points.map((p) => {
          const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(p);
          return {
            longitude: carto.longitude * (180 / Math.PI),
            latitude: carto.latitude * (180 / Math.PI),
            height: carto.height,
          };
        }),
        derived: {
          segmentLengths: [...activeTraverseSegmentsLengthsRef.current],
          segmentLengthsCumulative: [
            ...activeTraverseSegmentsLengthsCumulativeRef.current,
          ],
          totalLength: currentTotal,
        },
      };
      updateCollection(setCollection, entry, soloMode);
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Live update: mouse move
    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      if (!enabled) return;
      if (!isActiveTraverseRef.current) return;
      const movePosition = viewer.scene.pickPosition(event.endPosition);
      if (!movePosition) return;
      const points = activeTraversePointsRef.current;
      if (points.length > 0) {
        // Update or create preview segment label from last clicked point to cursor
        const lastClicked = points[points.length - 1];
        const segmentDistance = Cartesian3.distance(lastClicked, movePosition);
        let previewLabel =
          traverseEntiesRef.current.length > 0 &&
          traverseEntiesRef.current[traverseEntiesRef.current.length - 1]
            .name === "__previewLabel"
            ? traverseEntiesRef.current[traverseEntiesRef.current.length - 1]
            : null;
        if (!previewLabel) {
          previewLabel = createSegmentLabel(
            lastClicked,
            movePosition,
            segmentDistance,
            LABEL_FONT,
            SCALE_BY_DISTANCE
          );
          previewLabel.name = "__previewLabel";
          viewer.entities.add(previewLabel);
          traverseEntiesRef.current.push(previewLabel);
        } else {
          // Update label position and text
          previewLabel.position = new ConstantPositionProperty(
            Cartesian3.midpoint(lastClicked, movePosition, new Cartesian3())
          );
          if (previewLabel.label) {
            previewLabel.label.text = new ConstantProperty(
              formatDistance(segmentDistance)
            );
          }
        }
        // Update polyline preview (show last clicked + cursor)
        if (currentPolylineRef.current) {
          currentPolylineRef.current.polyline!.positions = new CallbackProperty(
            () => [lastClicked, movePosition],
            false
          );
        }
        viewer.scene.requestRender();
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (isActiveTraverseRef.current) {
        const entry: TraverseMeasurementEntry = {
          id: `traverse-${Date.now()}`,
          type: MeasurementMode.Traverse,
          timestamp: Date.now(),
          geometryECEF: [...activeTraversePointsRef.current],
          geometryWGS84: activeTraversePointsRef.current.map((p) => {
            const carto =
              viewer.scene.globe.ellipsoid.cartesianToCartographic(p);
            return {
              longitude: carto.longitude * (180 / Math.PI),
              latitude: carto.latitude * (180 / Math.PI),
              height: carto.height,
            };
          }),
          derived: {
            segmentLengths: [...activeTraverseSegmentsLengthsRef.current],
            segmentLengthsCumulative: [
              ...activeTraverseSegmentsLengthsCumulativeRef.current,
            ],
            totalLength:
              activeTraverseSegmentsLengthsCumulativeRef.current[
                activeTraverseSegmentsLengthsCumulativeRef.current.length - 1
              ] || 0,
          },
        };
        console.debug(
          `[CesiumTraverseQuery] Finalizing measurement with ${
            activeTraversePointsRef.current.length
          } points and total length: ${entry.derived.totalLength.toFixed(2)}m`,
          entry
        );
        updateCollection(setCollection, entry, soloMode);
        finishMeasurement();
      }
    }, ScreenSpaceEventType.RIGHT_CLICK);
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [
    viewer,
    enabled,
    clearTraverseQuery,
    finishMeasurement,
    setCollection,
    soloMode,
  ]);

  return {
    clearTraverseQuery,
    isActive: isActiveTraverseRef.current,
  };
}
