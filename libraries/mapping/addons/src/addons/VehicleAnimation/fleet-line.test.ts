import { describe, expect, it } from "vitest";

import { carStopLabel, createFleet, type CarInfo } from "./fleet";
import { buildTrack, type Track } from "./track";

const LON0 = 7.1;
const LAT0 = 51.25;
const METERS_PER_LAT = 111320;
const METERS_PER_LON = METERS_PER_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** length of the straight; the rails lie 20 m apart */
const L = 2000;
const HALF_GAP = 10;
/** 36 km/h */
const SPEED_MS = 10;
const DWELL = 20;

const toLonLat = (x: number, y: number): [number, number] => [
  LON0 + x / METERS_PER_LON,
  LAT0 + y / METERS_PER_LAT,
];

/** a closed ring in metres: east along y = -HALF_GAP, back west along y = +HALF_GAP */
const ring = (): Track => {
  // stops are found on vertices, so a vertex every few metres
  const points: [number, number][] = [];
  for (let x = 0; x < L; x += 5) points.push([x, -HALF_GAP]);
  for (let x = L; x > 0; x -= 5) points.push([x, HALF_GAP]);
  points.push([0, -HALF_GAP]);
  const track = buildTrack({
    type: "LineString",
    coordinates: points.map(([x, y]) => toLonLat(x, y)),
  });
  if (!track?.closed) throw new Error("the ring must be closed");
  return track;
};

const station = (name: string, x: number) => {
  const [lon, lat] = toLonLat(x, 0);
  return { name, lon, lat };
};

const fleetAt = (track: Track, distance: number) => {
  const fleet = createFleet({
    track,
    mode: "loop",
    speedKmh: SPEED_MS * 3.6,
    schedule: {
      headwaySeconds: 0,
      dwellSeconds: DWELL,
      stations: [station("A", 100), station("B", 1000), station("C", 1900)],
      stationRadiusMeters: 15,
    },
  });
  // a single vehicle, placed by running it there
  fleet.cars[0].distance = distance;
  fleet.cars[0].nextStop = 0;
  return fleet;
};

describe("createFleet line report", () => {
  const track = ring();

  it("reports the stops ahead up to the destination, on this direction only", () => {
    // on the out rail, 400 m short of B: A is behind, C is ahead
    const info = fleetAt(track, 600);
    // the stops in ring order are A, B, C out and C, B, A back
    info.cars[0].nextStop = 1;
    const line = info.describe(0)?.line;
    expect(info.describe(0)?.destination).toBe("C");
    expect(line?.stops[0]).toEqual({ name: "A", secondsUntilArrival: null });
    expect(line?.stops[1].secondsUntilArrival).toBeCloseTo(40, 0);
    // 40 s to B, 20 s standing there, 90 s on to C
    expect(line?.stops[2].secondsUntilArrival).toBeCloseTo(150, 0);
    expect(line?.position).toBeCloseTo(0.56, 1);
  });

  it("counts the time at a stop while the vehicle stands there", () => {
    const fleet = fleetAt(track, 1000);
    fleet.cars[0].nextStop = 2;
    fleet.cars[0].dwellRemaining = 15;
    const line = fleet.describe(0)?.line;
    expect(line?.position).toBe(1);
    expect(line?.stops[1].secondsUntilArrival).toBe(0);
    expect(line?.stops[2].secondsUntilArrival).toBeCloseTo(15 + 90, 0);
  });

  it("has no line without stations", () => {
    const fleet = createFleet({
      track,
      mode: "loop",
      speedKmh: 36,
      schedule: null,
    });
    expect(fleet.describe(0)?.line).toBeNull();
  });
});

describe("carStopLabel", () => {
  const car: CarInfo = {
    destination: "C",
    nextStop: "B",
    secondsToNextStop: 80,
    atStop: false,
    service: "",
    line: null,
  };

  it("says when the vehicle arrives, or when it leaves", () => {
    expect(carStopLabel(car)).toBe("Nächster Halt B · in 1:20 min");
    expect(carStopLabel({ ...car, atStop: true, secondsToNextStop: 15 })).toBe(
      "Halt B · Abfahrt in 15 s"
    );
  });

  it("says nothing without a stop", () => {
    expect(carStopLabel({ ...car, nextStop: null })).toBeUndefined();
  });
});
