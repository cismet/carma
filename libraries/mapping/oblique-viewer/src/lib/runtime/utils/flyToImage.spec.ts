import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObliqueImageRecord } from "../../core/types";
import { resolveCameraAltitude } from "./flyToImage";

// Camera flights are outside this height-contract test and pull in browser MapLibre.
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
