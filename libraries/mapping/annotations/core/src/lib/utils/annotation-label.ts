import type { AnnotationLabelAppearance } from "../types/annotation-label";

type MeasurementWithLabelAppearance = {
  labelAppearance?: AnnotationLabelAppearance;
};

export const applyLabelAppearance = <
  TMeasurement extends MeasurementWithLabelAppearance
>(
  measurement: TMeasurement,
  appearance: AnnotationLabelAppearance | undefined
): TMeasurement => {
  if (!appearance) {
    const nextMeasurement = { ...measurement } as TMeasurement & {
      labelAppearance?: AnnotationLabelAppearance;
    };
    delete nextMeasurement.labelAppearance;
    return nextMeasurement as TMeasurement;
  }

  return {
    ...measurement,
    labelAppearance: appearance,
  };
};
