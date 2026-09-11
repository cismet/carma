import { describe, expect, it } from "vitest";

import type { Car } from "./fleet";
import {
  boundsOverlap,
  hasVisiblyMoved,
  metersPerPixel,
  snapshotOf,
  trackBounds,
} from "./fleet-loop";

const car = (distance: number, overrides: Partial<Car> = {}): Car => ({
  distance,
  direction: 1,
  dwellRemaining: 0,
  nextStop: 0,
  visible: true,
  ...overrides,
});

const ring = { length: 1000, closed: true };
const line = { length: 1000, closed: false };

describe("metersPerPixel", () => {
  it("halves with every zoom level", () => {
    expect(metersPerPixel(16, 51.25) / metersPerPixel(17, 51.25)).toBeCloseTo(
      2
    );
  });

  it("gives about a metre per pixel at zoom 16 in Wuppertal", () => {
    expect(metersPerPixel(16, 51.25)).toBeCloseTo(0.75, 2);
  });
});

describe("hasVisiblyMoved", () => {
  it("is false while every vehicle stays within the step", () => {
    const drawn = snapshotOf([car(100), car(500)]);
    expect(hasVisiblyMoved(drawn, [car(100.2), car(500)], 0.5, ring)).toBe(
      false
    );
  });

  it("is true once one vehicle reaches the step", () => {
    const drawn = snapshotOf([car(100), car(500)]);
    expect(hasVisiblyMoved(drawn, [car(100), car(500.5)], 0.5, ring)).toBe(
      true
    );
  });

  it("takes the short way round the seam of a closed track", () => {
    const drawn = snapshotOf([car(999.9)]);
    expect(hasVisiblyMoved(drawn, [car(0.1)], 0.5, ring)).toBe(false);
  });

  it("does not wrap on an open track", () => {
    const drawn = snapshotOf([car(999.9)]);
    expect(hasVisiblyMoved(drawn, [car(0.1)], 0.5, line)).toBe(true);
  });

  it("is true when a vehicle comes onto the track or leaves it", () => {
    const drawn = snapshotOf([car(100, { visible: false })]);
    expect(hasVisiblyMoved(drawn, [car(100)], 0.5, ring)).toBe(true);
  });

  it("is true when a vehicle turns round in place", () => {
    const drawn = snapshotOf([car(1000)]);
    expect(
      hasVisiblyMoved(drawn, [car(1000, { direction: -1 })], 0.5, line)
    ).toBe(true);
  });

  it("ignores where a vehicle off the track has got to", () => {
    const drawn = snapshotOf([car(100, { visible: false })]);
    expect(
      hasVisiblyMoved(drawn, [car(700, { visible: false })], 0.5, ring)
    ).toBe(false);
  });

  it("is true when the fleet changed size", () => {
    expect(hasVisiblyMoved([], [car(0)], 0.5, ring)).toBe(true);
  });
});

describe("trackBounds and boundsOverlap", () => {
  const track = {
    points: [
      [7.1, 51.24],
      [7.2, 51.27],
    ] as [number, number][],
    metersPerLon: 111320 * Math.cos((51.25 * Math.PI) / 180),
  };

  it("grows the extent by the padding", () => {
    const [west, south, east, north] = trackBounds(track, 111.32);
    expect(south).toBeCloseTo(51.239, 6);
    expect(north).toBeCloseTo(51.271, 6);
    expect(west).toBeLessThan(7.1);
    expect(east).toBeGreaterThan(7.2);
  });

  it("sees a view that shows part of the track", () => {
    expect(
      boundsOverlap(trackBounds(track, 0), [7.15, 51.25, 7.3, 51.3])
    ).toBe(true);
  });

  it("does not see a view next to the track", () => {
    expect(
      boundsOverlap(trackBounds(track, 0), [7.21, 51.2, 7.3, 51.3])
    ).toBe(false);
  });

  it("sees a view that lies inside the track's extent", () => {
    expect(
      boundsOverlap(trackBounds(track, 0), [7.14, 51.25, 7.15, 51.26])
    ).toBe(true);
  });
});
