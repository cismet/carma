export const annotationGeometryDefaults = Object.freeze({
  verticalOffsetEpsilonMeters: 1e-9,
});

export const hasSignificantVerticalOffsetMeters = (
  verticalOffsetMeters: number,
  epsilonMeters = annotationGeometryDefaults.verticalOffsetEpsilonMeters
): boolean => Math.abs(verticalOffsetMeters) > epsilonMeters;
