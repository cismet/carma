import {
  along,
  bearing as turfBearing,
  destination,
  length,
  lineString,
  nearestPointOnLine,
  point,
} from "@turf/turf";

import type { GeolocationSource } from "@carma-mapping/contexts";

import type { RecordedFix } from "./gpsTrack";
import { createReception, type SignalPreset } from "./signalPresets";

/**
 * A pretend GPS receiver: the `Geolocation` calls the locate context makes,
 * answered from a point that stands still, moves along a line, replays a
 * recorded track, or passes the real device through.
 *
 * Time is real: a drive advances by `speed * elapsed` on every tick, so a
 * slow tab or a long interval does not slow the pretend car down, it only
 * makes the fixes sparser. What the receiver makes of the true position (the
 * scatter, the jumps, an outage) is the signal preset's (`signalPresets.ts`).
 *
 * One source for all of it: the locate context asks the slot for its source
 * only when locating starts, so switching to the real device for a recording
 * happens in here, without the context having to start over.
 */
export type FakeDevice = GeolocationSource & {
  /** stand still there */
  stand: (position: [number, number]) => void;
  /**
   * go along the line at `speed` meters per second, from the point on it
   * nearest to where the device is when that is close (a reroute, a switch
   * back onto an earlier route), from its start otherwise
   */
  drive: (coordinates: [number, number][], speed: number) => void;
  /**
   * Play a recorded track back: each fix as it was recorded (place, accuracy,
   * speed, heading), at its own time from the start, scaled by
   * `setTimeFactor`. No scatter and no signal preset: the track's own noise is
   * the point. Stays at the last fix once it is over.
   */
  replay: (fixes: RecordedFix[]) => void;
  /**
   * Hand the real device's fixes through as they come, and each one to
   * `onFix` as well, for recording. Ended by the next `stand`, `drive` or
   * `replay`.
   */
  live: (onFix: (position: GeolocationPosition) => void) => void;
  /**
   * Put the drive at this fraction of the line, 0 its start and 1 its end,
   * and tell every watcher at once rather than on the next tick; a replay at
   * this fraction of the track's time. Off on a detour, it goes back onto the
   * line it left. Does nothing while standing or live.
   */
  seek: (fraction: number) => void;
  /**
   * Leave the line: turn by `turnDegrees` (positive is right) from where the
   * device is heading and go straight on at the same pace, off every road,
   * which is what makes a navigation reroute. Called again on a detour, it
   * turns again. Does nothing while not driving.
   */
  detour: (turnDegrees: number) => void;
  /** hold the drive or replay where it is; the fixes keep coming, from the same spot */
  setPaused: (paused: boolean) => void;
  /** change the pace of the drive in flight, meters per second */
  setSpeed: (speed: number) => void;
  /** how much faster than recorded a replay runs; 1 is as recorded */
  setTimeFactor: (factor: number) => void;
  /** what the receiver makes of the true position; see `signalPresets.ts` */
  setSignal: (preset: SignalPreset) => void;
  /** stop every watch; the device answers nothing after this */
  dispose: () => void;
};

/** how close the device has to be to a new line to pick it up where it is */
const PICK_UP_METERS = 100;

export type FakeDeviceOptions = {
  intervalMs: number;
  /** the preset the device starts with */
  signal: SignalPreset;
};

type Drive = {
  kind: "drive";
  line: ReturnType<typeof lineString>;
  total: number;
  along: number;
  speed: number;
  lastTick: number;
  heading: number;
};

type Replay = {
  kind: "replay";
  fixes: RecordedFix[];
  /** ms of track time played so far */
  elapsed: number;
  lastTick: number;
};

type Live = {
  kind: "live";
  watchId: number | null;
  last: GeolocationPosition | null;
};

type Motion =
  | { kind: "stand"; at: [number, number] }
  | Drive
  | {
      /** straight on along a bearing, off the line */
      kind: "heading";
      at: [number, number];
      bearing: number;
      speed: number;
      lastTick: number;
      /** the drive it left, for `seek` to go back onto */
      resume: Drive;
    }
  | Replay
  | Live;

const METERS = { units: "meters" } as const;

/** the point `meters` along the line */
const alongLine = (line: ReturnType<typeof lineString>, meters: number) =>
  along(line, meters, METERS);

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

/** the last fix of a track at or before `elapsed` ms */
const replayIndex = (fixes: RecordedFix[], elapsed: number) => {
  let index = 0;
  while (index + 1 < fixes.length && fixes[index + 1].t <= elapsed) {
    index++;
  }
  return index;
};

export const createFakeDevice = ({
  intervalMs,
  signal,
}: FakeDeviceOptions): FakeDevice => {
  let motion: Motion = { kind: "stand", at: [0, 0] };
  let paused = false;
  let timeFactor = 1;
  const reception = createReception(signal);
  const watches = new Map<
    number,
    { timer: ReturnType<typeof setInterval>; success: PositionCallback }
  >();
  let nextWatchId = 1;
  let disposed = false;

  const tellWatchers = (position: GeolocationPosition) => {
    for (const { success } of watches.values()) {
      success(position);
    }
  };

  /** leaving live mode: the real device's watch goes with it */
  const endLive = () => {
    if (motion.kind === "live" && motion.watchId !== null) {
      navigator.geolocation.clearWatch(motion.watchId);
    }
  };

  /** where the device is right now, without scatter and without moving it */
  const where = (): [number, number] => {
    switch (motion.kind) {
      case "drive":
        return alongLine(motion.line, motion.along).geometry.coordinates as [
          number,
          number
        ];
      case "replay": {
        const fix = motion.fixes[replayIndex(motion.fixes, motion.elapsed)];
        return [fix.lng, fix.lat];
      }
      case "live":
        return motion.last
          ? [motion.last.coords.longitude, motion.last.coords.latitude]
          : [0, 0];
      default:
        return motion.at;
    }
  };

  /** the true position through the receiver: a fix, or none */
  const received = (
    at: [number, number],
    heading: number | null,
    speed: number | null
  ) => {
    const reading = reception.receive(at, heading);
    return reading
      ? makePosition(reading.at, reading.accuracy, heading, speed)
      : null;
  };

  /** moves the device on by the time since the last tick, and reads it */
  const fix = (): GeolocationPosition | null => {
    const now = Date.now();
    switch (motion.kind) {
      case "stand":
        return received(motion.at, null, 0);
      case "live":
        return motion.last;
      case "replay": {
        // a paused replay lets the clock run without going anywhere
        motion.elapsed += paused ? 0 : (now - motion.lastTick) * timeFactor;
        motion.lastTick = now;
        const index = replayIndex(motion.fixes, motion.elapsed);
        const fix = motion.fixes[index];
        const over = index === motion.fixes.length - 1;
        return makePosition(
          [fix.lng, fix.lat],
          fix.accuracy,
          fix.heading,
          over ? 0 : fix.speed
        );
      }
      case "heading": {
        const elapsed = paused ? 0 : (now - motion.lastTick) / 1000;
        motion.lastTick = now;
        if (elapsed > 0) {
          motion.at = destination(
            point(motion.at),
            motion.speed * elapsed,
            motion.bearing,
            METERS
          ).geometry.coordinates as [number, number];
        }
        return received(motion.at, motion.bearing, motion.speed);
      }
      case "drive": {
        // a paused drive lets the clock run without going anywhere, so
        // resuming continues from the spot rather than jumping by the time held
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
        return received(
          here.geometry.coordinates as [number, number],
          motion.heading,
          arrived ? 0 : motion.speed
        );
      }
    }
  };

  return {
    stand: (position) => {
      endLive();
      motion = { kind: "stand", at: position };
    },
    drive: (coordinates, speed) => {
      const from = where();
      endLive();
      if (coordinates.length < 2) {
        // nothing to go along: stand where the line is, or where we are
        motion = { kind: "stand", at: coordinates[0] ?? from };
        return;
      }
      const line = lineString(coordinates);
      const nearest = nearestPointOnLine(line, point(from), METERS);
      const start =
        (nearest.properties.dist ?? Infinity) <= PICK_UP_METERS
          ? nearest.properties.location ?? 0
          : 0;
      const ahead = alongLine(line, start + 1).geometry.coordinates;
      const here = alongLine(line, start).geometry.coordinates;
      motion = {
        kind: "drive",
        line,
        total: length(line, METERS),
        along: start,
        speed,
        lastTick: Date.now(),
        heading:
          start > 0
            ? (turfBearing(here, ahead) + 360) % 360
            : (turfBearing(coordinates[0], coordinates[1]) + 360) % 360,
      };
    },
    replay: (fixes) => {
      endLive();
      if (fixes.length === 0) {
        return;
      }
      motion = { kind: "replay", fixes, elapsed: 0, lastTick: Date.now() };
    },
    live: (onFix) => {
      endLive();
      const live: Live = { kind: "live", watchId: null, last: null };
      motion = live;
      if (!("geolocation" in navigator)) {
        return;
      }
      live.watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (motion !== live || disposed) {
            return;
          }
          live.last = position;
          onFix(position);
          tellWatchers(position);
        },
        (error) => {
          console.warn("[LOCATION SIMULATOR] no real fix", { error });
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    },
    seek: (fraction) => {
      if (disposed) {
        return;
      }
      const share = Math.min(1, Math.max(0, fraction));
      if (motion.kind === "replay") {
        const last = motion.fixes[motion.fixes.length - 1];
        motion.elapsed = share * last.t;
        motion.lastTick = Date.now();
      } else {
        if (motion.kind === "heading") {
          motion = motion.resume;
        }
        if (motion.kind !== "drive") {
          return;
        }
        const along = share * motion.total;
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
      }
      const position = fix();
      if (position) {
        tellWatchers(position);
      }
    },
    detour: (turnDegrees) => {
      if ((motion.kind !== "drive" && motion.kind !== "heading") || disposed) {
        return;
      }
      // book the stretch up to now, so the turn happens where the device is
      fix();
      const at = where();
      const heading = motion.kind === "drive" ? motion.heading : motion.bearing;
      const resume = motion.kind === "drive" ? motion : motion.resume;
      motion = {
        kind: "heading",
        at: motion.kind === "drive" ? at : motion.at,
        bearing: (heading + turnDegrees + 360) % 360,
        speed: motion.speed,
        lastTick: Date.now(),
        resume,
      };
    },
    setPaused: (next) => {
      paused = next;
    },
    setSpeed: (speed) => {
      if (motion.kind !== "drive" && motion.kind !== "heading") {
        return;
      }
      // the stretch since the last tick was driven at the old pace: book it
      // before the new one applies, so a change is not applied backwards
      fix();
      motion.speed = speed;
    },
    setTimeFactor: (factor) => {
      // the replay up to now was at the old rate: book it first
      if (motion.kind === "replay") {
        fix();
      }
      timeFactor = factor;
    },
    setSignal: (preset) => {
      reception.setPreset(preset);
    },
    getCurrentPosition: (success, error) => {
      if (disposed) {
        return;
      }
      if (motion.kind === "live" && !motion.last) {
        navigator.geolocation?.getCurrentPosition(success, error, {
          enableHighAccuracy: true,
        });
        return;
      }
      const position = fix();
      if (position) {
        success(position);
      }
    },
    watchPosition: (success) => {
      const id = nextWatchId++;
      if (disposed) {
        return id;
      }
      watches.set(id, {
        // live fixes come from the real device's own watch, not from a tick;
        // without a signal the drive goes on and only the fixes stop coming
        timer: setInterval(() => {
          if (motion.kind === "live") {
            return;
          }
          const position = fix();
          if (position) {
            success(position);
          }
        }, intervalMs),
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
      endLive();
      for (const { timer } of watches.values()) {
        clearInterval(timer);
      }
      watches.clear();
    },
  };
};
