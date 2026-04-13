import { describe, expect, it } from "vitest";
import {
  HASH_LAUNCH_MODE,
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
});
