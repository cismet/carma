/**
 * A position on the display: the EPSG:3857 rectangle `[minX, minY, maxX, maxY]`
 * the outlet fits its window to, the same four numbers its `?bounds=` takes.
 * A rectangle rather than a center and a zoom, because the display window's
 * size is the display's business: it fits whatever it is given.
 */
export type Bounds3857 = readonly [number, number, number, number];

// EPSG:3857 validity, used only to reject nonsense before it reaches the map
const MAX_WEB_MERCATOR_X = 20037508.343;
const MAX_WEB_MERCATOR_Y = 20048966.105;

export const isBounds3857 = (value: unknown): value is Bounds3857 => {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((part) => typeof part === "number" && Number.isFinite(part))
  ) {
    return false;
  }
  const [minX, minY, maxX, maxY] = value as number[];
  return (
    minX < maxX &&
    minY < maxY &&
    Math.abs(minX) <= MAX_WEB_MERCATOR_X &&
    Math.abs(maxX) <= MAX_WEB_MERCATOR_X &&
    Math.abs(minY) <= MAX_WEB_MERCATOR_Y &&
    Math.abs(maxY) <= MAX_WEB_MERCATOR_Y
  );
};

/** what a rectangle is compared by, so re-delivering the same one changes nothing */
export const boundsKey = (bounds: Bounds3857): string => bounds.join(",");
