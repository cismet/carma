import { along, bearing as turfBearing, length, lineString } from "@turf/turf";

import type { GeolocationSource } from "@carma-mapping/contexts";

/**
 * A pretend GPS receiver: the `Geolocation` calls the locate context makes,
 * answered from a point that either stands still or moves along a line.
 *
 * Time is real: a drive advances by `speed * elapsed` on every tick, so a
 * slow tab or a long interval does not slow the pretend car down, it only
 * makes the fixes sparser. The scatter is what a real receiver does at rest
 * and what the routing camera's snapping is for, so it is on by default and
 * a config knob away from off.
 */
export type FakeDevice = GeolocationSource & {
  /** stand still there */
  stand: (position: [number, number]) => void;
  /** go along the line from its start, at `speed` meters per second */
  drive: (coordinates: [number, number][], speed: number) => void;
  /**
   * Put the drive at this fraction of the line, 0 its start and 1 its end,
   * and tell every watcher at once rather than on the next tick. Does nothing
   * while standing.
   */
  seek: (fraction: number) => void;
  /** hold the drive where it is; the fixes keep coming, from the same spot */
  setPaused: (paused: boolean) => void;
  /** stop every watch; the device answers nothing after this */
  dispose: () => void;
};

export type FakeDeviceOptions = {
  intervalMs: number;
  jitterMeters: number;
  accuracyMeters: number;
};

type Motion =
  | { kind: "stand"; at: [number, number] }
  | {
      kind: "drive";
      line: ReturnType<typeof lineString>;
      total: number;
      along: number;
      speed: number;
      lastTick: number;
      heading: number;
    };

const METERS = { units: "meters" } as const;
const METERS_PER_DEGREE_LAT = 111320;

/** the point `meters` along the line */
const alongLine = (line: ReturnType<typeof lineString>, meters: number) =>
  along(line, meters, METERS);

const scatter = (
  [lng, lat]: [number, number],
  meters: number
): [number, number] => {
  if (meters <= 0) {
    return [lng, lat];
  }
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * meters;
  const north = Math.cos(angle) * distance;
  const east = Math.sin(angle) * distance;
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  return [lng + east / lngScale, lat + north / METERS_PER_DEGREE_LAT];
};

/**
 * `GeolocationPosition` and its coordinates are interfaces the browser
 * constructs; a plain object with the same fields satisfies every reader.
 */
const makePosition = (
  [lng, lat]: [number, number],
  accuracy: number,
  heading: number | null,
  speed: number | null
): GeolocationPosition => {
  const coords: GeolocationCoordinates = {
    latitude: lat,
    longitude: lng,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading,
    speed,
    toJSON() {
      return { ...this };
    },
  };
  return {
    coords,
    timestamp: Date.now(),
    toJSON() {
      return { coords: this.coords, timestamp: this.timestamp };
    },
  };
};

export const createFakeDevice = ({
  intervalMs,
  jitterMeters,
  accuracyMeters,
}: FakeDeviceOptions): FakeDevice => {
  let motion: Motion = { kind: "stand", at: [0, 0] };
  let paused = false;
  const watches = new Map<
    number,
    { timer: ReturnType<typeof setInterval>; success: PositionCallback }
  >();
  let nextWatchId = 1;
  let disposed = false;

  const fix = (): GeolocationPosition => {
    if (motion.kind === "stand") {
      return makePosition(
        scatter(motion.at, jitterMeters),
        accuracyMeters,
        null,
        0
      );
    }
    const now = Date.now();
    // a paused drive lets the clock run without going anywhere, so resuming
    // continues from the spot rather than jumping by the time held
    const elapsed = paused ? 0 : (now - motion.lastTick) / 1000;
    motion.lastTick = now;
    const before = motion.along;
    motion.along = Math.min(motion.total, before + motion.speed * elapsed);
    const here = alongLine(motion.line, motion.along);
    if (motion.along > before) {
      const there = alongLine(motion.line, before);
      motion.heading = (turfBearing(there, here) + 360) % 360;
    }
    const arrived = motion.along >= motion.total;
    return makePosition(
      scatter(here.geometry.coordinates as [number, number], jitterMeters),
      accuracyMeters,
      motion.heading,
      arrived ? 0 : motion.speed
    );
  };

  return {
    stand: (position) => {
      motion = { kind: "stand", at: position };
    },
    drive: (coordinates, speed) => {
      if (coordinates.length < 2) {
        // nothing to go along: stand where the line is, or where we are
        const { longitude, latitude } = fix().coords;
        motion = { kind: "stand", at: coordinates[0] ?? [longitude, latitude] };
        return;
      }
      const line = lineString(coordinates);
      motion = {
        kind: "drive",
        line,
        total: length(line, METERS),
        along: 0,
        speed,
        lastTick: Date.now(),
        heading: (turfBearing(coordinates[0], coordinates[1]) + 360) % 360,
      };
    },
    seek: (fraction) => {
      if (motion.kind !== "drive" || disposed) {
        return;
      }
      const along = Math.min(1, Math.max(0, fraction)) * motion.total;
      // the heading is read off the stretch just behind the new spot, the
      // way a tick reads it off the stretch it just went along
      const behind = Math.max(0, along - 1);
      if (along > behind) {
        motion.heading =
          (turfBearing(
            alongLine(motion.line, behind),
            alongLine(motion.line, along)
          ) +
            360) %
          360;
      }
      motion.along = along;
      motion.lastTick = Date.now();
      const position = fix();
      for (const { success } of watches.values()) {
        success(position);
      }
    },
    setPaused: (next) => {
      paused = next;
    },
    getCurrentPosition: (success) => {
      if (disposed) {
        return;
      }
      success(fix());
    },
    watchPosition: (success) => {
      const id = nextWatchId++;
      if (disposed) {
        return id;
      }
      watches.set(id, {
        timer: setInterval(() => success(fix()), intervalMs),
        success,
      });
      return id;
    },
    clearWatch: (id) => {
      const watch = watches.get(id);
      if (watch !== undefined) {
        clearInterval(watch.timer);
        watches.delete(id);
      }
    },
    dispose: () => {
      disposed = true;
      for (const { timer } of watches.values()) {
        clearInterval(timer);
      }
      watches.clear();
    },
  };
};
