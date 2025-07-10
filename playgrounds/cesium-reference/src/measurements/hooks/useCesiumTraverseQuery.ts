import {
  useEffect,
  useRef,
  useCallback,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  Viewer,
} from "cesium";
import {
  MeasurementMode,
  TraverseMeasurementEntry,
  MeasurementCollection,
} from "../types/MeasurementTypes";
import {
  updateCollection,
  makeTemporaryMeasurementsPermanent,
} from "../utils/measurementCollection";
import { toGeographicDegrees } from "../utils/geo";

export function useCesiumTraverseQuery(
  viewer: Viewer | null,
  enabled: boolean,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  temporaryMode: boolean = true
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const activeTraversePointsRef = useRef<Cartesian3[]>([]);
  const activeTraverseSegmentsLengthsRef = useRef<number[]>([0]);
  const activeTraverseSegmentsLengthsCumulativeRef = useRef<number[]>([0]);
  const [isActiveTraverse, setIsActiveTraverse] = useState<boolean>(false);
  const [currentTraverseId, setCurrentTraverseId] = useState<string | null>(
    null
  );
  const prevTemporaryModeRef = useRef(temporaryMode);

  // Handle temporary-to-permanent conversion when temporary mode is turned off
  useEffect(() => {
    if (prevTemporaryModeRef.current && !temporaryMode) {
      // Temporary mode was turned off, make all temporary measurements permanent
      makeTemporaryMeasurementsPermanent(setCollection);
      console.debug(
        "[TraverseQuery] Converted temporary measurements to permanent"
      );
    }
    prevTemporaryModeRef.current = temporaryMode;
  }, [temporaryMode, setCollection]);

  const toGeographic = useCallback(
    (p: Cartesian3) => {
      if (!viewer) return { longitude: 0, latitude: 0, height: 0 };
      return toGeographicDegrees(p, viewer.scene.globe.ellipsoid);
    },
    [viewer]
  );

  const clearTraverseQuery = useCallback(() => {
    activeTraversePointsRef.current = [];
    activeTraverseSegmentsLengthsRef.current = [0];
    activeTraverseSegmentsLengthsCumulativeRef.current = [0];
    setIsActiveTraverse(false);
    setCurrentTraverseId(null);
  }, []);

  const finishMeasurement = useCallback(() => {
    if (activeTraversePointsRef.current.length < 2) return;

    const entry: TraverseMeasurementEntry = {
      id: currentTraverseId!,
      type: MeasurementMode.Traverse,
      timestamp: Date.now(),
      geometryECEF: [...activeTraversePointsRef.current],
      geometryWGS84: activeTraversePointsRef.current.map(toGeographic),
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

    updateCollection(setCollection, entry, temporaryMode);
    clearTraverseQuery();
  }, [
    toGeographic,
    setCollection,
    temporaryMode,
    clearTraverseQuery,
    currentTraverseId,
  ]);

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

      const pickedPosition = viewer.scene.pickPosition(event.position);
      if (!pickedPosition) return;

      const points = activeTraversePointsRef.current;
      const currentIndex = points.length;
      let currentTotal = 0;

      points[currentIndex] = pickedPosition;

      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        const segmentLength = Cartesian3.distance(
          pickedPosition,
          points[prevIndex]
        );
        const lastSum =
          activeTraverseSegmentsLengthsCumulativeRef.current[prevIndex];
        currentTotal = lastSum + segmentLength;

        activeTraverseSegmentsLengthsRef.current[currentIndex] = segmentLength;
        activeTraverseSegmentsLengthsCumulativeRef.current[currentIndex] =
          currentTotal;
      }

      // Start a new traverse if none is active
      let traverseId = currentTraverseId;
      if (currentIndex === 0) {
        traverseId = `traverse-${Date.now()}`;
        setIsActiveTraverse(true);
        setCurrentTraverseId(traverseId);
      }

      const entry: TraverseMeasurementEntry = {
        id: traverseId!,
        type: MeasurementMode.Traverse,
        timestamp: Date.now(),
        geometryECEF: [...points],
        geometryWGS84: points.map(toGeographic),
        derived: {
          segmentLengths: [...activeTraverseSegmentsLengthsRef.current],
          segmentLengthsCumulative: [
            ...activeTraverseSegmentsLengthsCumulativeRef.current,
          ],
          totalLength: currentTotal,
        },
      };

      updateCollection(setCollection, entry, temporaryMode);
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      if (isActiveTraverse) {
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
    finishMeasurement,
    setCollection,
    temporaryMode,
    toGeographic,
    clearTraverseQuery,
    currentTraverseId,
    isActiveTraverse,
  ]);

  return {
    clearTraverseQuery,
    isActiveTraverse,
    currentTraverseId,
  };
}
