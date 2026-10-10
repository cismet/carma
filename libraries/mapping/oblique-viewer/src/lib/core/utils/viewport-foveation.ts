/** Screen-space demand in actual output-buffer pixels; DPR is already included. */
export const viewportFoveatedTarget = ({
  density,
  point,
  viewport,
  cellRadiusPixels = 0,
}: {
  density: number;
  point?: { x: number; y: number };
  viewport: { width: number; height: number };
  /** Conservative radius around the sample, in the same buffer-pixel units. */
  cellRadiusPixels?: number;
}): { density: number; pixelError: number; focusDistance: number } => {
  const valid =
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    viewport.width > 0 &&
    viewport.height > 0 &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    cellRadiusPixels >= 0 &&
    Number.isFinite(cellRadiusPixels);
  const halfDiagonal = Math.hypot(viewport.width / 2, viewport.height / 2);
  const focusDistance =
    valid && Number.isFinite(halfDiagonal)
      ? Math.min(
          1,
          Math.max(
            0,
            Math.hypot(
              point.x - viewport.width / 2,
              point.y - viewport.height / 2
            ) - cellRadiusPixels
          ) / halfDiagonal
        )
      : 0;
  const t = Math.max(0, (focusDistance - 0.2) / 0.8);
  const pixelError = 1 + 3 * t * t * (3 - 2 * t);
  // An invalid source demand cannot justify reducing detail.
  const sourceDensity = Number.isFinite(density) && density >= 0 ? density : 1;
  return {
    density: Math.min(1, sourceDensity / pixelError),
    pixelError,
    focusDistance,
  };
};
