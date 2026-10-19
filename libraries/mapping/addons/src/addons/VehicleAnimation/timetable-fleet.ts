import type { Car, CarInfo, Fleet } from "./fleet";
import {
  createZonedClock,
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
 *
 * Where the track has a terminus of the line, the vehicle turns in the loop
 * at the ring's end instead of leaving: after its last stop it runs on to the
 * loop's apex at `turnSpeedKmh`, waits there, and leaves in time to stand at
 * the first stop of its next run for the dwell. A timetable does not say which
 * departure an arrival becomes, so each service day pairs them per terminus,
 * first in, first out. An arrival without a departure within
 * `MAX_TURN_SECONDS` leaves service at the apex, and a departure without an
 * arrival comes out of it there.
 */

export type TimetableFleetOptions = {
  track: Track;
  timetable: Timetable;
  /** seconds a vehicle stands at a station before its published departure */
  dwellSeconds: number;
  /** how close a piece of track has to pass a station to count as its stop */
  stationRadiusMeters: number;
  /** running speed between a terminus and the apex of its turning loop, in km/h */
  turnSpeedKmh: number;
  /** the moment to run at, as epoch milliseconds. Default: Date.now */
  now?: () => number;
};

const METERS_PER_LAT = 111320;
const KMH_TO_MS = 1000 / 3600;
/** longest a vehicle waits in a turning loop for its next run; past it, it leaves service */
const MAX_TURN_SECONDS = 30 * 60;
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
  /** the station names, one per entry of `times` */
  stops: string[];
  /** where the trip starts and ends, whatever the model shows of it */
  origin: string;
  destination: string;
  /** the published departure at the origin, seconds after midnight */
  departure: number;
  /** when it reaches the turning loop's apex after its last stop; null when it ends elsewhere */
  toApex: number | null;
  /** when it leaves the apex for its first stop; null when it starts elsewhere */
  fromApex: number | null;
};

/** a run in service on a given day, its times shifted onto that day's clock */
type DayRun = {
  key: string;
  run: Run;
  offset: number;
  /** the run's stay on the modelled stretch, in that day's seconds */
  enter: number;
  exit: number;
  /** the run that turned into this one in the loop, and the one this turns into */
  previous: DayRun | null;
  next: DayRun | null;
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
const toRun = (
  trip: TimetableTrip,
  index: number,
  arc: Arc | null,
  dwell: number,
  names: readonly string[]
): Run | null => {
  if (!arc) return null;
  const count = trip.times.length;
  const times: number[] = [];
  const u: number[] = [];
  const stops: string[] = [];
  /** every station the trip calls at, placed or not */
  const served: { name: string; time: number }[] = [];
  for (let step = 0; step < count; step++) {
    const station = trip.direction === "backward" ? count - 1 - step : step;
    const time = trip.times[station];
    if (time === null) continue;
    served.push({ name: names[station], time });
    const position = arc.stationU[station];
    if (Number.isNaN(position)) continue;
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
    stops.push(names[station]);
  }
  if (times.length < 2 || served.length === 0) return null;
  return {
    trip: index,
    arc,
    times,
    u,
    stops,
    origin: served[0].name,
    destination: served[served.length - 1].name,
    departure: served[0].time,
    toApex: null,
    fromApex: null,
  };
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** seconds after midnight as the clock time a timetable prints */
const clockLabel = (seconds: number): string =>
  `${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor((seconds % 3600) / 60))}`;

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

/**
 * Where the run is at `second` of its service day, turning loops included:
 * out of the apex at `speed` towards its first stop, and on from its last
 * stop to the apex, where it stays. A stop that lies at the apex itself is
 * extrapolated a few metres past it, so the place is held to the arc there.
 */
const placeOf = (
  run: Run,
  second: number,
  dwell: number,
  speed: number
): number | null => {
  const { arc, times, u } = run;
  const last = times.length - 1;
  if (run.fromApex !== null && second < times[0] - dwell) {
    return Math.max(arc.start, u[0] - (times[0] - dwell - second) * speed);
  }
  if (run.toApex !== null && second > times[last]) {
    return Math.min(arc.end, u[last] + (second - times[last]) * speed);
  }
  const place = positionAt(run, second, dwell);
  if (place === null) return null;
  if (run.toApex !== null && place > arc.end) return arc.end;
  if (run.fromApex !== null && place < arc.start) return arc.start;
  return place;
};

/**
 * Turns the runs arriving at one terminus into the runs leaving it, first
 * in, first out: each departure takes the arrival that has waited longest,
 * as long as that wait stays within `MAX_TURN_SECONDS`. A paired arrival
 * stays on the model until its departure leaves the apex.
 */
const pairTurns = (list: DayRun[], inbound: Arc, outbound: Arc): void => {
  const arrivals = list
    .filter((dayRun) => dayRun.run.arc === inbound && dayRun.run.toApex !== null)
    .sort((a, b) => a.exit - b.exit);
  const departures = list
    .filter((dayRun) => dayRun.run.arc === outbound && dayRun.run.fromApex !== null)
    .sort((a, b) => a.enter - b.enter);
  const waiting: DayRun[] = [];
  let arrived = 0;
  for (const departure of departures) {
    while (arrived < arrivals.length && arrivals[arrived].exit <= departure.enter) {
      waiting.push(arrivals[arrived++]);
    }
    while (waiting.length > 0 && departure.enter - waiting[0].exit > MAX_TURN_SECONDS) {
      waiting.shift();
    }
    const arrival = waiting.shift();
    if (!arrival) continue;
    arrival.next = departure;
    arrival.exit = departure.enter;
    departure.previous = arrival;
  }
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
  turnSpeedKmh,
  now = Date.now,
}: TimetableFleetOptions): Fleet => {
  const total = track.length;
  const dwell = Math.max(0, dwellSeconds);
  const turnSpeed = Math.max(0.1, turnSpeedKmh * KMH_TO_MS);
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

  const names = stations.map((station) => station.name);
  const runs: Run[] = [];
  timetable.trips.forEach((trip, index) => {
    const run = toRun(
      trip,
      index,
      trip.direction === "forward" ? forward : backward,
      dwell,
      names
    );
    if (run) runs.push(run);
  });

  // A terminus the track passes has its turning loop on the model: a run
  // ending there goes on to the loop's apex, a run starting there comes out
  // of it. A terminus off the model leaves its runs to enter and leave at the
  // model's ends, as every other station does.
  if (backward) {
    const last = stations.length - 1;
    for (const run of runs) {
      const { arc, times, u } = run;
      const ahead = arc === forward;
      const home = ahead ? 0 : last;
      const away = ahead ? last : 0;
      const end = times.length - 1;
      if (run.destination === names[away] && passes[away].length > 0) {
        run.toApex =
          u[end] < arc.end
            ? times[end] + (arc.end - u[end]) / turnSpeed
            : timeReaching(run, arc.end, dwell);
      }
      if (run.origin === names[home] && passes[home].length > 0) {
        run.fromApex =
          u[0] > arc.start
            ? times[0] - dwell - (u[0] - arc.start) / turnSpeed
            : timeReaching(run, arc.start, dwell);
      }
    }
  }

  /** the runs of one service day, with the day's date on their clock; cached per day */
  const dayCache = new Map<string, DayRun[]>();
  const runsOn = (day: string, weekday: number): DayRun[] => {
    const cached = dayCache.get(day);
    if (cached) return cached;
    const list: DayRun[] = [];
    const add = (serviceDay: string, serviceWeekday: number, offset: number): void => {
      for (const run of runs) {
        const service = timetable.services[timetable.trips[run.trip].service];
        if (!service || !serviceRunsOn(service, serviceDay, serviceWeekday)) continue;
        const enter = run.fromApex ?? timeReaching(run, run.arc.start, dwell);
        const exit =
          run.toApex ??
          timeReaching(run, run.arc.end, dwell) ??
          run.times[run.times.length - 1];
        if (enter === null) continue;
        list.push({
          key: `${run.trip}@${serviceDay}`,
          run,
          offset,
          enter: enter + offset,
          exit: exit + offset,
          previous: null,
          next: null,
        });
      }
    };
    add(day, weekday, 0);
    // a run that started before midnight is still on the clock of the day before
    const yesterday = shiftDay(day, weekday, -1);
    add(yesterday.day, yesterday.weekday, -SECONDS_PER_DAY);
    // and one that turns after midnight may turn into a run of the day after
    const tomorrow = shiftDay(day, weekday, 1);
    add(tomorrow.day, tomorrow.weekday, SECONDS_PER_DAY);
    if (backward) {
      pairTurns(list, forward, backward);
      pairTurns(list, backward, forward);
    }
    const onDay = list.filter((dayRun) => dayRun.exit >= 0);
    dayCache.set(day, onDay);
    return onDay;
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
  /** the run seated in each slot, for describing it */
  const seated = new Map<number, DayRun>();
  /** the day's second the vehicles were last placed at */
  let lastSeconds = 0;

  // `update` runs on every animation frame, so what it can find once a
  // minute it finds once a minute: the zoned clock, and the runs that can be
  // on the model at all during that minute
  const clock = createZonedClock(timetable.timezone);
  let candidateDay = "";
  let candidateMinute = Number.NaN;
  let candidates: DayRun[] = [];
  const present = new Map<string, { dayRun: DayRun; u: number }>();
  /** the slots given up this frame, by the key of the run that left */
  const freed = new Map<string, number>();
  /** the newcomers that take over the slot of the run they turned from */
  const handedOver = new Map<string, number>();

  const update = (): void => {
    const { day, weekday, seconds } = clock(now());
    lastSeconds = seconds;
    const minute = Math.floor(seconds / 60);
    if (day !== candidateDay || minute !== candidateMinute) {
      candidateDay = day;
      candidateMinute = minute;
      const from = minute * 60;
      const to = from + 60;
      candidates = runsOn(day, weekday).filter(
        (dayRun) => dayRun.enter <= to && dayRun.exit >= from
      );
    }
    present.clear();
    for (const dayRun of candidates) {
      if (seconds < dayRun.enter) continue;
      // a run that turns hands over at its exit, so the two never overlap
      if (dayRun.next ? seconds >= dayRun.exit : seconds > dayRun.exit) continue;
      const u = placeOf(dayRun.run, seconds - dayRun.offset, dwell, turnSpeed);
      if (u === null || u < dayRun.run.arc.start || u > dayRun.run.arc.end) continue;
      present.set(dayRun.key, { dayRun, u });
    }

    // free the slots of runs that have left, then seat the newcomers; a run
    // coming out of a turning loop takes the slot of the run it turned from,
    // so the vehicle stays the same one
    freed.clear();
    slots.forEach((key, slot) => {
      if (key !== null && !present.has(key)) {
        slots[slot] = null;
        slotOf.delete(key);
        seated.delete(slot);
        cars[slot].visible = false;
        freed.set(key, slot);
      }
    });
    handedOver.clear();
    for (const [key, { dayRun }] of present) {
      const previous = dayRun.previous;
      if (slotOf.has(key) || !previous) continue;
      const slot = freed.get(previous.key);
      if (slot !== undefined) handedOver.set(key, slot);
    }
    const reserved = new Set(handedOver.values());
    for (const [key, { dayRun, u }] of present) {
      let slot = slotOf.get(key);
      if (slot === undefined) {
        slot = handedOver.get(key) ?? slots.findIndex(
          (seat, index) => seat === null && !reserved.has(index)
        );
        if (slot === -1) continue;
        slots[slot] = key;
        slotOf.set(key, slot);
        seated.set(slot, dayRun);
      }
      const car = cars[slot];
      car.distance = ((u % total) + total) % total;
      car.visible = true;
    }
  };
  update();

  const describe = (index: number): CarInfo | null => {
    const car = cars[index] as Car | undefined;
    const seatedRun = seated.get(index);
    if (!car?.visible || !seatedRun) return null;
    // waiting in a turning loop, the vehicle already serves its next run
    const dayRun =
      seatedRun.next &&
      lastSeconds - seatedRun.offset > seatedRun.run.times[seatedRun.run.times.length - 1]
        ? seatedRun.next
        : seatedRun;
    const { run } = dayRun;
    const second = lastSeconds - dayRun.offset;
    const stop = run.times.findIndex((time) => second <= time);
    if (stop === -1) return null;
    const standing = second >= run.times[stop] - dwell;
    return {
      destination: run.destination,
      nextStop: run.stops[stop],
      secondsToNextStop: standing
        ? run.times[stop] - second
        : run.times[stop] - dwell - second,
      atStop: standing,
      service: `Fahrt ab ${run.origin} ${clockLabel(run.departure)} · nach Fahrplan`,
    };
  };

  return {
    cars,
    size,
    stations: served,
    describe,
    // the timetable sets the speed, and the turning speed is fixed at creation
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
