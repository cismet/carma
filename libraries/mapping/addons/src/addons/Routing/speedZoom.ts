import type { RouteMode } from "./routeMode";

/**
 * The camera's zoom by how fast the user goes: close in in town, further out
 * on the motorway, where the next exit is a kilometer ahead and zoom 18 shows
 * a hundred meters of asphalt. Car and bike only; on foot the view stays
 * close, since nothing on foot is fast enough to outrun it.
 *
 * A band is a zoom up to a speed; the last band has no upper end. The band
 * changes only past a margin (`HYSTERESIS_KMH`) beyond its edge, so a car
 * driving right at 30 km/h does not zoom in and out with every fix. Close to
 * a turn the view goes back to the closest band, so a junction is always seen
 * close up, whatever the speed before it.
 */
export type ZoomBand = {
  /** the band holds below this speed, in km/h; omitted on the last band */
  belowKmh?: number;
  zoom: number;
};

export type SpeedZoomConfig = false | Partial<Record<RouteMode, ZoomBand[]>>;

export const DEFAULT_SPEED_ZOOM: Partial<Record<RouteMode, ZoomBand[]>> = {
  car: [{ belowKmh: 30, zoom: 18 }, { belowKmh: 60, zoom: 17 }, { zoom: 16 }],
  bike: [{ belowKmh: 20, zoom: 18 }, { zoom: 17 }],
};

/** how far past a band's edge the speed has to go before the band changes */
export const HYSTERESIS_KMH = 5;

/** closer than this to the next turn, the view goes back to the closest band */
export const TURN_CLOSE_UP_METERS = 150;

/**
 * How much of a new speed reading goes into the smoothed one; the rest is
 * the speed so far. A fix's speed jumps by a few km/h between fixes, and the
 * zoom should follow the pace, not the noise.
 */
const SMOOTHING = 0.3;

export const smoothSpeed = (previous: number | null, next: number) =>
  previous === null ? next : previous + (next - previous) * SMOOTHING;

/** the bands for a mode, or null where the zoom does not follow the speed */
export const zoomBandsOf = (
  config: SpeedZoomConfig | undefined,
  mode: RouteMode | undefined
): ZoomBand[] | null => {
  if (config === false || !mode) {
    return null;
  }
  const bands = config?.[mode] ?? DEFAULT_SPEED_ZOOM[mode];
  return bands && bands.length > 0 ? bands : null;
};

/**
 * The band for a speed, given the band the camera is in now. Up a band only
 * once the speed is past the current band's edge plus the margin, down only
 * once it is below the lower band's edge minus the margin.
 */
export const zoomBandIndex = (
  bands: ZoomBand[],
  kmh: number,
  current: number
): number => {
  let index = Math.min(Math.max(current, 0), bands.length - 1);
  while (
    index < bands.length - 1 &&
    kmh > (bands[index].belowKmh ?? Infinity) + HYSTERESIS_KMH
  ) {
    index++;
  }
  while (
    index > 0 &&
    kmh < (bands[index - 1].belowKmh ?? Infinity) - HYSTERESIS_KMH
  ) {
    index--;
  }
  return index;
};
