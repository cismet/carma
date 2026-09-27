import { describe, expect, it } from "vitest";

import {
  coverSourcesOf,
  coverTakeoverOf,
  publishCoverSource,
  setCoverTakeover,
  withdrawCoverSource,
  type CoverSource,
} from "./spot-cover";

const cabs = (dim: number): CoverSource => ({
  dim,
  radiusMeters: 60,
  softness: 0.2,
  centres: [{ lon: 7.15, lat: 51.25 }],
});

describe("spot cover", () => {
  it("keeps each map's sources to itself", () => {
    const map = {};
    const other = {};
    const source = {};
    publishCoverSource(map, source, cabs(0.75));
    expect(coverSourcesOf(map)).toEqual([cabs(0.75)]);
    expect(coverSourcesOf(other)).toEqual([]);
  });

  it("replaces a source's entry and drops it when withdrawn", () => {
    const map = {};
    const source = {};
    publishCoverSource(map, source, cabs(0.75));
    publishCoverSource(map, source, cabs(0.5));
    expect(coverSourcesOf(map)).toEqual([cabs(0.5)]);
    withdrawCoverSource(map, source);
    expect(coverSourcesOf(map)).toEqual([]);
  });

  it("leaves out a source that darkens nothing", () => {
    const map = {};
    publishCoverSource(map, {}, cabs(0));
    expect(coverSourcesOf(map)).toEqual([]);
  });

  it("holds the takeover per map, within 0 and 1", () => {
    const map = {};
    expect(coverTakeoverOf(map)).toBe(0);
    setCoverTakeover(map, 0.4);
    expect(coverTakeoverOf(map)).toBe(0.4);
    setCoverTakeover(map, 3);
    expect(coverTakeoverOf(map)).toBe(1);
    expect(coverTakeoverOf({})).toBe(0);
  });
});
