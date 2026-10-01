import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObliqueImageRecord } from "../../core/types";
import { resolveCameraAltitude } from "./flyToImage";

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
