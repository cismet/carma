import type { TrafficEdge } from "./traffic-network";

/**
 * How much traffic an edge carries at a given moment. EVERYTHING IN THIS FILE
 * IS INVENTED.
 *
 * The network's loads (`bel`, `bus`) are real: the city's traffic model of
 * 2020, vehicles per day across a road section. How those vehicles spread over
 * the hours of a day is not in the data, so the profile below is made up to
 * look like a plausible weekday in a German city: quiet at night, a morning
 * peak at 7 to 8, a broad afternoon peak at 16 to 17. The same goes for the
 * share of trucks by hour, for when buses run, for the minimum load of the
 * streets the model counts nothing on, and for the "recorded" wobble laid over
 * all of it. None of these numbers were measured or taken from a source.
 *
 * They are the stand-in for sensor readings. Once real counts arrive, this is
 * the file they replace: the rest of the addon only asks `flowAt` how many
 * cars, buses and trucks per hour pass in one direction.
 *
 * The wobble is what makes the last 24 hours look recorded rather than
 * averaged: a factor per calendar hour, drawn from a hash of the hour, so the
 * same past hour shows the same traffic every time it is looked at. It is
 * interpolated between hours, so the traffic does not jump on the full hour.
 */

/** raw weights, one per hour from 0:00; normalised below. INVENTED */
const INVENTED_HOURLY_WEIGHTS = [
  0.8, 0.5, 0.4, 0.4, 0.7, 1.8, 4.2, 7.4, 7.0, 5.6, 5.3, 5.5, 5.8, 5.9, 6.1,
  6.8, 7.6, 7.7, 6.6, 4.9, 3.6, 2.8, 2.1, 1.4,
] as const;

const normalised = (weights: readonly number[]): readonly number[] => {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map((weight) => weight / sum);
};

/**
 * INVENTED. The share of a typical weekday's volume that falls into each hour
 * of the day, 0:00 to 23:00 local time. Sums to 1.
 */
export const INVENTED_HOURLY_SHARE: readonly number[] = normalised(
  INVENTED_HOURLY_WEIGHTS
);

/**
 * INVENTED. The share of trucks among cars and trucks, by hour. Higher at
 * night and in the early morning, when deliveries run and few people drive,
 * lowest in the evening rush.
 */
export const INVENTED_TRUCK_SHARE: readonly number[] = [
  0.1, 0.12, 0.13, 0.14, 0.14, 0.12, 0.09, 0.07, 0.08, 0.09, 0.09, 0.09, 0.08,
  0.08, 0.08, 0.07, 0.05, 0.04, 0.04, 0.04, 0.05, 0.06, 0.07, 0.08,
];

/**
 * INVENTED. The share of a day's buses in each hour, normalised to 1. No bus
 * runs from 1:00 to 4:00; the first ones come a little before 5.
 */
export const INVENTED_BUS_HOURLY_SHARE: readonly number[] = normalised([
  1.0, 0, 0, 0, 0.5, 3.0, 5.5, 7.0, 6.5, 5.5, 5.5, 5.5, 5.8, 6.2, 6.2, 6.5,
  6.8, 6.8, 6.0, 4.5, 3.2, 3.0, 2.8, 2.0,
]);

/**
 * INVENTED. Vehicles per day assumed on a section the model counts none on,
 * mostly residential streets (a quarter of the model's sections). Without it
 * those streets would stay empty all day.
 */
export const INVENTED_MIN_DAILY_LOAD = 300;

/**
 * INVENTED. How far the "recorded" traffic of an hour strays from the
 * profile: up to ±15 % for the whole network, and a further ±10 % per road.
 */
export const INVENTED_NETWORK_WOBBLE = 0.15;
export const INVENTED_ROAD_WOBBLE = 0.1;

/** vehicles per hour in one direction of an edge */
export type TrafficFlow = { car: number; bus: number; truck: number };

/**
 * What the profile says about one moment, for every edge alike: computed once
 * per moment and then applied to each edge by `flowFor`.
 */
export type ProfileMoment = {
  /** the hour's share of the daily volume */
  share: number;
  truckShare: number;
  busShare: number;
  /** the network-wide recorded wobble, around 1 */
  wobble: number;
  /** the calendar hours the per-road wobble interpolates between */
  hourA: number;
  hourB: number;
  /** 0 at hour A, 1 at hour B */
  hourMix: number;
};

const MS_PER_HOUR = 3_600_000;

/**
 * A number in [0, 1) that only depends on its inputs: a 32-bit integer hash.
 * Not random at all, which is the point: the same hour gives the same value.
 */
export const hashUnit = (a: number, b = 0): number => {
  let h =
    (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77)) >>>
    0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** the recorded wobble of calendar hour `hour` (hours since 1970, UTC) */
export const networkWobble = (hour: number): number =>
  1 + INVENTED_NETWORK_WOBBLE * (2 * hashUnit(hour) - 1);

const roadWobble = (hour: number, edge: number): number =>
  1 + INVENTED_ROAD_WOBBLE * (2 * hashUnit(hour, edge + 1) - 1);

/**
 * An hourly table read at `hours` (fractional, local), each value standing for
 * the middle of its hour and straight lines between them, round midnight.
 */
const readHourly = (table: readonly number[], hours: number): number => {
  const position = hours - 0.5;
  const base = Math.floor(position);
  const t = position - base;
  const a = table[((base % 24) + 24) % 24];
  const b = table[(((base + 1) % 24) + 24) % 24];
  return a + (b - a) * t;
};

/**
 * The profile at `instant`, whose local time of day is `minutesOfDay`. Both
 * are passed in, rather than read from the clock, so tests can pin them; the
 * addon takes the local time from the Wuppertal clock.
 */
export const profileAt = (
  instant: number,
  minutesOfDay: number
): ProfileMoment => {
  const hours = minutesOfDay / 60;
  const calendarHours = instant / MS_PER_HOUR - 0.5;
  const hourA = Math.floor(calendarHours);
  const hourMix = calendarHours - hourA;
  const wobbleA = networkWobble(hourA);
  const wobbleB = networkWobble(hourA + 1);
  return {
    share: readHourly(INVENTED_HOURLY_SHARE, hours),
    truckShare: readHourly(INVENTED_TRUCK_SHARE, hours),
    busShare: readHourly(INVENTED_BUS_HOURLY_SHARE, hours),
    wobble: wobbleA + (wobbleB - wobbleA) * hourMix,
    hourA,
    hourB: hourA + 1,
    hourMix,
  };
};

/** the daily load the profile spreads: the measured one, or the invented minimum */
export const dailyLoadOf = (edge: Pick<TrafficEdge, "bel">): number =>
  Math.max(edge.bel, INVENTED_MIN_DAILY_LOAD);

/**
 * Vehicles per hour in ONE direction of `edge` at the moment `moment`
 * describes. The loads are counts across the whole road, so each direction
 * gets half. Buses are part of the load; trucks are a share of the rest.
 */
export const flowFor = (
  edge: Pick<TrafficEdge, "index" | "bel" | "bus">,
  moment: ProfileMoment,
  out: TrafficFlow = { car: 0, bus: 0, truck: 0 }
): TrafficFlow => {
  const roadA = roadWobble(moment.hourA, edge.index);
  const roadB = roadWobble(moment.hourB, edge.index);
  const wobble = moment.wobble * (roadA + (roadB - roadA) * moment.hourMix);
  const total = (dailyLoadOf(edge) / 2) * moment.share * wobble;
  const bus = Math.min(total, (edge.bus / 2) * moment.busShare * wobble);
  const rest = total - bus;
  out.bus = bus;
  out.truck = rest * moment.truckShare;
  out.car = rest - out.truck;
  return out;
};

/**
 * Vehicles per hour in one direction of `edge` at `instant`, whose local time
 * of day is `minutesOfDay`. The one-off form of `profileAt` and `flowFor`.
 */
export const flowAt = (
  edge: Pick<TrafficEdge, "index" | "bel" | "bus">,
  instant: number,
  minutesOfDay: number
): TrafficFlow => flowFor(edge, profileAt(instant, minutesOfDay));
