import { useState } from "react";

export const useMeasurementVisibilityState = <TMode extends string>() => {
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<TMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<Set<TMode>>(
    new Set()
  );

  return {
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
  };
};
