import { useCallback, useState } from "react";

export const useMeasurementEditState = () => {
  const [lockedEditMeasurementId, setLockedEditMeasurementId] = useState<
    string | null
  >(null);

  const clearLockedEditMeasurementId = useCallback(() => {
    setLockedEditMeasurementId(null);
  }, []);

  return {
    lockedEditMeasurementId,
    setLockedEditMeasurementId,
    clearLockedEditMeasurementId,
  };
};
