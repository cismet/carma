import type { Map as MapLibreMap } from "maplibre-gl";

import type { Car, Fleet } from "./fleet";
import type { Track } from "./track";

/**
 * The clock both renderers run on, and the judge of when a frame is worth
 * drawing.
 *
 * Moving the fleet on is cheap, a few numbers per vehicle, so it happens on
 * every animation frame. Drawing is not: a repaint redraws the whole map, and
 * every repaint ends in an `idle` event that a good part of the app listens
 * to. So a frame is drawn only once some vehicle has moved far enough to be
 * seen, about half a pixel at the current zoom, and never while the track is
 * out of view. A vehicle at 36 km/h seen from a city-wide zoom moves a few
 * pixels a second, and gets that many frames instead of sixty.
 *
 * The loop owns its animation frame. A stopped loop leaves nothing scheduled,
 * so a held or hidden fleet costs nothing.
 */

/** a step smaller than this, in screen pixels, is not worth a frame */
export const PIXEL_STEP = 0.5;
/** metres per pixel at zoom 0 on the equator, for MapLibre's 512 px tiles */
const EQUATOR_METERS_PER_PIXEL = 78271.517;
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;
const METERS_PER_LAT = 111320;

/** how many metres one screen pixel covers at `zoom`, at latitude `lat` */
export const metersPerPixel = (zoom: number, lat: number): number =>
  (EQUATOR_METERS_PER_PIXEL * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** what a drawn frame showed of one vehicle */
export type DrawnCar = Pick<Car, "distance" | "direction" | "visible">;

export const snapshotOf = (cars: readonly Car[]): DrawnCar[] =>
  cars.map(({ distance, direction, visible }) => ({
    distance,
    direction,
    visible,
  }));

/**
 * Whether the fleet would look different from the frame that showed `drawn`:
 * a vehicle came or went, turned round, or moved `meters` or more along the
 * track. On a closed track the short way round counts, so a vehicle crossing
 * the seam has not moved the whole track length.
 */
export const hasVisiblyMoved = (
  drawn: readonly DrawnCar[],
  cars: readonly Car[],
  meters: number,
  track: Pick<Track, "length" | "closed">
): boolean => {
  if (drawn.length !== cars.length) return true;
  for (let index = 0; index < cars.length; index++) {
    const before = drawn[index];
    const car = cars[index];
    if (before.visible !== car.visible || before.direction !== car.direction) {
      return true;
    }
    if (!car.visible) continue;
    let gap = Math.abs(car.distance - before.distance);
    if (track.closed) gap = Math.min(gap, track.length - gap);
    if (gap >= meters) return true;
  }
  return false;
};

/** west, south, east, north */
export type LonLatBounds = [number, number, number, number];

/** the track's extent, grown by `padMeters` on every side */
export const trackBounds = (
  track: Pick<Track, "points" | "metersPerLon">,
  padMeters: number
): LonLatBounds => {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of track.points) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const padLon = padMeters / track.metersPerLon;
  const padLat = padMeters / METERS_PER_LAT;
  return [west - padLon, south - padLat, east + padLon, north + padLat];
};

export const boundsOverlap = (a: LonLatBounds, b: LonLatBounds): boolean =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

export type FleetLoopOptions = {
  map: MapLibreMap;
  track: Track;
  fleet: Fleet;
  /**
   * How far a vehicle can reach beyond the track line, in metres: half a car
   * length on the flat map, more where it hangs in the air. A track just
   * outside the view still counts as in it by this much.
   */
  padMeters: number;
  /** after every step of the fleet, drawn or not: selection, fleet size */
  onAdvance: () => void;
  /** the fleet moved visibly: rebuild what is drawn and ask the map for a frame */
  onDraw: () => void;
};

export type FleetLoop = {
  /** run the clock; the first frame is always drawn */
  start: () => void;
  stop: () => void;
  destroy: () => void;
};

export const createFleetLoop = ({
  map,
  track,
  fleet,
  padMeters,
  onAdvance,
  onDraw,
}: FleetLoopOptions): FleetLoop => {
  const bounds = trackBounds(track, padMeters);
  const trackLat = track.points[0][1];

  let frame: number | null = null;
  let lastTimestamp: number | null = null;
  /** the fleet as the last drawn frame showed it; null draws the next frame */
  let drawn: DrawnCar[] | null = null;
  let inView = true;
  let stepMeters = 0;

  // the view only changes when the map moves, so it is judged there and not
  // on every frame
  const measureView = (): void => {
    const view = map.getBounds();
    inView = boundsOverlap(bounds, [
      view.getWest(),
      view.getSouth(),
      view.getEast(),
      view.getNorth(),
    ]);
    stepMeters = metersPerPixel(map.getZoom(), trackLat) * PIXEL_STEP;
  };

  const tick = (timestamp: number): void => {
    frame = null;
    const seconds =
      lastTimestamp === null
        ? 0
        : Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_SECONDS);
    lastTimestamp = timestamp;
    fleet.advance(seconds);
    onAdvance();
    if (
      inView &&
      (drawn === null ||
        hasVisiblyMoved(drawn, fleet.cars, stepMeters, track))
    ) {
      drawn = snapshotOf(fleet.cars);
      onDraw();
    }
    frame = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTimestamp = null;
  };

  map.on("move", measureView);
  map.on("resize", measureView);

  return {
    start: () => {
      if (frame !== null) return;
      lastTimestamp = null;
      drawn = null;
      measureView();
      frame = requestAnimationFrame(tick);
    },
    stop,
    destroy: () => {
      stop();
      map.off("move", measureView);
      map.off("resize", measureView);
    },
  };
};
