import {
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
};

export type Fleet = {
  readonly cars: readonly Car[];
  /** how many vehicles the service needs */
  readonly size: number;
  setSpeed: (speedKmh: number) => void;
  /** move every vehicle on by `seconds` of timetable time */
  advance: (seconds: number) => void;
  /** where one of the vehicles is, picked at random, never the same one twice */
  pickRandom: () => TrackPose | null;
};

const KMH_TO_MS = 1000 / 3600;
/** a misconfigured headway must not fill the map with vehicles */
const MAX_FLEET = 60;

export const createFleet = ({
  track,
  mode,
  schedule,
  speedKmh: initialSpeed,
}: FleetOptions): Fleet => {
  let speedKmh = initialSpeed;
  /** so a second look does not land on the vehicle already in the middle */
  let lastPicked: number | null = null;

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

  return {
    cars,
    size,
    setSpeed: (next) => {
      speedKmh = Math.max(0, next);
    },
    advance: (seconds) => {
      for (const car of cars) advanceCar(car, seconds);
    },
    pickRandom: () => {
      if (cars.length === 0) return null;
      let index = Math.floor(Math.random() * cars.length);
      if (cars.length > 1 && index === lastPicked) {
        index = (index + 1) % cars.length;
      }
      lastPicked = index;
      return poseAt(track, cars[index].distance);
    },
  };
};
