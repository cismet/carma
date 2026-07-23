export const GEORADAR_LOD_STEPS = [1, 2, 4, 8, 16] as const;

export type GeoradarLodStep = (typeof GEORADAR_LOD_STEPS)[number];

export type GeoradarRenderSegment = {
  index: number;
  stationMinimumMeters: number;
  stationMaximumMeters: number;
  sliceStart: number;
  sliceEndExclusive: number;
};

export const buildGeoradarRenderSegments = (
  sliceMeters: readonly number[],
  targetLengthMeters: number
): GeoradarRenderSegment[] => {
  if (sliceMeters.length < 2 || targetLengthMeters <= 0) return [];
  const firstStation = sliceMeters[0];
  const finalSlice = sliceMeters.length - 1;
  const finalStation = sliceMeters[finalSlice];
  if (!Number.isFinite(firstStation) || finalStation <= firstStation) return [];

  const boundaries = [0];
  let candidate = 1;
  for (
    let station = firstStation + targetLengthMeters;
    station < finalStation;
    station += targetLengthMeters
  ) {
    while (candidate < finalSlice && sliceMeters[candidate] < station) {
      candidate += 1;
    }
    const previous = candidate - 1;
    const boundary =
      previous > boundaries.at(-1)! &&
      station - sliceMeters[previous] <= sliceMeters[candidate] - station
        ? previous
        : candidate;
    if (boundary > boundaries.at(-1)!) boundaries.push(boundary);
  }
  if (boundaries.at(-1) !== finalSlice) boundaries.push(finalSlice);

  return boundaries.slice(0, -1).map((sliceStart, index) => {
    const finalSegmentSlice = boundaries[index + 1];
    return {
      index,
      stationMinimumMeters: sliceMeters[sliceStart],
      stationMaximumMeters: sliceMeters[finalSegmentSlice],
      sliceStart,
      sliceEndExclusive: finalSegmentSlice + 1,
    };
  });
};

export const buildGeoradarLodSliceIndices = (
  sliceStart: number,
  sliceEndExclusive: number,
  step: GeoradarLodStep
) => {
  const finalSlice = sliceEndExclusive - 1;
  if (finalSlice < sliceStart) return [];
  const indices: number[] = [];
  for (let slice = sliceStart; slice <= finalSlice; slice += step) {
    indices.push(slice);
  }
  if (indices.at(-1) !== finalSlice) indices.push(finalSlice);
  return indices;
};

export const buildGeoradarLodSampleWindows = (
  selectedIndices: readonly number[],
  minimumInclusive: number,
  maximumExclusive: number
) => {
  const windows = selectedIndices.map((index, selectedIndex) => ({
    start:
      selectedIndex === 0
        ? minimumInclusive
        : Math.floor((selectedIndices[selectedIndex - 1] + index) / 2) + 1,
    end:
      selectedIndex === selectedIndices.length - 1
        ? maximumExclusive
        : Math.floor((index + selectedIndices[selectedIndex + 1]) / 2) + 1,
  }));
  if (windows.length < 3) return windows;

  const firstIndex = selectedIndices[0];
  const finalIndex = selectedIndices.at(-1)!;
  windows[0] = { start: firstIndex, end: firstIndex + 1 };
  windows[1].start = firstIndex + 1;
  windows.at(-2)!.end = finalIndex;
  windows[windows.length - 1] = {
    start: finalIndex,
    end: finalIndex + 1,
  };
  return windows;
};

export const selectGeoradarLodStep = ({
  maximumNativeIntervalPixels,
  targetIntervalPixels,
  previousStep,
  hysteresis = 0.18,
}: {
  maximumNativeIntervalPixels: number;
  targetIntervalPixels: number;
  previousStep?: GeoradarLodStep;
  hysteresis?: number;
}): GeoradarLodStep => {
  if (
    !Number.isFinite(maximumNativeIntervalPixels) ||
    maximumNativeIntervalPixels <= 0 ||
    !Number.isFinite(targetIntervalPixels) ||
    targetIntervalPixels <= 0
  ) {
    return GEORADAR_LOD_STEPS.at(-1)!;
  }

  const resolve = (target: number) => {
    let selected: GeoradarLodStep = 1;
    for (const step of GEORADAR_LOD_STEPS) {
      if (maximumNativeIntervalPixels * step > target) break;
      selected = step;
    }
    return selected;
  };
  if (previousStep === undefined) return resolve(targetIntervalPixels);

  const currentIntervalPixels = maximumNativeIntervalPixels * previousStep;
  if (currentIntervalPixels > targetIntervalPixels * (1 + hysteresis)) {
    return resolve(targetIntervalPixels);
  }
  const coarser = resolve(targetIntervalPixels * (1 - hysteresis));
  return coarser > previousStep ? coarser : previousStep;
};
