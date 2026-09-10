// @vitest-environment node

import {
  calibrateDerivedCacheStrategies,
  encodeTypedBinaryRecord,
  type DerivedBufferCache,
} from "@carma-commons/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CachedProjectedTerrainTile } from "./projected-terrain-cache-record";
import { createProjectedTerrainCacheStrategy } from "./projected-terrain-cache-strategy";

const meshopt = vi.hoisted(() => ({
  encode: vi.fn(),
  decode: vi.fn(),
  imports: 0,
}));
vi.mock("./projected-terrain-meshopt-codec", () => {
  meshopt.imports++;
  return {
    encodeProjectedTerrainMeshoptRecord: meshopt.encode,
    decodeProjectedTerrainMeshoptRecord: meshopt.decode,
  };
});
vi.mock("@carma-commons/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@carma-commons/utils")>();
  return {
    ...actual,
    calibrateDerivedCacheStrategies: vi.fn(
      actual.calibrateDerivedCacheStrategies
    ),
  };
});

type Format = "native" | "binary" | "meshopt";
type Row = {
  key: string;
  bytes: number;
  hits?: number;
  recomputeMs?: number;
  restoreMs?: number;
};
type Costs = { bytes: number; recomputeMs?: number; restoreMs?: number };
const ENVIRONMENT = "terrain-cache-test|8";
const VERSION = "fixture-projection-v1";
const PROFILE_VERSION = "terrain-cache-formats-v1:meshopt-0.25-exact";
const NOW = 1_800_000_000_000;
const TTL = 7 * 24 * 60 * 60 * 1000;
const source = (): CachedProjectedTerrainTile => ({
  tile: {
    id: { level: 12, x: 2129, y: 1364 },
    bounds: { west: 7.1, south: 51.2, east: 7.2, north: 51.3 },
    u: new Float32Array([0, -0, 1]),
    v: new Float32Array([0, 1, 0]),
    heightMeters: new Float32Array([-12345.625, 0, 12345.625]),
    indices: new Uint32Array([2, 0, 1]),
    westIndices: new Uint32Array([1, 0]),
    southIndices: new Uint32Array([0, 2]),
    eastIndices: new Uint32Array([2]),
    northIndices: new Uint32Array(),
    minimumHeightMeters: -12345.625,
    maximumHeightMeters: 12345.625,
    geometricErrorMeters: 2,
    byteLength: 256,
  },
  geometry: null,
  reliefVertexMask: new Uint8Array([1, 0, 255]),
});
const validate = (value: unknown): value is CachedProjectedTerrainTile => {
  const candidate = value as Partial<CachedProjectedTerrainTile> | null;
  return Boolean(
    candidate?.tile?.u instanceof Float32Array &&
      candidate.reliefVertexMask instanceof Uint8Array
  );
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};

const registration = () => {
  const values = new Map<string, unknown>();
  const state = {
    rows: [] as Row[],
    admit: true,
    peakEntries: 0,
    onGet: (_key: string) => undefined as void,
    onPut: (_key: string, _value: unknown) => undefined as void,
  };
  return {
    values,
    state,
    get: vi.fn(async (key: string, _options?: { touch?: boolean }) => {
      state.onGet(key);
      const row = state.rows.find(candidate => candidate.key === key);
      if (row && _options?.touch !== false) row.hits = (row.hits ?? 0) + 1;
      return values.has(key) ? { value: values.get(key) } : null;
    }),
    put: vi.fn(async (key: string, value: unknown, _costs: Costs) => {
      state.onPut(key, value);
      if (!state.admit) return false;
      values.set(key, value);
      state.rows = [...state.rows.filter(row => row.key !== key), {key, ..._costs}];
      state.peakEntries = Math.max(state.peakEntries, values.size);
      return true;
    }),
    remove: vi.fn(async (key: string) => values.delete(key)),
    updateCosts: vi.fn(async (key: string, costs: {restoreMs: number}) => {
      const row = state.rows.find(candidate => candidate.key === key);
      if (!row) return false;
      row.restoreMs = costs.restoreMs;
      if (row.recomputeMs !== undefined && costs.restoreMs > row.recomputeMs * 0.95) {
        values.delete(key);
        state.rows = state.rows.filter(candidate => candidate.key !== key);
        return false;
      }
      return true;
    }),
    inspect: vi.fn(async (): Promise<Row[]> => state.rows),
  };
};

const strategies: ReturnType<typeof createProjectedTerrainCacheStrategy>[] = [];
const cache = () => {
  const records = registration();
  const profiles = registration();
  const probes = registration();
  const register = vi.fn((namespace: string, _version: string) => {
    if (namespace === "terrain-projected") return records;
    if (namespace === "terrain-cache-strategies") return profiles;
    if (namespace === "terrain-cache-probes") return probes;
    throw new Error(`Unexpected cache namespace: ${namespace}`);
  });
  const manager = { register, stats: vi.fn(async () => ({minimumSavingRatio: 0.05})) } as unknown as DerivedBufferCache;
  const strategy = createProjectedTerrainCacheStrategy(
    manager,
    "terrain-projected",
    VERSION,
    validate
  );
  strategies.push(strategy);
  return { manager, strategy, register, records, profiles, probes };
};
const profileKey = (size = "coarse") => `${ENVIRONMENT}|${VERSION}|${size}`;
const profile = (format: Format = "binary") => ({
  environment: ENVIRONMENT,
  measuredAt: NOW,
  format,
  scope: "worker-storage-restore",
  observedReuseCount: 1,
  audit: { winnerId: format, baseline: null, candidates: [] },
});
const reusableRow = (hits = 1): Row => ({
  key: "real-terrain-hit",
  bytes: 256,
  hits,
  recomputeMs: 40,
  restoreMs: 10,
});
const seed = (context: ReturnType<typeof cache>, hits = 1) => {
  const entry = source();
  context.records.state.rows = [reusableRow(hits)];
  context.records.values.set("real-terrain-hit", entry);
  return entry;
};
const formatOf = (payload: unknown): Format =>
  (payload as { format?: Format }).format ?? "native";
const timing = (
  context: ReturnType<typeof cache>,
  options: { binary?: number[]; meshopt?: number[]; prepare?: number; seedReadMs?: number } = {}
) => {
  let now = 0;
  const reads = { native: 0, binary: 0, meshopt: 0 };
  const samples = {
    native: [10, 10, 10, 10, 10, 10],
    binary: options.binary ?? [1000, 8, 8, 8, 8, 8],
    meshopt: options.meshopt ?? [1000, 9, 9, 9, 9, 9],
  };
  vi.spyOn(performance, "now").mockImplementation(() => now);
  context.probes.state.onPut = () => {
    now += options.prepare ?? 1;
  };
  context.records.state.onGet = () => { now += options.seedReadMs ?? 0; };
  context.probes.state.onGet = (key) => {
    const format = formatOf(context.probes.values.get(key));
    now += samples[format][reads[format]++];
  };
};

let lockRequest: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  meshopt.encode
    .mockReset()
    .mockImplementation(async (entry) => ({ meshFixture: entry }));
  meshopt.decode
    .mockReset()
    .mockImplementation(async (encoded) => encoded.meshFixture);
  let locked = false;
  lockRequest = vi.fn(
    async (
      _name: string,
      _options: unknown,
      callback: (lock: object | null) => Promise<boolean>
    ) => {
      if (locked) return callback(null);
      locked = true;
      try {
        return await callback({ name: "test-lock" });
      } finally {
        locked = false;
      }
    }
  );
  vi.stubGlobal("navigator", {
    userAgent: "terrain-cache-test",
    hardwareConcurrency: 8,
    locks: { request: lockRequest },
  });
  let uuid = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `probe-${++uuid}` });
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  for (const strategy of strategies.splice(0)) strategy.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


describe("projected terrain cache strategy routing", () => {
  it("defaults to measured binary Blob, preserves native decoding and never loads Meshopt", async () => {
    expect(meshopt.imports).toBe(0);
    const context = cache();
    const entry = source();
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({
      kind: "terrain-component-v1", format: "binary", payload: expect.any(Blob),
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
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({format: "binary"});
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
    ).toMatchObject({format: "binary"});
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
    expect((await next.encode(entry, 256))?.payload).toMatchObject({format: "binary"});
    vi.stubGlobal("navigator", {
      userAgent: "changed",
      hardwareConcurrency: 16,
    });
    expect((await context.strategy.encode(entry, 256))?.payload).toMatchObject({format: "binary"});
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
    "does no encoding or profile read for %s", async (mode) => {
      const context = cache();
      if (mode === "no-blob") vi.stubGlobal("Blob", undefined);
      else if (mode === "no-storage") vi.mocked(context.manager.stats).mockResolvedValueOnce(null);
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

describe("bounded worker-local cache calibration", () => {
  it("trials only real reuse candidates, peeks without hits and retains one probe at a time", async () => {
    const context = cache();
    const gpu = vi.fn(() => {
      throw new Error("Calibration must not access GPU resources");
    });
    Object.defineProperty(navigator, "gpu", { get: gpu, configurable: true });
    const entry = seed(context, 4);
    context.records.state.rows.unshift(
      { ...reusableRow(), key: "never-read", hits: 0 },
      { ...reusableRow(), key: "no-costs", restoreMs: undefined },
      { ...reusableRow(), key: "too-large", bytes: 32 * 1024 ** 2 + 1 }
    );
    timing(context);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(lockRequest).toHaveBeenCalledWith(
      "carma-terrain-cache-calibration",
      { ifAvailable: true, mode: "exclusive" },
      expect.any(Function)
    );
    expect(context.records.get).toHaveBeenCalledOnce();
    expect(context.records.get).toHaveBeenCalledWith("real-terrain-hit", {
      touch: false,
    });
    expect(context.probes.put).toHaveBeenCalledTimes(3);
    expect(context.probes.get).toHaveBeenCalledTimes(18);
    for (const [, options] of context.probes.get.mock.calls)
      expect(options).toEqual({ touch: false });
    expect(context.probes.state.peakEntries).toBe(1);
    expect(context.probes.values.size).toBe(0);
    expect(context.records.values.get("real-terrain-hit")).toBe(entry);
    expect(context.records.put).not.toHaveBeenCalled();
    expect(gpu).not.toHaveBeenCalled();
    const auditCall = vi.mocked(calibrateDerivedCacheStrategies).mock.calls[0];
    expect(auditCall[2]).toBe(4);
    expect(auditCall[0].samplesMs).toEqual([10, 10, 10, 10, 10]);
    expect(auditCall[1].map((trial) => trial.samplesMs)).toEqual([
      [8, 8, 8, 8, 8],
      [9, 9, 9, 9, 9],
    ]);
    expect(context.profiles.values.get(profileKey())).toMatchObject({
      format: "binary",
      observedReuseCount: 4,
      scope: "worker-storage-restore",
    });
    expect(context.profiles.put.mock.calls[0][2].bytes).toBeGreaterThan(0);
  });

  it.each([
    ["median", [9.6, 9.6, 9.6, 9.6, 9.6], 1, "insufficient-median-saving"],
    ["p95", [8, 8, 8, 8, 9.6], 1, "insufficient-p95-saving"],
    ["observed amortization", [8, 8, 8, 8, 8], 3, "preparation-not-amortized"],
  ] as const)(
    "keeps native when %s does not pass the admission gate",
    async (_, samples, prepare, reason) => {
      const context = cache();
      const entry = seed(context, 1);
      timing(context, {
        binary: [1000, ...samples],
        meshopt: [1000, ...samples],
        prepare,
      });
      expect(await context.strategy.calibrate()).toBe(true);
      expect(context.profiles.values.get(profileKey())).toMatchObject({
        format: "native",
        observedReuseCount: 1,
        audit: {
          winnerId: null,
          candidates: [
            { admitted: false, admittedReason: reason },
            { admitted: false, admittedReason: reason },
          ],
        },
      });
      expect((await context.strategy.encode(entry, 256))?.payload).toBe(entry);
    }
  );

  it("retries a native preselection only when real observed reuse doubles", async () => {
    const context = cache();
    seed(context, 1);
    context.profiles.values.set(profileKey(), profile("native"));
    timing(context);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.get).not.toHaveBeenCalled();
    context.records.state.rows[0].hits = 2;
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.probes.put).toHaveBeenCalledTimes(3);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(3);
  });

  it.each(["no-browser", "no-locks", "busy-lock", "aborted"] as const)(
    "does no experiment for %s",
    async (mode) => {
      const context = cache();
      seed(context);
      const controller = new AbortController();
      if (mode === "no-browser") vi.stubGlobal("navigator", undefined);
      else if (mode === "no-locks") vi.stubGlobal("navigator", {});
      else if (mode === "busy-lock")
        lockRequest.mockImplementationOnce(async (_name, _options, callback) =>
          callback(null)
        );
      else controller.abort();
      expect(await context.strategy.calibrate(controller.signal)).toBe(false);
      expect(context.records.inspect).not.toHaveBeenCalled();
      expect(context.probes.put).not.toHaveBeenCalled();
    }
  );

  it("prevents same-controller and cross-controller concurrent experiments", async () => {
    const context = cache();
    const inspected = deferred<Row[]>();
    context.records.inspect.mockImplementationOnce(() => inspected.promise);
    const first = context.strategy.calibrate();
    expect(await context.strategy.calibrate()).toBe(false);
    const other = createProjectedTerrainCacheStrategy(
      context.manager,
      "terrain-projected",
      VERSION,
      validate
    );
    expect(await other.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledOnce();
    inspected.resolve([]);
    expect(await first).toBe(false);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledTimes(2);
  });

  it("stops and cleans up when the shared budget refuses a probe", async () => {
    const context = cache();
    seed(context);
    context.probes.state.admit = false;
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(1);
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.probes.remove).toHaveBeenCalledWith("probe-1");
    expect(context.profiles.put).not.toHaveBeenCalled();
    expect(meshopt.encode).not.toHaveBeenCalled();
  });

  it("honors cancellation during the task yield before starting a probe read", async () => {
    const context = cache();
    seed(context);
    const controller = new AbortController();
    context.probes.state.onPut = () => {
      setTimeout(() => controller.abort(), 0);
    };
    expect(await context.strategy.calibrate(controller.signal)).toBe(false);
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });

  it("does not write a codec result completed after cancellation", async () => {
    const context = cache();
    const entry = seed(context);
    timing(context);
    const started = deferred<void>();
    const encoded = deferred<unknown>();
    meshopt.encode.mockImplementationOnce(() => {
      started.resolve();
      return encoded.promise;
    });
    const controller = new AbortController();
    const calibration = context.strategy.calibrate(controller.signal);
    await started.promise;
    controller.abort();
    encoded.resolve({ meshFixture: entry });
    expect(await calibration).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(2);
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });

  it("stops after a cancelled storage read and releases the calibration slot", async () => {
    const context = cache();
    seed(context);
    const controller = new AbortController();
    context.probes.state.onGet = () => controller.abort();
    expect(await context.strategy.calibrate(controller.signal)).toBe(false);
    expect(context.probes.get).toHaveBeenCalledOnce();
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
    context.records.state.rows = [];
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledTimes(2);
  });

  it("rejects byte-parity mismatches and removes speculative data", async () => {
    const context = cache();
    const entry = seed(context);
    timing(context);
    meshopt.decode.mockImplementationOnce(async () => {
      const changed = structuredClone(entry);
      changed.tile.u[1] = 0; // -0 and +0 must not be treated as identical bytes.
      return changed;
    });
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });
});

describe("rejected native-hit calibration bootstrap", () => {
  it("rejects slow native, profiles from one real hit, then admits faster binary against source", async () => {
    const context = cache();
    const entry = seed(context, 1);
    context.records.state.rows[0].recomputeMs = 9;
    timing(context);

    expect(await context.strategy.updateCosts("real-terrain-hit", 10)).toBe(false);
    expect(context.records.values.size).toBe(0);
    expect(context.records.get).toHaveBeenCalledWith("real-terrain-hit", {touch: false});
    expect((await context.strategy.inspectProfiles()).pendingSeed?.observedReuseCount).toBe(1);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.records.get).toHaveBeenCalledOnce();
    expect(vi.mocked(calibrateDerivedCacheStrategies).mock.calls[0][2]).toBe(1);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.profiles.values.get(profileKey())).toMatchObject({format: "binary"});

    const encoded = await context.strategy.encode(entry, 256);
    expect(formatOf(encoded?.payload)).toBe("binary");
    await context.records.put("fresh", encoded!.payload, {bytes: encoded!.bytes, recomputeMs: 9});
    await context.records.get("fresh"); // The next real foreground hit, not a trial.
    expect(await context.strategy.updateCosts("fresh", 8)).toBe(true);
    expect(context.records.values.has("fresh")).toBe(true);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.probes.state.peakEntries).toBe(1);
  });

  it("includes the measured seed read/decode cost in amortization", async () => {
    const context = cache();
    seed(context, 1);
    context.records.state.rows[0].recomputeMs = 9;
    timing(context, {seedReadMs: 3});
    await context.strategy.updateCosts("real-terrain-hit", 10);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.profiles.values.get(profileKey())).toMatchObject({
      format: "native",
      audit: {candidates: [{prepareMs: 4, admittedReason: "preparation-not-amortized"},
        {prepareMs: 4, admittedReason: "preparation-not-amortized"}]},
    });
    expect(context.records.values.size).toBe(0);
  });

  it.each(["no-hit", "unknown-source", "oversized", "beneficial"] as const)(
    "does not clone a seed for %s", async (mode) => {
      const context = cache();
      seed(context, mode === "no-hit" ? 0 : 1);
      const row = context.records.state.rows[0];
      row.recomputeMs = mode === "unknown-source" ? undefined : mode === "beneficial" ? 100 : 9;
      if (mode === "oversized") row.bytes = 32 * 1024 ** 2 + 1;
      await context.strategy.updateCosts("real-terrain-hit", 10);
      expect(context.records.get).not.toHaveBeenCalled();
      expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
      expect(context.records.updateCosts).toHaveBeenCalledWith("real-terrain-hit", {restoreMs: 10});
    }
  );

  it("bounds the decoded buffer bytes, not merely the compressed record size", async () => {
    const context = cache();
    const entry = seed(context);
    context.records.state.rows[0].recomputeMs = 9;
    context.records.values.set("real-terrain-hit", {
      ...entry, reliefVertexMask: new Uint8Array(32 * 1024 ** 2 + 1),
    });
    await context.strategy.updateCosts("real-terrain-hit", 10);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.records.values.size).toBe(0);
  });

  it.each(["expired", "disposed"] as const)("releases a %s seed", async (mode) => {
    const context = cache();
    seed(context);
    context.records.state.rows[0].recomputeMs = 9;
    await context.strategy.updateCosts("real-terrain-hit", 10);
    if (mode === "expired") vi.spyOn(Date, "now").mockReturnValue(NOW + 60_001);
    else context.strategy.dispose();
    expect(await context.strategy.calibrate()).toBe(false);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.probes.put).not.toHaveBeenCalled();
  });

  it("keeps at most one pending seed across producer strategies", async () => {
    const first = cache();
    const second = cache();
    seed(first); seed(second);
    first.records.state.rows[0].recomputeMs = second.records.state.rows[0].recomputeMs = 9;
    await first.strategy.updateCosts("real-terrain-hit", 10);
    await second.strategy.updateCosts("real-terrain-hit", 10);
    expect(second.records.get).not.toHaveBeenCalled();
    expect((await first.strategy.inspectProfiles()).pendingSeed).not.toBeNull();
    expect((await second.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(second.records.values.size).toBe(0);
  });

  it("still applies the rejection if optional seed loading fails", async () => {
    const context = cache();
    seed(context);
    context.records.state.rows[0].recomputeMs = 9;
    context.records.get.mockRejectedValueOnce(new Error("read failed"));
    expect(await context.strategy.updateCosts("real-terrain-hit", 10)).toBe(false);
    expect(context.records.values.size).toBe(0);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
  });

  it("reads only the two small profiles without incrementing hits", async () => {
    const context = cache();
    context.profiles.values.set(profileKey(), profile());
    const report = await context.strategy.inspectProfiles();
    expect(report).toMatchObject({backend: "indexeddb", scope: "worker-storage-restore", profiles: {coarse: profile(), full: null}});
    expect(context.profiles.get.mock.calls).toEqual([
      [profileKey(), {touch: false}], [profileKey("full"), {touch: false}],
    ]);
    expect(context.records.get).not.toHaveBeenCalled();
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.profiles.put).not.toHaveBeenCalled();
  });
});

describe("session-local proven-slow key circuit breaker", () => {
  it("suppresses a Binary 25 ms / Source 10 ms key without disabling other keys", async () => {
    const context = cache();
    const entry = seed(context);
    context.records.state.rows[0].recomputeMs = 10;
    context.records.values.set("real-terrain-hit", {
      kind: "terrain-component-v1", format: "binary", payload: encodeTypedBinaryRecord(entry),
    });
    expect(context.strategy.canWrite("real-terrain-hit")).toBe(true);
    expect(await context.strategy.updateCosts("real-terrain-hit", 25)).toBe(false);
    expect(context.records.values.size).toBe(0);
    expect(context.strategy.canWrite("real-terrain-hit")).toBe(false);
    expect(context.strategy.canWrite("different-terrain-key")).toBe(true);
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(1);
  });

  it.each([
    {sourceMs: 100, restoreMs: 95, hits: 1, allowed: true},
    {sourceMs: 100, restoreMs: 96, hits: 1, allowed: false},
    {sourceMs: undefined, restoreMs: 25, hits: 1, allowed: true},
    {sourceMs: 10, restoreMs: 25, hits: 0, allowed: true},
    {sourceMs: 10, restoreMs: NaN, hits: 1, allowed: true},
  ])("requires actual insufficient feedback: %j", async ({sourceMs, restoreMs, hits, allowed}) => {
    const context = cache();
    seed(context, hits);
    context.records.state.rows[0].recomputeMs = sourceMs;
    await context.strategy.updateCosts("real-terrain-hit", restoreMs);
    expect(context.strategy.canWrite("real-terrain-hit")).toBe(allowed);
  });

  it("keeps at most 256 exact keys and resets on strategy disposal/new session", async () => {
    const context = cache();
    vi.stubGlobal("navigator", {}); // No calibration clones are needed here.
    for (let index = 0; index < 257; index++) {
      const key = `slow-${index}`;
      context.records.state.rows = [{...reusableRow(1), key, recomputeMs: 10}];
      context.records.values.set(key, source());
      await context.strategy.updateCosts(key, 25);
    }
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(256);
    expect(context.strategy.canWrite("slow-0")).toBe(true);
    expect(context.strategy.canWrite("slow-256")).toBe(false);
    context.strategy.dispose();
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(0);
    expect(context.strategy.canWrite("new-key")).toBe(false);
    expect(cache().strategy.canWrite("slow-256")).toBe(true);
  });
});
