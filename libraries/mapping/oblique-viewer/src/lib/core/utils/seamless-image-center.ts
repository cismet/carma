/** Full-sensor coordinates, with y increasing from the bottom to the top. */
export type SeamlessImagePoint = Readonly<{ x: number; y: number }>;

export const normalizeSeamlessCenterY = (value = 0.3): number =>
  Number.isFinite(value) ? Math.max(0.1, Math.min(0.9, value)) : 0.3;

/** Distances are comparable in normalized sensor coordinates; off-photo points cannot cover the target. */
export const seamlessImageCenterDistance = (
  point: SeamlessImagePoint | null,
  centerY = 0.3
): number | null => {
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  )
    return null;
  return Math.hypot(point.x - 0.5, point.y - normalizeSeamlessCenterY(centerY));
};
