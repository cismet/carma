import {
  tileRangeFor,
  type ImageLevelStack,
  type ImageView,
} from "@carma-commons/image-pyramid";

/** First complete resident preview, independent of the requested detail level. */
export const residentPreviewLevel = (
  stack: ImageLevelStack,
  view: ImageView
): number | undefined => {
  const pyramid = stack.pyramid;
  const layers = stack.plan?.layers;
  const { x, y, width, height } = view.visible;
  if (
    !pyramid ||
    !layers ||
    width <= 0 ||
    height <= 0 ||
    ![x, y, width, height].every(Number.isFinite)
  )
    return undefined;
  // Only levels the current composer can actually draw can unblock a flight.
  const drawable = pyramid.levels.filter((level) =>
    layers.includes(level.level)
  );
  for (const level of drawable.sort((a, b) => b.level - a.level)) {
    const range = tileRangeFor(level, pyramid.native, view.visible);
    if (range.col1 <= range.col0 || range.row1 <= range.row0) continue;
    let complete = true;
    for (let row = range.row0; complete && row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++)
        if (!stack.isResident(level.level, col, row)) {
          complete = false;
          break;
        }
    if (complete) return level.level;
  }
  return undefined;
};
