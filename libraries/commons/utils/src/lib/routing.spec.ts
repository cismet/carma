import { describe, expect, it } from "vitest";
import {
  HASH_LAUNCH_MODE,
  isThreeDViewHash,
  isTruthyHashValue,
  readHashLaunchMode,
  resolveHashLaunchMode,
} from "./routing";

describe("routing launch-mode helpers", () => {
  it("treats valid lat/lng/zoom hashes without altitude as 2d", () => {
    expect(
      readHashLaunchMode({
        lat: "51.2720217",
        lng: "7.2018253",
        zoom: "16.001",
      })
    ).toBe(HASH_LAUNCH_MODE.TWO_D);
  });

  it("keeps altitude-bearing hashes in 3d", () => {
    expect(
      readHashLaunchMode({
        lat: "51.2720217",
        lng: "7.2018253",
        zoom: "16.001",
        h: "165.14",
      })
    ).toBe(HASH_LAUNCH_MODE.THREE_D);
  });

  it("keeps explicit legacy 3d flag higher priority than plain 2d view params", () => {
    expect(
      readHashLaunchMode({
        lat: "51.2720217",
        lng: "7.2018253",
        zoom: "16.001",
        is3d: "1",
      })
    ).toBe(HASH_LAUNCH_MODE.THREE_D);
  });

  it("resolves floodingmap-style hashes to 2d even when default mode is 3d", () => {
    expect(
      resolveHashLaunchMode(
        {
          lat: "51.2720217",
          lng: "7.2018253",
          zoom: "16.001",
        },
        {
          defaultMode: HASH_LAUNCH_MODE.THREE_D,
        }
      )
    ).toBe(HASH_LAUNCH_MODE.TWO_D);
  });

  it("qualifies a nadir 3d view (altitude present, pitch/bearing omitted) as 3d", () => {
    expect(
      readHashLaunchMode({ lat: "51.27", lng: "7.20", zoom: "16", h: "350.5" })
    ).toBe(HASH_LAUNCH_MODE.THREE_D);
  });

  it("switches on a VALID altitude only; a non-finite altitude is not a 3d view", () => {
    expect(isThreeDViewHash({ h: "350" })).toBe(true);
    expect(isThreeDViewHash({ altitude: "350" })).toBe(true);
    expect(isThreeDViewHash({ h: "nope" })).toBe(false);
    expect(isThreeDViewHash({})).toBe(false);
    expect(
      readHashLaunchMode({ lat: "51.27", lng: "7.20", zoom: "16", h: "nope" })
    ).toBe(HASH_LAUNCH_MODE.TWO_D);
  });
});

describe("hash value helpers", () => {
  it("treats common enabled hash values as truthy", () => {
    expect(isTruthyHashValue("1")).toBe(true);
    expect(isTruthyHashValue("true")).toBe(true);
    expect(isTruthyHashValue(true)).toBe(true);
  });

  it("treats common disabled hash values as false", () => {
    expect(isTruthyHashValue(undefined)).toBe(false);
    expect(isTruthyHashValue("0")).toBe(false);
    expect(isTruthyHashValue("false")).toBe(false);
    expect(isTruthyHashValue("off")).toBe(false);
  });
});
