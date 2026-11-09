import { describe, expect, it } from "vitest";

import { leftOfTravel, rideViewMarker, rideViewSpots } from "./ride-views";
import type { Track } from "./track";

const METERS_PER_LAT = 111320;
const METERS_PER_LON = 70000;

/** a track through points given in meters east and north */
const trackThrough = (points: [number, number][]): Track => {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1]
        )
    );
  }
  return {
    points: points.map(([east, north]) => [
      7 + east / METERS_PER_LON,
      51 + north / METERS_PER_LAT,
    ]),
    cumulative,
    length: cumulative[cumulative.length - 1],
    closed: false,
    metersPerLon: METERS_PER_LON,
  };
};

const noWrap = (distance: number): number => distance;

describe("rideViewSpots", () => {
  it("keeps the front view where the cab eye has always been", () => {
    const { eye, target } = rideViewSpots("front", 24);
    expect(eye).toEqual({ along: 13, side: 0, raise: 0 });
    expect(target).toEqual({ along: 73, side: 0, raise: 0 });
  });

  it("looks back from behind the car", () => {
    const { eye, target } = rideViewSpots("back", 24);
    expect(eye.along).toBe(-13);
    expect(target.along).toBeLessThan(eye.along);
  });

  it("looks out to each side from the middle of the car", () => {
    expect(rideViewSpots("left", 24).eye.along).toBe(0);
    expect(rideViewSpots("left", 24).target.side).toBeGreaterThan(0);
    expect(rideViewSpots("right", 24).target.side).toBeLessThan(0);
  });

  it("looks at the car from behind and clear of its side", () => {
    const { eye, target } = rideViewSpots("outside", 24);
    expect(eye.along).toBeLessThan(-12);
    expect(eye.side).not.toBe(0);
    expect(target).toEqual({ along: 0, side: 0, raise: 0 });
  });
});

describe("rideViewMarker", () => {
  it("shows each view on the side of the train that its camera is on", () => {
    expect(rideViewMarker("front").at).toEqual([1, 0]);
    expect(rideViewMarker("back").at).toEqual([-1, 0]);
    // the model's +z is right of travel, a spot's side is left of travel
    expect(rideViewMarker("left").at).toEqual([0, -1]);
    expect(rideViewMarker("right").at).toEqual([0, 1]);
    const outside = rideViewMarker("outside").at;
    const { eye } = rideViewSpots("outside", 24);
    expect(Math.sign(outside[0])).toBe(Math.sign(eye.along));
    expect(Math.sign(outside[1])).toBe(-Math.sign(eye.side));
  });

  it("looks away from the train from every camera but the one outside", () => {
    expect(rideViewMarker("front").looksOutward).toBe(true);
    expect(rideViewMarker("left").looksOutward).toBe(true);
    expect(rideViewMarker("outside").looksOutward).toBe(false);
  });
});

describe("leftOfTravel", () => {
  const eastward = trackThrough([
    [0, 0],
    [200, 0],
  ]);

  it("is north for a vehicle travelling east", () => {
    const [east, north] = leftOfTravel(eastward, 100, 1, noWrap);
    expect(east).toBeCloseTo(0);
    expect(north).toBeCloseTo(1);
  });

  it("swaps sides when the vehicle travels the track the other way", () => {
    const [east, north] = leftOfTravel(eastward, 100, -1, noWrap);
    expect(east).toBeCloseTo(0);
    expect(north).toBeCloseTo(-1);
  });

  it("still has a direction at the end of a track", () => {
    expect(leftOfTravel(eastward, 200, 1, noWrap)[1]).toBeCloseTo(1);
  });

  it("changes gradually across a corner of the track", () => {
    const corner = trackThrough([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    const before = leftOfTravel(corner, 99, 1, noWrap);
    const after = leftOfTravel(corner, 101, 1, noWrap);
    expect(Math.hypot(before[0] - after[0], before[1] - after[1])).toBeLessThan(
      0.2
    );
  });

  it("has no direction on a track without length", () => {
    const point = trackThrough([[0, 0]]);
    expect(leftOfTravel(point, 0, 1, noWrap)).toEqual([0, 0]);
  });
});
