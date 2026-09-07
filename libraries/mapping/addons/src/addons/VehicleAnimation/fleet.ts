import type { Timetable } from "./timetable";
import { createTimetableFleet } from "./timetable-fleet";
import {
  nearestPose,
  poseAt,
  projectStops,
  type Station,
  type Track,
  type TrackPose,
  type TrackStop,
} from "./track";

/**
 * The fleet as a timetable sees it: how many vehicles there are, where each
 * one is along the track, and how they move on. No map in here; the flat and
 * the 3D renderer both drive the same fleet and only differ in how they draw
 * it.
 *
 * Two kinds of fleet answer to the same interface: the one in this file runs
 * a fixed headway and moves its vehicles on by elapsed time, the one in
 * `timetable-fleet.ts` places them by the clock from a published timetable.
 */

export type VehicleMode = "loop" | "pingpong";

/**
 * A service, in the terms a timetable is actually written in: how often a
 * vehicle leaves, how long it waits at a station, and how fast it runs between
 * them. How many vehicles that takes follows from the route and is counted
 * rather than configured.
 *
 * Station stops are served in `loop` mode. In `pingpong` the vehicle turns
 * around mid-route, which no timetable of this shape describes, so stops are
 * ignored there.
 */
export type VehicleSchedule = {
  /** seconds between two departures of the same direction */
  headwaySeconds: number;
  /** how long a vehicle waits at each station */
  dwellSeconds: number;
  /** the stations it calls at */
  stations: readonly Station[];
  /** how close a piece of track has to pass a station to count as its stop */
  stationRadiusMeters: number;
};

export type Car = {
  /** meters from the start of the track */
  distance: number;
  /** 1 forwards, -1 after a pingpong turnaround */
  direction: number;
  /** seconds still to wait at the stop it is standing in */
  dwellRemaining: number;
  /** which entry of `stops` it is heading for */
  nextStop: number;
  /**
   * Whether the vehicle is on the track at all. A headway fleet keeps every
   * vehicle out; a timetable fleet holds a pool and seats only the trips that
   * are on the modelled stretch right now.
   */
  visible: boolean;
};

/** what a vehicle is doing right now, for an info box */
export type CarInfo = {
  /** the terminus it is heading for, what the cab display says; null when the route has no ends */
  destination: string | null;
  /** the station it is heading for, or standing in; null without stations */
  nextStop: string | null;
  /** seconds until it leaves that station when standing, until it arrives when running */
  secondsToNextStop: number | null;
  /** whether it stands in `nextStop` right now */
  atStop: boolean;
  /** the service it runs, in one line: the trip's origin and departure, or the headway */
  service: string;
};

/** a selected vehicle, as the host's info box wants it */
export type SelectedCar = CarInfo & {
  /** which vehicle of the fleet */
  index: number;
  lon: number;
  lat: number;
};

/** a published timetable to run instead of a headway */
export type FleetTimetable = {
  timetable: Timetable;
  /** seconds a vehicle stands at a station before its published departure */
  dwellSeconds: number;
  /** how close a piece of track has to pass a station to count as its stop */
  stationRadiusMeters: number;
};

export type FleetOptions = {
  track: Track;
  /** running speed between stops, in km/h */
  speedKmh: number;
  /**
   * What happens at the end of the track. `loop` restarts at the beginning,
   * which is what a closed ring wants; `pingpong` turns around, which is what
   * an out-and-back line wants.
   */
  mode: VehicleMode;
  /** without one, a single vehicle runs the route without stopping */
  schedule: VehicleSchedule | null;
  /**
   * With one, the vehicles are placed by the clock from its departures and
   * `speedKmh`, `mode` and the headway of `schedule` are not used.
   */
  timetable?: FleetTimetable | null;
};

export type Fleet = {
  readonly cars: readonly Car[];
  /** how many vehicles the service needs, or the pool a timetable fleet seats them in */
  readonly size: number;
  /** the stations the vehicles call at on this track, for drawing */
  readonly stations: readonly Station[];
  setSpeed: (speedKmh: number) => void;
  /** move every vehicle on by `seconds` of timetable time */
  advance: (seconds: number) => void;
  /** where the vehicle nearest to (lon, lat) is, or the next one when that is where the view already stands */
  pickNearest: (lon: number, lat: number) => TrackPose | null;
  /** what one vehicle is doing, by its index in `cars`; null when it is not out */
  describe: (index: number) => CarInfo | null;
};

const KMH_TO_MS = 1000 / 3600;
const METERS_PER_LAT = 111320;
/** a misconfigured headway must not fill the map with vehicles */
const MAX_FLEET = 60;

/** seconds as the minutes-and-seconds a timetable is written in */
export const headwayLabel = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0
    ? `${minutes}-Min-Takt`
    : `${minutes}:${String(rest).padStart(2, "0")}-Takt`;
};

/**
 * Watches one selected vehicle and hands the host a fresh description
 * whenever what it would show changes, about once a second while the
 * vehicle runs, and null once the vehicle is gone or the selection dropped.
 *
 * Both renderers share this so they cannot describe the same fleet
 * differently.
 */
export const createSelectionReporter = (
  track: Track,
  fleet: Fleet,
  report: (car: SelectedCar | null) => void
) => {
  let selected: number | null = null;
  let lastKey: string | null = null;

  const publish = (): void => {
    if (selected === null) {
      if (lastKey !== null) {
        lastKey = null;
        report(null);
      }
      return;
    }
    const info = fleet.describe(selected);
    if (!info) {
      selected = null;
      publish();
      return;
    }
    const key = [
      selected,
      info.destination,
      info.nextStop,
      info.atStop,
      Math.round(info.secondsToNextStop ?? -1),
    ].join("|");
    if (key === lastKey) return;
    lastKey = key;
    const pose = poseAt(track, fleet.cars[selected].distance);
    report({ ...info, index: selected, lon: pose.lon, lat: pose.lat });
  };

  return {
    get: (): number | null => selected,
    set: (index: number | null): void => {
      selected = index;
      publish();
    },
    /** after the fleet moved on: the description may have changed, the vehicle may be gone */
    tick: publish,
  };
};

export const createFleet = ({
  track,
  mode,
  schedule,
  speedKmh: initialSpeed,
  timetable = null,
}: FleetOptions): Fleet => {
  if (timetable) {
    return createTimetableFleet({ track, ...timetable });
  }

  let speedKmh = initialSpeed;

  /** every place the service stops, in track order */
  const stops: TrackStop[] =
    schedule && mode === "loop"
      ? projectStops(track, schedule.stations, schedule.stationRadiusMeters)
      : [];

  /**
   * How many vehicles the timetable needs: one round trip divided by the
   * headway. Running time plus every wait is the honest cycle, so a denser
   * timetable or a longer wait both put more vehicles on the route by
   * themselves.
   */
  const size = ((): number => {
    if (!schedule || schedule.headwaySeconds <= 0) return 1;
    const runningSeconds = track.length / Math.max(0.1, speedKmh * KMH_TO_MS);
    const cycleSeconds = runningSeconds + stops.length * schedule.dwellSeconds;
    const count = Math.round(cycleSeconds / schedule.headwaySeconds);
    return Math.max(1, Math.min(MAX_FLEET, count));
  })();

  /** the first stop at or after `distance` */
  const stopAfter = (distance: number): number => {
    if (stops.length === 0) return 0;
    const index = stops.findIndex((stop) => stop.distance >= distance);
    return index === -1 ? 0 : index;
  };

  // Evenly spaced around the route rather than released one headway apart at
  // the start: every vehicle keeps the same stopping pattern, so an even
  // spacing in distance stays an even spacing in time.
  const cars: Car[] = Array.from({ length: size }, (_, index) => {
    const distance = (track.length * index) / size;
    return {
      distance,
      direction: 1,
      dwellRemaining: 0,
      nextStop: stopAfter(distance),
      visible: true,
    };
  });

  /** how far ahead the next stop is, going forwards around a closed track */
  const gapAhead = (from: number, to: number): number =>
    ((to - from) % track.length + track.length) % track.length;

  const advanceCar = (car: Car, seconds: number): void => {
    if (car.dwellRemaining > 0) {
      car.dwellRemaining -= seconds;
      return;
    }

    let remaining = speedKmh * KMH_TO_MS * seconds;

    if (stops.length > 0 && schedule) {
      const gap = gapAhead(car.distance, stops[car.nextStop].distance);
      if (gap <= remaining) {
        // stand exactly at the stop rather than a fraction past it: over a
        // whole day of frames the leftover would drift the timetable
        car.distance = stops[car.nextStop].distance;
        car.dwellRemaining = schedule.dwellSeconds;
        car.nextStop = (car.nextStop + 1) % stops.length;
        return;
      }
    }

    remaining *= car.direction;
    car.distance += remaining;

    if (mode === "loop") {
      // a closed ring has no end to reach, it only wraps
      car.distance =
        ((car.distance % track.length) + track.length) % track.length;
      return;
    }

    if (car.distance > track.length) {
      car.distance = track.length - (car.distance - track.length);
      car.direction = -1;
    } else if (car.distance < 0) {
      car.distance = -car.distance;
      car.direction = 1;
    }
  };

  /** the line's axis, first to last station, which names the direction of travel */
  const axis = ((): [number, number] | null => {
    const stations = schedule?.stations ?? [];
    if (stations.length < 2) return null;
    const first = stations[0];
    const last = stations[stations.length - 1];
    const east = (last.lon - first.lon) * track.metersPerLon;
    const north = (last.lat - first.lat) * METERS_PER_LAT;
    const length = Math.hypot(east, north) || 1;
    return [east / length, north / length];
  })();

  const describe = (index: number): CarInfo | null => {
    const car = cars[index] as Car | undefined;
    if (!car?.visible) return null;
    const stations = schedule?.stations ?? [];
    let destination: string | null = null;
    if (axis) {
      const heading = poseAt(track, car.distance).heading;
      const forward =
        Math.cos(heading) * axis[0] + Math.sin(heading) * axis[1] >= 0;
      destination = (forward ? stations[stations.length - 1] : stations[0]).name;
    }
    const standing = car.dwellRemaining > 0;
    // while it stands, `nextStop` already points past the stop it stands in
    const stopIndex = standing
      ? (car.nextStop - 1 + stops.length) % stops.length
      : car.nextStop;
    const stop = stops.length > 0 ? stops[stopIndex] : null;
    const speed = Math.max(0.1, speedKmh * KMH_TO_MS);
    return {
      destination,
      nextStop: stop?.name ?? null,
      secondsToNextStop: stop
        ? standing
          ? car.dwellRemaining
          : gapAhead(car.distance, stop.distance) / speed
        : null,
      atStop: standing,
      service:
        schedule && schedule.headwaySeconds > 0
          ? `${headwayLabel(schedule.headwaySeconds)} · ${Math.round(schedule.dwellSeconds)} s Halt`
          : `${Math.round(speedKmh)} km/h`,
    };
  };

  return {
    cars,
    size,
    stations: schedule?.stations ?? [],
    describe,
    setSpeed: (next) => {
      speedKmh = Math.max(0, next);
    },
    advance: (seconds) => {
      for (const car of cars) advanceCar(car, seconds);
    },
    pickNearest: (lon, lat) =>
      nearestPose(
        track,
        cars.map((car) => car.distance),
        lon,
        lat
      ),
  };
};
