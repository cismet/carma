export const georadarStationAtClipUnit = (
  sliceMeters: readonly number[],
  unit: number
) => {
  if (sliceMeters.length === 0) return 0;
  const sliceCoordinate = Math.min(
    sliceMeters.length - 1,
    Math.max(0, unit * sliceMeters.length - 0.5)
  );
  const minimumIndex = Math.floor(sliceCoordinate);
  const maximumIndex = Math.min(sliceMeters.length - 1, minimumIndex + 1);
  const minimum = sliceMeters[minimumIndex] ?? 0;
  const maximum = sliceMeters[maximumIndex] ?? sliceMeters.at(-1) ?? minimum;
  return minimum + (maximum - minimum) * (sliceCoordinate - minimumIndex);
};
