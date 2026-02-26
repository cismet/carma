import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  type MeasurementEntry,
  type PointMeasurementEntry,
  useCesiumMeasurements,
} from "@carma-mapping/engines/cesium/measurements";

export type MeasurementNavigationEntry = {
  kind: "measurement";
  id: string;
  measurement: MeasurementEntry;
};

export const useInfoBoxPointTypeNavigation = (
  measurements: MeasurementEntry[],
  pointMeasureEntriesFromProvider?: PointMeasurementEntry[]
) => {
  const { planarPolygonGroups } = useCesiumMeasurements();

  const pointMeasurements = useMemo<PointMeasurementEntry[]>(
    () => measurements.filter(isPointMeasurementEntry),
    [measurements]
  );

  const polylineVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (group.closed) return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const pointMeasureEntries = useMemo(() => {
    if (pointMeasureEntriesFromProvider) {
      return pointMeasureEntriesFromProvider;
    }

    return pointMeasurements.filter(
      (measurement) =>
        !measurement.auxiliaryLabelAnchor &&
        !polylineVertexPointIdSet.has(measurement.id)
    );
  }, [
    pointMeasureEntriesFromProvider,
    pointMeasurements,
    polylineVertexPointIdSet,
  ]);

  const pointMeasureOrderById = useMemo(() => {
    return pointMeasureEntries.reduce<Record<string, number>>(
      (acc, measurement, index) => {
        acc[measurement.id] = index + 1;
        return acc;
      },
      {}
    );
  }, [pointMeasureEntries]);

  const navigationEntries = useMemo<MeasurementNavigationEntry[]>(() => {
    return measurements
      .filter((measurement) => {
        if (!isPointMeasurementEntry(measurement)) return true;
        return !polylineVertexPointIdSet.has(measurement.id);
      })
      .map<MeasurementNavigationEntry>((measurement) => ({
        kind: "measurement",
        id: measurement.id,
        measurement,
      }));
  }, [measurements, polylineVertexPointIdSet]);

  return {
    pointMeasurements,
    pointMeasureEntries,
    pointMeasureOrderById,
    navigationEntries,
    nextPointMeasureOrder: pointMeasureEntries.length + 1,
  };
};
