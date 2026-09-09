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
  const watches = new Map<number, ReturnType<typeof setInterval>>();
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
    const elapsed = (now - motion.lastTick) / 1000;
    motion.lastTick = now;
    const before = motion.along;
    motion.along = Math.min(motion.total, before + motion.speed * elapsed);
    const here = along(motion.line, motion.along, METERS);
    if (motion.along > before) {
      const there = along(motion.line, before, METERS);
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
      watches.set(
        id,
        setInterval(() => success(fix()), intervalMs)
      );
      return id;
    },
    clearWatch: (id) => {
      const timer = watches.get(id);
      if (timer !== undefined) {
        clearInterval(timer);
        watches.delete(id);
      }
    },
    dispose: () => {
      disposed = true;
      for (const timer of watches.values()) {
        clearInterval(timer);
      }
      watches.clear();
    },
  };
};
