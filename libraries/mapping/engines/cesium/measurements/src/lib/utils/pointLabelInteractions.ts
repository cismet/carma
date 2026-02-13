import { type Cartesian3 } from "@carma/cesium";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  isPointMeasurementEntry,
  type MeasurementCollection,
  type PointLabelMetricMode,
} from "../types/MeasurementTypes";

const POINT_LABEL_METRIC_CLICK_ORDER: PointLabelMetricMode[] = [
  "elevation",
  "none",
  "distance",
];

export const getNextPointLabelMetricMode = (
  currentMode: PointLabelMetricMode = DEFAULT_POINT_LABEL_METRIC_MODE
): PointLabelMetricMode => {
  const currentIndex = POINT_LABEL_METRIC_CLICK_ORDER.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % POINT_LABEL_METRIC_CLICK_ORDER.length;
  return POINT_LABEL_METRIC_CLICK_ORDER[nextIndex];
};

type RunPointLabelClickInteractionParams = {
  pointId: string;
  selectedMeasurementId: string | null;
  selectMeasurementById: (id: string | null) => void;
  cyclePointLabelMetricModeByMeasurementId: (id: string) => void;
};

export const runPointLabelClickInteraction = ({
  pointId,
  selectedMeasurementId,
  selectMeasurementById,
  cyclePointLabelMetricModeByMeasurementId,
}: RunPointLabelClickInteractionParams) => {
  if (selectedMeasurementId === pointId) {
    cyclePointLabelMetricModeByMeasurementId(pointId);
    return;
  }

  selectMeasurementById(pointId);
};

type RunPointLabelDoubleClickInteractionParams = {
  pointId: string;
  measurements: MeasurementCollection;
  setReferencePoint: (point: Cartesian3 | null) => void;
};

export const runPointLabelDoubleClickInteraction = ({
  pointId,
  measurements,
  setReferencePoint,
}: RunPointLabelDoubleClickInteractionParams) => {
  const pointMeasurement = measurements.find(
    (measurement) =>
      isPointMeasurementEntry(measurement) && measurement.id === pointId
  );
  if (!pointMeasurement || !isPointMeasurementEntry(pointMeasurement)) {
    return;
  }

  // Double click only updates the reference point.
  setReferencePoint(pointMeasurement.geometryECEF);
};
