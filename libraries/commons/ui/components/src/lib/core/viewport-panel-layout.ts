export const VIEWPORT_PANEL_SIDE = {
  LEFT: "left",
  TOP: "top",
  RIGHT: "right",
  BOTTOM: "bottom",
} as const;

export type ViewportPanelSide =
  (typeof VIEWPORT_PANEL_SIDE)[keyof typeof VIEWPORT_PANEL_SIDE];

export const VIEWPORT_PANEL_SIDES = [
  VIEWPORT_PANEL_SIDE.LEFT,
  VIEWPORT_PANEL_SIDE.TOP,
  VIEWPORT_PANEL_SIDE.RIGHT,
  VIEWPORT_PANEL_SIDE.BOTTOM,
] as const;

/** Pure occlusion geometry, shared by map hosts without a MapLibre dependency.
 * Replaces the inline layout calculation in the ViewportPaddingPanels story UI.
 * Opposing panels each get half the available budget, preserving the center.
 */
export const getViewportPanelLayout = ({
  width,
  height,
  sizes,
  enabled,
  gap = 16,
  minimumViewport = 32,
}: {
  width: number;
  height: number;
  sizes: Readonly<Record<ViewportPanelSide, number>>;
  enabled: Readonly<Record<ViewportPanelSide, boolean>>;
  gap?: number;
  minimumViewport?: number;
}) => {
  if (
    ![width, height, gap, minimumViewport, ...Object.values(sizes)].every(
      (value) => Number.isFinite(value) && value >= 0
    )
  ) {
    throw new RangeError(
      "Viewport panel dimensions must be finite and non-negative"
    );
  }
  const extents = { left: 0, top: 0, right: 0, bottom: 0 };
  const padding = { ...extents };
  for (const side of VIEWPORT_PANEL_SIDES) {
    const dimension =
      side === VIEWPORT_PANEL_SIDE.LEFT || side === VIEWPORT_PANEL_SIDE.RIGHT
        ? width
        : height;
    const budget = Math.max(0, (dimension - minimumViewport) / 2);
    extents[side] = Math.min(sizes[side], Math.max(0, budget - gap * 2));
    padding[side] = enabled[side]
      ? Math.min(budget, extents[side] + gap * 2)
      : 0;
  }
  return { extents, padding };
};
