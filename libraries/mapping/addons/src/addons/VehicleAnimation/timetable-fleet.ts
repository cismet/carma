import type { Car, Fleet } from "./fleet";
import {
  serviceRunsOn,
  shiftDay,
  zonedMoment,
  type Timetable,
  type TimetableTrip,
} from "./timetable";
import {
  nearestPose,
  poseAt,
  projectStops,
  type Station,
  type Track,
} from "./track";

/**
 * A fleet placed by the clock: whatever the timetable has on the modelled
 * piece of line at this moment is on the track, where its departure times
 * put it.
 *
 * The track is a ring made of the two rails of a stretch of line, out on one
 * and back on the other, and usually shorter than the line: the model covers
 * a few stations, the timetable all of them. So every station gets a position
 * along each direction's rail, on the model where the model has it and
 * extrapolated beyond the model's ends where it does not, and a vehicle is
 * drawn exactly while its position lies on the model. It enters at one end
 * and leaves at the other, the way a real one passes through.
 *
 * Between two published departures the vehicle runs at whatever speed the
 * gap requires, standing still for `dwellSeconds` before each departure. A
 * timetable has no headway and no speed to configure; both fall out of it.
 */

export type TimetableFleetOptions = {
  track: Track;
  timetable: Timetable;
  /** seconds a vehicle stands at a station before its published departure */
  dwellSeconds: number;
  /** how close a piece of track has to pass a station to count as its stop */
  stationRadiusMeters: number;
  /** the moment to run at, as epoch milliseconds. Default: Date.now */
  now?: () => number;
};

const METERS_PER_LAT = 111320;
const SECONDS_PER_DAY = 86400;
/** a misconfigured timetable must not fill the map with vehicles */
const MAX_FLEET = 60;
/**
 * A stop this close to the end of the modelled stretch is treated as lying
 * beyond it: a station right at the model's edge has its pass on the turn
 * between the two rails, which serves neither direction cleanly.
 */
const EDGE_METERS = 20;
/** how many days ahead the fleet is sized for; a service pattern repeats within */
const SIZING_DAYS = 7;

/** one direction of travel over the ring */
type Arc = {
  /** the modelled stretch, in unwrapped ring metres: `end` may exceed the ring length */
  start: number;
  end: number;
  /** where each station lies along this direction, in unwrapped metres, in listed order */
  stationU: number[];
};

/** a trip with its departures resolved onto one arc, in travel order */
type Run = {
  /** the trip's index in the timetable, for a stable identity */
  trip: number;
  arc: Arc;
  times: number[];
  u: number[];
};

/** a run in service on a given day, its times shifted onto that day's clock */
type DayRun = {
  key: string;
  run: Run;
  offset: number;
  /** the run's stay on the modelled stretch, in that day's seconds */
  enter: number;
  exit: number;
};

const localFrame = (track: Track) => {
  const origin = track.points[0];
  return (lon: number, lat: number): [number, number] => [
    (lon - origin[0]) * track.metersPerLon,
    (lat - origin[1]) * METERS_PER_LAT,
  ];
};

const distanceMeters = (
  toLocal: (lon: number, lat: number) => [number, number],
  a: { lon: number; lat: number },
  b: { lon: number; lat: number }
): number => {
  const [ax, ay] = toLocal(a.lon, a.lat);
  const [bx, by] = toLocal(b.lon, b.lat);
  return Math.hypot(bx - ax, by - ay);
};

/**
 * The two arcs of the ring, one per direction of travel.
 *
 * The ring's ends are its extreme points along the line's own axis, the one
 * from the first listed station to the last. The arc from one end to the
 * other is the forward direction when the track runs along that axis there,
 * else the other arc is.
 */
const splitRing = (
  track: Track,
  stations: readonly Station[],
  toLocal: (lon: number, lat: number) => [number, number]
): { forward: [number, number]; backward: [number, number] | null } => {
  const total = track.length;
  if (!track.closed || stations.length < 2) {
    return { forward: [0, total], backward: null };
  }
  const first = stations[0];
  const last = stations[stations.length - 1];
  const [fx, fy] = toLocal(first.lon, first.lat);
  const [lx, ly] = toLocal(last.lon, last.lat);
  const axisLength = Math.hypot(lx - fx, ly - fy) || 1;
  const axis = [(lx - fx) / axisLength, (ly - fy) / axisLength];

  let lowIndex = 0;
  let highIndex = 0;
  let low = Infinity;
  let high = -Infinity;
  track.points.forEach((point, index) => {
    const [x, y] = toLocal(point[0], point[1]);
    const along = x * axis[0] + y * axis[1];
    if (along < low) {
      low = along;
      lowIndex = index;
    }
    if (along > high) {
      high = along;
      highIndex = index;
    }
  });

  const lowU = track.cumulative[lowIndex];
  const highU = track.cumulative[highIndex];
  /** from the low end forward to the high end, unwrapped */
  const lowToHigh: [number, number] = [lowU, highU > lowU ? highU : highU + total];
  const highToLow: [number, number] = [highU, lowU > highU ? lowU : lowU + total];

  const middle = ((lowToHigh[0] + lowToHigh[1]) / 2) % total;
  const heading = poseAt(track, middle).heading;
  const along = Math.cos(heading) * axis[0] + Math.sin(heading) * axis[1];
  return along >= 0
    ? { forward: lowToHigh, backward: highToLow }
    : { forward: highToLow, backward: lowToHigh };
};

/**
 * Where every station lies along one direction's rail.
 *
 * Stations the model passes take their projected stop; the rest are laid out
 * beyond the model's ends at their straight-line spacing, so a vehicle runs
 * off the end at the speed the timetable gives it and comes back on the same
 * way. A station the model skips between two it has is interpolated.
 */
const arcFor = (
  track: Track,
  range: [number, number],
  stations: readonly Station[],
  passes: number[][],
  toLocal: (lon: number, lat: number) => [number, number],
  backwards: boolean
): Arc => {
  const total = track.length;
  const [start, end] = range;
  const count = stations.length;
  const stationU: (number | null)[] = stations.map(() => null);

  stations.forEach((_, index) => {
    for (const pass of passes[index]) {
      for (const candidate of [pass, pass + total]) {
        if (candidate >= start + EDGE_METERS && candidate <= end - EDGE_METERS) {
          stationU[index] = candidate;
          return;
        }
      }
    }
  });

  /** the stations in travel order */
  const order = stations.map((_, index) => (backwards ? count - 1 - index : index));
  const known = order.filter((index) => stationU[index] !== null);
  if (known.length === 0) {
    return { start, end, stationU: stations.map(() => Number.NaN) };
  }

  const startPose = poseAt(track, ((start % total) + total) % total);
  const endPose = poseAt(track, ((end % total) + total) % total);

  // before the model: walk back from its start, station by station
  const firstKnown = order.indexOf(known[0]);
  let anchor: { lon: number; lat: number } = startPose;
  let u = start;
  for (let position = firstKnown - 1; position >= 0; position--) {
    const station = stations[order[position]];
    u -= distanceMeters(toLocal, anchor, station);
    stationU[order[position]] = u;
    anchor = station;
  }
  // after the model: walk on from its end
  const lastKnown = order.indexOf(known[known.length - 1]);
  anchor = endPose;
  u = end;
  for (let position = lastKnown + 1; position < count; position++) {
    const station = stations[order[position]];
    u += distanceMeters(toLocal, anchor, station);
    stationU[order[position]] = u;
    anchor = station;
  }
  // inside the model but not passed: share the gap by straight-line distance
  for (let position = firstKnown + 1; position < lastKnown; position++) {
    const index = order[position];
    if (stationU[index] !== null) continue;
    let before = position - 1;
    while (stationU[order[before]] === null) before--;
    let after = position + 1;
    while (stationU[order[after]] === null) after++;
    let span = 0;
    let upTo = 0;
    for (let step = before; step < after; step++) {
      const leg = distanceMeters(toLocal, stations[order[step]], stations[order[step + 1]]);
      span += leg;
      if (step < position) upTo += leg;
    }
    const fromU = stationU[order[before]] as number;
    const toU = stationU[order[after]] as number;
    stationU[index] = span > 0 ? fromU + ((toU - fromU) * upTo) / span : fromU;
  }

  return { start, end, stationU: stationU.map((value) => value ?? Number.NaN) };
};

/** a trip as a run along its arc, or null when it cannot be placed */
const toRun = (trip: TimetableTrip, index: number, arc: Arc | null, dwell: number): Run | null => {
  if (!arc) return null;
  const count = trip.times.length;
  const times: number[] = [];
  const u: number[] = [];
  for (let step = 0; step < count; step++) {
    const station = trip.direction === "backward" ? count - 1 - step : step;
    const time = trip.times[station];
    const position = arc.stationU[station];
    if (time === null || Number.isNaN(position)) continue;
    // a timetable that goes backwards in time or space is a broken one
    if (times.length > 0 && (time < times[times.length - 1] || position < u[u.length - 1])) {
      return null;
    }
    // two published departures closer than the dwell would run at infinite speed
    if (times.length > 0 && time - times[times.length - 1] < dwell + 1) {
      return null;
    }
    times.push(time);
    u.push(position);
  }
  return times.length >= 2 ? { trip: index, arc, times, u } : null;
};

/** where the run is at `second` of its service day, or null when it is not out */
const positionAt = (run: Run, second: number, dwell: number): number | null => {
  const { times, u } = run;
  if (second < times[0] - dwell || second > times[times.length - 1]) return null;
  for (let stop = 0; stop < times.length; stop++) {
    if (second > times[stop]) continue;
    if (second >= times[stop] - dwell || stop === 0) return u[stop];
    const from = times[stop - 1];
    const to = times[stop] - dwell;
    const t = (second - from) / (to - from);
    return u[stop - 1] + (u[stop] - u[stop - 1]) * t;
  }
  return null;
};

/** the first second at which the run reaches `target`, or null if it never does */
const timeReaching = (run: Run, target: number, dwell: number): number | null => {
  const { times, u } = run;
  for (let stop = 0; stop < times.length; stop++) {
    if (u[stop] < target) continue;
    if (stop === 0) return times[0] - dwell;
    const from = times[stop - 1];
    const to = times[stop] - dwell;
    const t = (target - u[stop - 1]) / (u[stop] - u[stop - 1]);
    return from + (to - from) * t;
  }
  return null;
};

/** the greatest number of intervals open at once */
const maxOverlap = (intervals: { enter: number; exit: number }[]): number => {
  const events: [number, number][] = [];
  for (const { enter, exit } of intervals) {
    events.push([enter, 1], [exit, -1]);
  }
  // an exit at the same second as an entry frees the slot first
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let most = 0;
  for (const [, delta] of events) {
    open += delta;
    if (open > most) most = open;
  }
  return most;
};

export const createTimetableFleet = ({
  track,
  timetable,
  dwellSeconds,
  stationRadiusMeters,
  now = Date.now,
}: TimetableFleetOptions): Fleet => {
  const total = track.length;
  const dwell = Math.max(0, dwellSeconds);
  const toLocal = localFrame(track);
  const stations: Station[] = timetable.stations.map(({ name, lon, lat }) => ({
    name,
    lon,
    lat,
  }));

  /** every pass of the track by each station, as ring metres */
  const passes: number[][] = stations.map(() => []);
  for (const stop of projectStops(track, stations, stationRadiusMeters)) {
    const index = stations.findIndex((station) => station.name === stop.name);
    if (index >= 0) passes[index].push(stop.distance);
  }

  const ranges = splitRing(track, stations, toLocal);
  const forward = arcFor(track, ranges.forward, stations, passes, toLocal, false);
  const backward = ranges.backward
    ? arcFor(track, ranges.backward, stations, passes, toLocal, true)
    : null;

  /**
   * The stations the model actually has, for drawing, placed on the track:
   * a feed positions a station at the mean of its platforms, which can be
   * fifty metres off the girder, so the marker takes the middle of the
   * track's passes instead.
   */
  const served: Station[] = stations.flatMap((station, index) => {
    const found = passes[index];
    if (found.length === 0) return [];
    const poses = found.map((distance) => poseAt(track, distance));
    return [
      {
        name: station.name,
        lon: poses.reduce((sum, pose) => sum + pose.lon, 0) / poses.length,
        lat: poses.reduce((sum, pose) => sum + pose.lat, 0) / poses.length,
      },
    ];
  });

  const runs: Run[] = [];
  timetable.trips.forEach((trip, index) => {
    const run = toRun(trip, index, trip.direction === "forward" ? forward : backward, dwell);
    if (run) runs.push(run);
  });

  /** the runs of one service day, with the day's date on their clock; cached per day */
  const dayCache = new Map<string, DayRun[]>();
  const runsOn = (day: string, weekday: number): DayRun[] => {
    const cached = dayCache.get(day);
    if (cached) return cached;
    const list: DayRun[] = [];
    const yesterday = shiftDay(day, weekday, -1);
    const add = (serviceDay: string, serviceWeekday: number, offset: number): void => {
      for (const run of runs) {
        const service = timetable.services[timetable.trips[run.trip].service];
        if (!service || !serviceRunsOn(service, serviceDay, serviceWeekday)) continue;
        const enter = timeReaching(run, run.arc.start, dwell);
        const exit = timeReaching(run, run.arc.end, dwell) ?? run.times[run.times.length - 1];
        if (enter === null || exit + offset < 0) continue;
        list.push({
          key: `${run.trip}@${serviceDay}`,
          run,
          offset,
          enter: enter + offset,
          exit: exit + offset,
        });
      }
    };
    add(day, weekday, 0);
    // a run that started before midnight is still on the clock of the day before
    add(yesterday.day, yesterday.weekday, -SECONDS_PER_DAY);
    dayCache.set(day, list);
    return list;
  };

  const moment = zonedMoment(timetable.timezone, now());

  /**
   * How many vehicles the model can hold at once over the coming week: the
   * pool is fixed at creation, because the 3D renderer builds one body per
   * vehicle up front.
   */
  const size = ((): number => {
    let most = 0;
    let { day, weekday } = moment;
    for (let ahead = 0; ahead < SIZING_DAYS; ahead++) {
      most = Math.max(most, maxOverlap(runsOn(day, weekday)));
      ({ day, weekday } = shiftDay(day, weekday, 1));
    }
    // one spare, for the instant a vehicle leaves as another arrives
    return Math.max(1, Math.min(MAX_FLEET, most + 1));
  })();

  const cars: Car[] = Array.from({ length: size }, () => ({
    distance: 0,
    direction: 1,
    dwellRemaining: 0,
    nextStop: 0,
    visible: false,
  }));
  /** which run each slot carries, by key; a run keeps its slot while it is on the model */
  const slotOf = new Map<string, number>();
  const slots: (string | null)[] = cars.map(() => null);

  const update = (): void => {
    const { day, weekday, seconds } = zonedMoment(timetable.timezone, now());
    const present = new Map<string, number>();
    for (const dayRun of runsOn(day, weekday)) {
      if (seconds < dayRun.enter || seconds > dayRun.exit) continue;
      const u = positionAt(dayRun.run, seconds - dayRun.offset, dwell);
      if (u === null || u < dayRun.run.arc.start || u > dayRun.run.arc.end) continue;
      present.set(dayRun.key, u);
    }

    // free the slots of runs that have left, then seat the newcomers
    slots.forEach((key, slot) => {
      if (key !== null && !present.has(key)) {
        slots[slot] = null;
        slotOf.delete(key);
        cars[slot].visible = false;
      }
    });
    for (const [key, u] of present) {
      let slot = slotOf.get(key);
      if (slot === undefined) {
        slot = slots.indexOf(null);
        if (slot === -1) continue;
        slots[slot] = key;
        slotOf.set(key, slot);
      }
      const car = cars[slot];
      car.distance = ((u % total) + total) % total;
      car.visible = true;
    }
  };
  update();

  return {
    cars,
    size,
    stations: served,
    // the timetable sets the speed; there is nothing to turn
    setSpeed: () => undefined,
    advance: () => update(),
    pickNearest: (lon, lat) =>
      nearestPose(
        track,
        cars.filter((car) => car.visible).map((car) => car.distance),
        lon,
        lat
      ),
  };
};
