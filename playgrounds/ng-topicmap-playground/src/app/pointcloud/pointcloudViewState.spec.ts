import { describe, expect, it, vi } from "vitest";

import {
  mergePersistedSettings,
  readPointcloudViewState,
  writePointcloudViewState,
} from "./pointcloudViewState";

describe("pointcloud view-state persistence", () => {
  it("round-trips camera, cloud, and mesh settings", () => {
    let stored: string | null = null;
    const storage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
    };

    writePointcloudViewState(
      "view",
      {
        camera: {
          center: [7.15, 51.25],
          zoom: 17,
          pitch: 62,
          bearing: 145,
        },
        cloudSettings: { awg: { enabled: false, radiusScale: 1.4 } },
        meshSettings: { mesh2024: { enabled: true, opacity: 0.8 } },
      },
      storage
    );

    expect(readPointcloudViewState("view", storage)).toEqual({
      version: 1,
      camera: {
        center: [7.15, 51.25],
        zoom: 17,
        pitch: 62,
        bearing: 145,
      },
      cloudSettings: { awg: { enabled: false, radiusScale: 1.4 } },
      meshSettings: { mesh2024: { enabled: true, opacity: 0.8 } },
    });
  });

  it("rejects corrupt and unsupported state", () => {
    expect(
      readPointcloudViewState("view", { getItem: () => "not-json" })
    ).toBeNull();
    expect(
      readPointcloudViewState("view", {
        getItem: () => JSON.stringify({ version: 2 }),
      })
    ).toBeNull();
  });

  it("merges known asset settings onto current defaults", () => {
    expect(
      mergePersistedSettings({ enabled: false, opacity: 1 }, { enabled: true })
    ).toEqual({ enabled: true, opacity: 1 });
  });
});
