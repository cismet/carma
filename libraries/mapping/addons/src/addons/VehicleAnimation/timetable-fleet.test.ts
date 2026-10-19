import { describe, expect, it } from "vitest";

import type { Fleet } from "./fleet";
import type { Timetable, TimetableTrip } from "./timetable";
import { createTimetableFleet } from "./timetable-fleet";
import { buildTrack, poseAt, type Track } from "./track";

const LON0 = 7.1;
const LAT0 = 51.25;
const METERS_PER_LAT = 111320;
const METERS_PER_LON = METERS_PER_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** length of the straight between the two loops */
const L = 2000;
/** half the distance between the rails, the radius of each loop */
const R = 6;
const DWELL = 20;
/** 36 km/h */
const TURN_SPEED_KMH = 36;
const RADIUS = 9;

const toLonLat = (x: number, y: number): [number, number] => [
  LON0 + x / METERS_PER_LON,
  LAT0 + y / METERS_PER_LAT,
];

/**
 * A racetrack in metres around (LON0, LAT0): the out rail along y = -R heading
 * east, a half circle round x = L, the back rail along y = +R heading west and
 * a half circle round x = 0. It starts on the out rail, away from both loops.
 */
const racetrack = (): Track => {
  const points: [number, number][] = [];
  const start = L / 2 - 100;
  for (let x = start; x < L; x += 5) points.push([x, -R]);
  for (let angle = -90; angle < 90; angle += 10) {
    const a = (angle * Math.PI) / 180;
    points.push([L + R * Math.cos(a), R * Math.sin(a)]);
  }
  for (let x = L; x > 0; x -= 5) points.push([x, R]);
  for (let angle = 90; angle < 270; angle += 10) {
    const a = (angle * Math.PI) / 180;
    points.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  for (let x = 0; x < start; x += 5) points.push([x, -R]);
  points.push([start, -R]);
  const track = buildTrack({
    type: "LineString",
    coordinates: points.map(([x, y]) => toLonLat(x, y)),
  });
  if (!track?.closed) throw new Error("the racetrack must be a closed ring");
  return track;
};

const station = (name: string, x: number) => {
  const [lon, lat] = toLonLat(x, 0);
  return { id: name, name, lon, lat };
};

const timetableOf = (
  stations: Timetable["stations"],
  trips: TimetableTrip[]
): Timetable => ({
  name: "test",
  timezone: "Europe/Berlin",
  validFrom: "",
  validTo: "",
  stations,
  services: {
    daily: {
      days: [1, 1, 1, 1, 1, 1, 1],
      start: "20260101",
      end: "20271231",
      added: [],
      removed: [],
    },
  },
  trips,
});

const forwardTrip = (times: (number | null)[]): TimetableTrip => ({
  service: "daily",
  direction: "forward",
  times,
});

const backwardTrip = (times: (number | null)[]): TimetableTrip => ({
  service: "daily",
  direction: "backward",
  times,
});

/** local midnight of a Tuesday in summer time */
const MIDNIGHT = Date.parse("2026-10-20T00:00:00+02:00");

const fleetOn = (track: Track, timetable: Timetable) => {
  let now = MIDNIGHT;
  const fleet: Fleet = createTimetableFleet({
    track,
    timetable,
    dwellSeconds: DWELL,
    stationRadiusMeters: RADIUS,
    turnSpeedKmh: TURN_SPEED_KMH,
    now: () => now,
  });
  /** the fleet as it stands at `seconds` after midnight */
  const at = (seconds: number): Fleet => {
    now = MIDNIGHT + seconds * 1000;
    fleet.advance(0);
    return fleet;
  };
  return { fleet, at };
};

const visible = (fleet: Fleet): number[] =>
  fleet.cars.flatMap((car, index) => (car.visible ? [index] : []));

/** where a vehicle is, in the racetrack's metres */
const whereIs = (track: Track, fleet: Fleet, index: number): [number, number] => {
  const pose = poseAt(track, fleet.cars[index].distance);
  return [(pose.lon - LON0) * METERS_PER_LON, (pose.lat - LAT0) * METERS_PER_LAT];
};

const expectNear = (
  [x, y]: [number, number],
  [expectedX, expectedY]: [number, number],
  meters = 0.5
): void => {
  expect(Math.hypot(x - expectedX, y - expectedY)).toBeLessThan(meters);
};

const EAST_APEX: [number, number] = [L + R, 0];
const WEST_APEX: [number, number] = [-R, 0];

describe("createTimetableFleet with turning loops", () => {
  // West, A: the station lies inside the loop, its one pass right at the
  // apex (Vohwinkel). East, C: a stop on each rail before the loop
  // (Oberbarmen).
  const track = racetrack();
  const timetable = timetableOf(
    [station("A", -R + 4), station("B", L / 2), station("C", L - 30)],
    [
      // ends at B, so it holds the lowest slot while F1 sets out
      forwardTrip([35900, 36020, null]),
      // F1, turns at C into B1
      forwardTrip([36000, 36120, 36240]),
      // B1, turns at A into F2
      backwardTrip([36840, 36720, 36600]),
      // F2, nothing leaves C within half an hour of its arrival
      forwardTrip([37200, 37320, 37440]),
      // B2, leaves C 40 minutes after F2 arrived
      backwardTrip([40080, 39960, 39840]),
    ]
  );

  it("keeps the vehicle visible and in its slot through both turns", () => {
    const { fleet, at } = fleetOn(track, timetable);
    expect(fleet.size).toBe(3);
    at(36010);
    const [, slot] = visible(fleet);
    expect(slot).toBeDefined();
    for (let second = 36030; second <= 37400; second += 0.5) {
      expect(visible(at(second))).toEqual([slot]);
    }
  });

  it("holds at the apex of the loop until it leaves for its next run", () => {
    const { fleet, at } = fleetOn(track, timetable);
    for (const second of [36260, 36400, 36570]) {
      const [slot] = visible(at(second));
      expectNear(whereIs(track, fleet, slot), EAST_APEX);
    }
    // the stop at A lies past the apex; the vehicle stays on it
    for (const second of [36850, 37000, 37150]) {
      const [slot] = visible(at(second));
      expectNear(whereIs(track, fleet, slot), WEST_APEX);
    }
  });

  it("stands at the first stop of its next run for the dwell", () => {
    const { fleet, at } = fleetOn(track, timetable);
    for (const second of [36600 - DWELL, 36590, 36600]) {
      const [slot] = visible(at(second));
      expectNear(whereIs(track, fleet, slot), [L - 30, R]);
    }
    const [slot] = visible(at(36578));
    const [x, y] = whereIs(track, fleet, slot);
    expect(x).toBeGreaterThan(L - 30);
    expect(y).toBeGreaterThan(0);
  });

  it("describes the next run while it waits in the loop", () => {
    const { fleet, at } = fleetOn(track, timetable);
    const [slot] = visible(at(36400));
    expect(fleet.describe(slot)).toMatchObject({
      destination: "A",
      nextStop: "C",
      atStop: false,
      secondsToNextStop: 36600 - DWELL - 36400,
    });
    expect(at(36590).describe(slot)).toMatchObject({
      nextStop: "C",
      atStop: true,
      secondsToNextStop: 10,
    });
  });

  it("takes an arrival out of service at the apex when nothing leaves in time", () => {
    const { fleet, at } = fleetOn(track, timetable);
    let last: [number, number] | null = null;
    for (let second = 37440; second <= 37500; second += 0.1) {
      const [slot] = visible(at(second));
      if (slot === undefined) break;
      last = whereIs(track, fleet, slot);
    }
    expect(last).not.toBeNull();
    expectNear(last as [number, number], EAST_APEX, 1.1);
    expect(visible(at(37600))).toEqual([]);
    expect(visible(at(39700))).toEqual([]);
  });

  it("brings a departure without an arrival out of the apex", () => {
    const { fleet, at } = fleetOn(track, timetable);
    let first: [number, number] | null = null;
    for (let second = 39780; second <= 39840; second += 0.1) {
      const [slot] = visible(at(second));
      if (slot === undefined) continue;
      first = whereIs(track, fleet, slot);
      break;
    }
    expect(first).not.toBeNull();
    expectNear(first as [number, number], EAST_APEX, 1.1);
  });
});

describe("createTimetableFleet without a terminus on the model", () => {
  // both termini lie far beyond the loops, so no pass of the track serves them
  const track = racetrack();
  const timetable = timetableOf(
    [
      station("A", -600),
      station("B", 300),
      station("C", L - 300),
      station("D", L + 600),
    ],
    [
      forwardTrip([36000, 36120, 36240, 36360]),
      backwardTrip([36760, 36640, 36520, 36400]),
    ]
  );

  it("runs a vehicle off the model's end instead of turning it", () => {
    const { fleet, at } = fleetOn(track, timetable);
    let last: [number, number] | null = null;
    for (let second = 36240; second <= 36360; second += 0.1) {
      const [slot] = visible(at(second));
      if (slot === undefined) break;
      last = whereIs(track, fleet, slot);
    }
    expect(last).not.toBeNull();
    expectNear(last as [number, number], EAST_APEX, 3.5);
    // the stop at D and the next departure from it lie off the model
    for (const second of [36300, 36350, 36390, 36400]) {
      expect(visible(at(second))).toEqual([]);
    }
  });

  it("brings the return run onto the model at the end, not before", () => {
    const { fleet, at } = fleetOn(track, timetable);
    let first: [number, number] | null = null;
    for (let second = 36400; second <= 36520; second += 0.1) {
      const [slot] = visible(at(second));
      if (slot === undefined) continue;
      first = whereIs(track, fleet, slot);
      break;
    }
    expect(first).not.toBeNull();
    expectNear(first as [number, number], EAST_APEX, 3.5);
  });
});
