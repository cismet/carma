import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObliqueImageRecord } from "../../core/types";
import { resolveCameraAltitude } from "./flyToImage";
import { ellipsoidalToDhhn2016Height } from "@carma-geo/proj";

// Camera flights are outside this height-contract test and pull in browser MapLibre.
// Use MapLibre's real geometry without initializing its bundled WebGL worker.
vi.mock("maplibre-gl", async () => {
  const { MercatorCoordinate } = await import(
    "maplibre-gl/src/geo/mercator_coordinate"
  );
  const { LngLat } = await import("maplibre-gl/src/geo/lng_lat");
  return { MercatorCoordinate, LngLat };
});
vi.mock("@carma-mapping/engines/maplibre", () => ({
  zoom512as256: (zoom: number) => zoom + 1,
  zoom256as512: (zoom: number) => zoom - 1,
}));
vi.mock("./obliqueCamera", () => ({ whenMoveEnds: vi.fn() }));
vi.mock("./cameraMath", () => ({
  dynamicDurationMs: vi.fn(),
  groundDistanceM: vi.fn(),
}));
vi.mock("@carma-geo/proj", () => ({
  ellipsoidalToDhhn2016Height: vi.fn(async () => 102),
}));

const record = { z: 305 } as ObliqueImageRecord;
afterEach(() => vi.unstubAllEnvs());

describe("unverified source heights", () => {
  it("blocks unknown source heights by default", async () => {
    await expect(resolveCameraAltitude(record, "unknown", 0)).rejects.toThrow(
      "Höhenbezug"
    );
  });

  it("keeps raw Z only with the explicit development opt-in", async () => {
    vi.stubEnv("DEV", true);
    await expect(
      resolveCameraAltitude(record, "unknown", 2, true)
    ).resolves.toBe(307);
  });

  it("rejects the opt-in in a production build", async () => {
    vi.stubEnv("DEV", false);
    await expect(
      resolveCameraAltitude(record, "unknown", 0, true)
    ).rejects.toThrow("Höhenbezug");
  });
});

describe("prepared camera altitude cache", () => {
  it("shares a pending conversion by record, datum, offset and opt-in", async () => {
    const source = { x: 370000, y: 5680000, z: 305 } as ObliqueImageRecord;
    const transform = vi.mocked(ellipsoidalToDhhn2016Height);
    transform.mockClear();
    const first = resolveCameraAltitude(source, "ellipsoidal", 2),
      second = resolveCameraAltitude(source, "ellipsoidal", 2);
    expect(first).toBe(second);
    await expect(first).resolves.toBe(104);
    expect(transform).toHaveBeenCalledOnce();
    await expect(resolveCameraAltitude(source, "ellipsoidal", 3)).resolves.toBe(
      105
    );
    expect(transform).toHaveBeenCalledTimes(2);
  });
  it("does not memoize a failed conversion", async () => {
    const source = { x: 370000, y: 5680000, z: 305 } as ObliqueImageRecord,
      transform = vi.mocked(ellipsoidalToDhhn2016Height);
    transform.mockRejectedValueOnce(new Error("temporary transform failure"));
    await expect(
      resolveCameraAltitude(source, "ellipsoidal", 0)
    ).rejects.toThrow("temporary");
    await expect(resolveCameraAltitude(source, "ellipsoidal", 0)).resolves.toBe(
      102
    );
  });
});
