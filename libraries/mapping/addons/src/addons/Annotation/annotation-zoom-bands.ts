/** the configured scale window as factors, e.g. 100–400 % becomes 1 and 4 */
export type ZoomScales = { min: number; max: number };

/**
 * How many zoom levels one drawing covers. The scene doubles per map zoom
 * level, so a 100–400 % window is two levels wide.
 */
export const spanOf = ({ min, max }: ZoomScales) => Math.log2(max / min);

/**
 * The band a map zoom falls into. Bands are half open, `[low, low + span)`,
 * counted from `origin` — the zoom the very first drawing was started at — so
 * they tile the whole axis with no gap and no overlap, and go negative below
 * the origin.
 */
export const bandOf = (zoom: number, origin: number, span: number) =>
  Math.floor((zoom - origin) / span);

/**
 * The zoom a band's drawing is anchored at, i.e. where its scene renders at
 * 100 %. It sits `min` away from the band's low edge, so inside the band the
 * drawing is never shown below the configured minimum scale — that is what
 * keeps strokes from thinning out, and caps them at `max`.
 */
export const anchorZoomOf = (
  band: number,
  origin: number,
  span: number,
  min: number
) => origin + band * span - Math.log2(min);

/** the grid the first drawing sets up, from the anchor it was started at */
export const originOf = (anchorZoom: number, min: number) =>
  anchorZoom + Math.log2(min);
