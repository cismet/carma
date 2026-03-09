import {
  POINT_LABEL_METRIC_MODES,
  DEFAULT_POINT_LABEL_METRIC_MODE,
  type PointLabelMetricMode,
} from "@carma-mapping/annotations/core";

export const getNextPointLabelMetricMode = (
  currentMode: PointLabelMetricMode = DEFAULT_POINT_LABEL_METRIC_MODE
): PointLabelMetricMode => {
  const currentIndex = POINT_LABEL_METRIC_MODES.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % POINT_LABEL_METRIC_MODES.length;
  return POINT_LABEL_METRIC_MODES[nextIndex];
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
