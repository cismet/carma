import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Cartesian3 } from "@carma/cesium";
import type { PointAnnotationEntry } from "@carma-mapping/annotations/core";

type UseReferencePointStateParams = {
  pointEntries: PointAnnotationEntry[];
  referencePoint: Cartesian3 | null;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referencePointSyncEpsilonMeters: number;
};

export const useReferencePointState = ({
  pointEntries,
  referencePoint,
  setReferencePoint,
  referencePointSyncEpsilonMeters,
}: UseReferencePointStateParams) => {
  useEffect(
    function effectSyncReferencePointAfterPointDeletion() {
      if (!referencePoint) return;

      if (pointEntries.length === 0) {
        setReferencePoint(null);
        return;
      }

      const hasReferenceMeasurement = pointEntries.some(
        (measurement) =>
          Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          referencePointSyncEpsilonMeters
      );

      if (hasReferenceMeasurement) {
        return;
      }

      const nextReferencePoint =
        pointEntries[pointEntries.length - 1]?.geometryECEF ?? null;
      setReferencePoint(nextReferencePoint);
    },
    [
      pointEntries,
      referencePoint,
      referencePointSyncEpsilonMeters,
      setReferencePoint,
    ]
  );

  useEffect(
    function effectInitializeReferencePointFromPointEntries() {
      if (referencePoint !== null) return;
      if (pointEntries.length > 1) {
        setReferencePoint(pointEntries[0]?.geometryECEF ?? null);
      }
    },
    [pointEntries, referencePoint, setReferencePoint]
  );

  const setReferencePointId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setReferencePoint(null);
        return;
      }

      const referenceMeasurement =
        pointEntries.find((pointEntry) => pointEntry.id === id) ?? null;
      if (!referenceMeasurement) {
        return;
      }

      setReferencePoint(referenceMeasurement.geometryECEF);
    },
    [pointEntries, setReferencePoint]
  );

  return {
    setReferencePointId,
  };
};
