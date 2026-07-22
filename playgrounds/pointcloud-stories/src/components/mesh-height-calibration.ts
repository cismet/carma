export type MeshHeightSample = {
  annotationId: string;
  controlPointId: number;
  sampledEllipsoidalHeight: number;
  officialEllipsoidalHeight: number;
};

export type MeshHeightResidual = MeshHeightSample & {
  residualMeters: number;
  absoluteResidualMeters: number;
};

export type MeshHeightErrorMetrics = {
  count: number;
  sampleCount: number;
  meanBiasMeters: number;
  meanAbsoluteErrorMeters: number;
  rootMeanSquareErrorMeters: number;
  standardDeviationMeters: number;
  minimumResidualMeters: number;
  maximumResidualMeters: number;
};

export const averageMeshHeightSamplesByControlPoint = (
  samples: readonly MeshHeightSample[]
): MeshHeightSample[] => {
  const groups = new Map<
    number,
    { sampledSum: number; officialSum: number; count: number }
  >();
  for (const sample of samples) {
    const group = groups.get(sample.controlPointId) ?? {
      sampledSum: 0,
      officialSum: 0,
      count: 0,
    };
    group.sampledSum += sample.sampledEllipsoidalHeight;
    group.officialSum += sample.officialEllipsoidalHeight;
    group.count += 1;
    groups.set(sample.controlPointId, group);
  }
  return [...groups.entries()].map(([controlPointId, group]) => ({
    annotationId: `control-${controlPointId}`,
    controlPointId,
    sampledEllipsoidalHeight: group.sampledSum / group.count,
    officialEllipsoidalHeight: group.officialSum / group.count,
  }));
};

export const calculateMeshHeightResiduals = (
  samples: readonly MeshHeightSample[]
): MeshHeightResidual[] =>
  samples.map((sample) => {
    const residualMeters =
      sample.sampledEllipsoidalHeight - sample.officialEllipsoidalHeight;
    return {
      ...sample,
      residualMeters,
      absoluteResidualMeters: Math.abs(residualMeters),
    };
  });

export const calculateMeshHeightErrorMetrics = (
  samples: readonly MeshHeightSample[]
): MeshHeightErrorMetrics | null => {
  const averagedSamples = averageMeshHeightSamplesByControlPoint(samples);
  const residuals = calculateMeshHeightResiduals(averagedSamples);
  if (residuals.length === 0) return null;
  const count = residuals.length;
  const meanBiasMeters =
    residuals.reduce((sum, sample) => sum + sample.residualMeters, 0) / count;
  const meanAbsoluteErrorMeters =
    residuals.reduce(
      (sum, sample) => sum + sample.absoluteResidualMeters,
      0
    ) / count;
  const rootMeanSquareErrorMeters = Math.sqrt(
    residuals.reduce(
      (sum, sample) => sum + sample.residualMeters ** 2,
      0
    ) / count
  );
  const standardDeviationMeters = Math.sqrt(
    residuals.reduce(
      (sum, sample) => sum + (sample.residualMeters - meanBiasMeters) ** 2,
      0
    ) / count
  );
  return {
    count,
    sampleCount: samples.length,
    meanBiasMeters,
    meanAbsoluteErrorMeters,
    rootMeanSquareErrorMeters,
    standardDeviationMeters,
    minimumResidualMeters: Math.min(
      ...residuals.map(({ residualMeters }) => residualMeters)
    ),
    maximumResidualMeters: Math.max(
      ...residuals.map(({ residualMeters }) => residualMeters)
    ),
  };
};
