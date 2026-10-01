// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  meshopt,
  VERSION,
  PROFILE_VERSION,
  NOW,
  TTL,
  source,
  validate,
  cache,
  profileKey,
  profile,
  createProjectedTerrainCacheStrategy,
  encodeTypedBinaryRecord,
} from "./projected-terrain-cache-strategy.test-support";

describe("projected terrain cache strategy routing", () => {
  it("defaults to measured binary Blob, preserves native decoding and never loads Meshopt", async () => {
    expect(meshopt.imports).toBe(0);
    const context = cache();
    const entry = source();
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({
      kind: "terrain-component-v1",
      format: "binary",
      payload: expect.any(Blob),
    });
    expect(await context.strategy.decode(entry)).toBe(entry);
    vi.stubGlobal("navigator", undefined);
    context.profiles.values.set(profileKey(), profile());
    expect(await context.strategy.encode(entry, 256)).toBeNull();
    expect(context.profiles.get).toHaveBeenCalledTimes(1);
    expect(meshopt.encode).not.toHaveBeenCalled();
    expect(meshopt.decode).not.toHaveBeenCalled();
    expect(meshopt.imports).toBe(0);
  });

  it.each(["binary", "meshopt"] as const)(
    "routes a valid %s profile through its real binary envelope",
    async (format) => {
      const context = cache();
      const entry = source();
      context.profiles.values.set(profileKey(), profile(format));
      const encoded = await context.strategy.encode(entry, 256);
      expect(encoded?.payload).toMatchObject({
        kind: "terrain-component-v1",
        format,
        payload: expect.any(Blob),
      });
      const stored = encoded!.payload as { payload: Blob };
      expect(encoded?.bytes).toBe(stored.payload.size);
      expect(await context.strategy.decode(encoded?.payload)).toEqual(entry);
      expect(meshopt.encode).toHaveBeenCalledTimes(
        format === "meshopt" ? 1 : 0
      );
      expect(meshopt.decode).toHaveBeenCalledTimes(
        format === "meshopt" ? 1 : 0
      );
    }
  );

  it("decodes stored formats independently of today's profile", async () => {
    const context = cache();
    const entry = source();
    const binary = {
      kind: "terrain-component-v1",
      format: "binary",
      payload: encodeTypedBinaryRecord(entry),
    };
    expect(await context.strategy.decode(binary)).toEqual(entry);
    const compressed = {
      ...binary,
      format: "meshopt",
      payload: encodeTypedBinaryRecord({ meshFixture: entry }),
    };
    expect(meshopt.decode).not.toHaveBeenCalled();
    expect(await context.strategy.decode(compressed)).toEqual(entry);
    expect(meshopt.decode).toHaveBeenCalledOnce();
    expect(context.profiles.get).not.toHaveBeenCalled();
  });

  it("preserves combined ECEF streams when an older Meshopt profile is selected", async () => {
    const importsBefore = meshopt.imports;
    const context = cache();
    const entry = source();
    const indices = entry.tile.indices;
    entry.presentation = {
      mode: "ecef",
      origin: [7.15, 51.25],
      native: {
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices,
        bounds: [0, 0, 0, 1, 1, 1],
        sphere: [0, 0, 0, 1],
      },
      geometry: {
        positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
        normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
        indices,
        bounds: [1, 2, 3, 7, 8, 9],
        sphere: [4, 5, 6, 8],
      },
    };
    context.profiles.values.set(profileKey(), profile("meshopt"));
    const encoded = await context.strategy.encode(entry, 256);
    expect(encoded?.payload).toMatchObject({ format: "binary" });
    expect(await context.strategy.decode(encoded?.payload)).toEqual(entry);
    expect(meshopt.encode).not.toHaveBeenCalled();
    expect(meshopt.decode).not.toHaveBeenCalled();
    expect(meshopt.imports).toBe(importsBefore);
  });

  it.each([
    ["environment", { environment: "other-device|2" }],
    ["expired", { measuredAt: NOW - TTL - 1 }],
    ["future", { measuredAt: NOW + 1 }],
    ["non-finite age", { measuredAt: NaN }],
    ["format", { format: "unknown" }],
    ["measurement scope", { scope: "gpu-render" }],
  ] as const)("ignores a profile with invalid %s", async (_, change) => {
    const context = cache();
    const entry = source();
    context.profiles.values.set(profileKey(), { ...profile(), ...change });
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({
      format: "binary",
    });
    expect(meshopt.encode).not.toHaveBeenCalled();
  });

  it("includes codec revision, environment, projection revision and size class in profile identity", async () => {
    const context = cache();
    context.profiles.values.set(profileKey(), {
      ...profile(),
      measuredAt: NOW - TTL,
    });
    const entry = source();
    expect(
      (await context.strategy.encode(entry, 4 * 1024 ** 2))?.payload
    ).not.toBe(entry);
    expect(
      (await context.strategy.encode(entry, 4 * 1024 ** 2 + 1))?.payload
    ).toMatchObject({ format: "binary" });
    expect(context.profiles.get).toHaveBeenLastCalledWith(profileKey("full"));
    expect(context.register.mock.calls).toEqual([
      ["terrain-projected", VERSION],
      ["terrain-cache-strategies", PROFILE_VERSION],
      ["terrain-cache-probes", PROFILE_VERSION],
    ]);
    const next = createProjectedTerrainCacheStrategy(
      context.manager,
      "terrain-projected",
      "new-projection",
      validate
    );
    expect((await next.encode(entry, 256))?.payload).toMatchObject({
      format: "binary",
    });
    vi.stubGlobal("navigator", {
      userAgent: "changed",
      hardwareConcurrency: 16,
    });
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({
      format: "binary",
    });
  });

  it("skips persistence on failed profile reads or unavailable codecs", async () => {
    const context = cache();
    const entry = source();
    context.profiles.get.mockRejectedValueOnce(
      new Error("storage unavailable")
    );
    expect(await context.strategy.encode(entry, 256)).toBeNull();
    context.profiles.values.set(profileKey(), profile("meshopt"));
    meshopt.encode.mockRejectedValueOnce(new Error("WASM unavailable"));
    expect(await context.strategy.encode(entry, 256)).toBeNull();
  });

  it.each(["no-blob", "no-storage", "disposed"] as const)(
    "does no encoding or profile read for %s",
    async (mode) => {
      const context = cache();
      if (mode === "no-blob") vi.stubGlobal("Blob", undefined);
      else if (mode === "no-storage")
        vi.mocked(context.manager.stats).mockResolvedValueOnce(null);
      else context.strategy.dispose();
      expect(await context.strategy.encode(source(), 256)).toBeNull();
      expect(context.profiles.get).not.toHaveBeenCalled();
      expect(meshopt.encode).not.toHaveBeenCalled();
    }
  );

  it("rejects corrupt, unknown or invalid decoded records without codec work", async () => {
    const { strategy } = cache();
    for (const record of [
      null,
      {},
      { kind: "terrain-component-v1", format: "unknown", payload: new Blob() },
      {
        kind: "terrain-component-v1",
        format: "binary",
        payload: new Uint8Array(),
      },
      {
        kind: "terrain-component-v1",
        format: "binary",
        payload: new Blob(["broken"]),
      },
      {
        kind: "terrain-component-v1",
        format: "binary",
        payload: encodeTypedBinaryRecord({ invalid: true }),
      },
    ])
      expect(await strategy.decode(record)).toBeNull();
    expect(meshopt.decode).not.toHaveBeenCalled();
  });
});
