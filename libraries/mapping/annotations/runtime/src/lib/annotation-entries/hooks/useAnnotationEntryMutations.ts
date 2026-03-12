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

type UseAnnotationEntryMutationsParams<
  TAnnotationEntry extends BaseAnnotationEntry,
  TAppearance extends AnnotationLabelAppearanceLike
> = {
  setAnnotations: Dispatch<SetStateAction<TAnnotationEntry[]>>;
  isLabelAppearanceTarget: (annotation: TAnnotationEntry) => boolean;
  getLabelAppearance: (annotation: TAnnotationEntry) => TAppearance | undefined;
  applyLabelAppearance: (
    annotation: TAnnotationEntry,
    appearance: TAppearance | undefined
  ) => TAnnotationEntry;
  normalizeLabelAppearance: (
    appearance?: TAppearance
  ) => TAppearance | undefined;
};

export const useAnnotationEntryMutations = <
  TAnnotationEntry extends BaseAnnotationEntry,
  TAppearance extends AnnotationLabelAppearanceLike
>({
  setAnnotations,
  isLabelAppearanceTarget,
  getLabelAppearance,
  applyLabelAppearance,
  normalizeLabelAppearance,
}: UseAnnotationEntryMutationsParams<TAnnotationEntry, TAppearance>) => {
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

  return {
    updateLabelAppearanceById,
  };
};
