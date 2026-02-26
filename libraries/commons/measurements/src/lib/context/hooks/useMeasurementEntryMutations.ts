import { useCallback, type Dispatch, type SetStateAction } from "react";

type MeasurementLabelAppearanceLike = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};

type BaseMeasurementEntry = {
  id: string;
  name?: string;
  locked?: boolean;
};

type UseMeasurementEntryMutationsParams<
  TMeasurement extends BaseMeasurementEntry,
  TAppearance extends MeasurementLabelAppearanceLike
> = {
  setMeasurements: Dispatch<SetStateAction<TMeasurement[]>>;
  isLabelAppearanceTarget: (measurement: TMeasurement) => boolean;
  getLabelAppearance: (measurement: TMeasurement) => TAppearance | undefined;
  applyLabelAppearance: (
    measurement: TMeasurement,
    appearance: TAppearance | undefined
  ) => TMeasurement;
  normalizeLabelAppearance: (
    appearance?: TAppearance
  ) => TAppearance | undefined;
};

export const useMeasurementEntryMutations = <
  TMeasurement extends BaseMeasurementEntry,
  TAppearance extends MeasurementLabelAppearanceLike
>({
  setMeasurements,
  isLabelAppearanceTarget,
  getLabelAppearance,
  applyLabelAppearance,
  normalizeLabelAppearance,
}: UseMeasurementEntryMutationsParams<TMeasurement, TAppearance>) => {
  const updateMeasurementNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();

      setMeasurements((prev) => {
        const hasChanged = prev.some(
          (measurement) =>
            measurement.id === id && (measurement.name ?? "") !== nextName
        );

        if (!hasChanged) {
          return prev;
        }

        return prev.map((measurement) =>
          measurement.id === id
            ? { ...measurement, name: nextName }
            : measurement
        );
      });
    },
    [setMeasurements]
  );

  const updateLabelAppearanceById = useCallback(
    (id: string, appearance: TAppearance | undefined) => {
      const normalizedAppearance = normalizeLabelAppearance(appearance);

      setMeasurements((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (!isLabelAppearanceTarget(measurement) || measurement.id !== id) {
            return measurement;
          }
          const currentAppearance = normalizeLabelAppearance(
            getLabelAppearance(measurement)
          );
          const isEqual =
            currentAppearance?.fontSizePx ===
              normalizedAppearance?.fontSizePx &&
            currentAppearance?.backgroundColor ===
              normalizedAppearance?.backgroundColor &&
            currentAppearance?.textColor === normalizedAppearance?.textColor;
          if (isEqual) {
            return measurement;
          }
          hasChanged = true;
          return applyLabelAppearance(measurement, normalizedAppearance);
        });
        return hasChanged ? next : prev;
      });
    },
    [
      applyLabelAppearance,
      getLabelAppearance,
      isLabelAppearanceTarget,
      normalizeLabelAppearance,
      setMeasurements,
    ]
  );

  const toggleMeasurementLockById = useCallback(
    (id: string) => {
      setMeasurements((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (measurement.id !== id) return measurement;
          hasChanged = true;
          return {
            ...measurement,
            locked: !measurement.locked,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    [setMeasurements]
  );

  return {
    updateMeasurementNameById,
    updateLabelAppearanceById,
    toggleMeasurementLockById,
  };
};
