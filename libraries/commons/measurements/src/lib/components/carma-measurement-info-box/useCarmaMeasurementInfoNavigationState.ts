import { useCallback, useMemo } from "react";

type NavigationMeasurement = {
  id: string;
};

type UseCarmaMeasurementInfoNavigationStateParams = {
  navigationMeasurements: ReadonlyArray<NavigationMeasurement>;
  currentMeasurementId: string | null;
  onSelectMeasurementById: (id: string | null) => void;
  onFlyToMeasurementById: (id: string) => void;
  onFlyToAllMeasurements: () => void;
};

export const useCarmaMeasurementInfoNavigationState = ({
  navigationMeasurements,
  currentMeasurementId,
  onSelectMeasurementById,
  onFlyToMeasurementById,
  onFlyToAllMeasurements,
}: UseCarmaMeasurementInfoNavigationStateParams) => {
  const navigableMeasurements = useMemo(
    () => navigationMeasurements,
    [navigationMeasurements]
  );
  const totalEntries = navigableMeasurements.length;

  const currentIndex = Math.max(
    0,
    navigableMeasurements.findIndex(
      (measurement) => measurement.id === currentMeasurementId
    )
  );

  const onPreviousMeasurement = useCallback(() => {
    if (totalEntries === 0) return;
    const nextIndex = (currentIndex + 1) % totalEntries;
    onSelectMeasurementById(navigableMeasurements[nextIndex]?.id ?? null);
  }, [
    currentIndex,
    navigableMeasurements,
    onSelectMeasurementById,
    totalEntries,
  ]);

  const onNextMeasurement = useCallback(() => {
    if (totalEntries === 0) return;
    const nextIndex = (currentIndex - 1 + totalEntries) % totalEntries;
    onSelectMeasurementById(navigableMeasurements[nextIndex]?.id ?? null);
  }, [
    currentIndex,
    navigableMeasurements,
    onSelectMeasurementById,
    totalEntries,
  ]);

  const onFlyToActiveMeasurement = useCallback(() => {
    const activeMeasurementId = navigableMeasurements[currentIndex]?.id ?? null;
    if (!activeMeasurementId) return;
    onFlyToMeasurementById(activeMeasurementId);
  }, [currentIndex, navigableMeasurements, onFlyToMeasurementById]);

  return {
    currentIndex,
    totalEntries,
    onFlyToAllMeasurements,
    onFlyToActiveMeasurement,
    onPreviousMeasurement,
    onNextMeasurement,
  };
};
