import { useCallback, type Dispatch, type SetStateAction } from "react";

type AnnotationLabelAppearanceLike = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};

type BaseAnnotationEntry = {
  id: string;
  name?: string;
  locked?: boolean;
};

type UseMeasurementEntryMutationsParams<
  TMeasurement extends BaseAnnotationEntry,
  TAppearance extends AnnotationLabelAppearanceLike
> = {
  setAnnotations: Dispatch<SetStateAction<TMeasurement[]>>;
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

export const useAnnotationEntryMutations = <
  TMeasurement extends BaseAnnotationEntry,
  TAppearance extends AnnotationLabelAppearanceLike
>({
  setAnnotations,
  isLabelAppearanceTarget,
  getLabelAppearance,
  applyLabelAppearance,
  normalizeLabelAppearance,
}: UseMeasurementEntryMutationsParams<TMeasurement, TAppearance>) => {
  const updateAnnotationNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();

      setAnnotations((prev) => {
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
    [setAnnotations]
  );

  const updateLabelAppearanceById = useCallback(
    (id: string, appearance: TAppearance | undefined) => {
      const normalizedAppearance = normalizeLabelAppearance(appearance);

      setAnnotations((prev) => {
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
      setAnnotations,
    ]
  );

  const toggleAnnotationLockById = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
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
    [setAnnotations]
  );

  return {
    updateAnnotationNameById,
    updateLabelAppearanceById,
    toggleAnnotationLockById,
  };
};
