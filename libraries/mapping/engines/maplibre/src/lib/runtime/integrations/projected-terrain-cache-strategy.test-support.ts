// @vitest-environment node

import {
  calibrateDerivedCacheStrategies as importedCalibrateDerivedCacheStrategies,
  encodeTypedBinaryRecord as importedEncodeTypedBinaryRecord,
  type DerivedBufferCache,
} from "@carma-commons/utils";
import { afterEach, beforeEach, vi } from "vitest";

import type { CachedProjectedTerrainTile } from "./projected-terrain-cache-record";
import {
  createProjectedTerrainCacheStrategy as importedCreateProjectedTerrainCacheStrategy,
} from "./projected-terrain-cache-strategy";

export const calibrateDerivedCacheStrategies =
  importedCalibrateDerivedCacheStrategies;
export const encodeTypedBinaryRecord = importedEncodeTypedBinaryRecord;
export const createProjectedTerrainCacheStrategy =
  importedCreateProjectedTerrainCacheStrategy;

const hoistedMeshopt = vi.hoisted(() => ({
  encode: vi.fn(),
  decode: vi.fn(),
  imports: 0,
}));
export const meshopt = hoistedMeshopt;
vi.mock("./projected-terrain-meshopt-codec", () => {
  hoistedMeshopt.imports++;
  return {
    encodeProjectedTerrainMeshoptRecord: hoistedMeshopt.encode,
    decodeProjectedTerrainMeshoptRecord: hoistedMeshopt.decode,
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
export type Row = {
  key: string;
  bytes: number;
  hits?: number;
  recomputeMs?: number;
  restoreMs?: number;
};
type Costs = { bytes: number; recomputeMs?: number; restoreMs?: number };
const ENVIRONMENT = "terrain-cache-test|8";
export const VERSION = "fixture-projection-v1";
export const PROFILE_VERSION = "terrain-cache-formats-v1:meshopt-0.25-exact";
export const NOW = 1_800_000_000_000;
export const TTL = 7 * 24 * 60 * 60 * 1000;
export const source = (): CachedProjectedTerrainTile => ({
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
export const validate = (value: unknown): value is CachedProjectedTerrainTile => {
  const candidate = value as Partial<CachedProjectedTerrainTile> | null;
  return Boolean(
    candidate?.tile?.u instanceof Float32Array &&
      candidate.reliefVertexMask instanceof Uint8Array
  );
};
export const deferred = <T>() => {
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
      const row = state.rows.find((candidate) => candidate.key === key);
      if (row && _options?.touch !== false) row.hits = (row.hits ?? 0) + 1;
      return values.has(key) ? { value: values.get(key) } : null;
    }),
    put: vi.fn(async (key: string, value: unknown, _costs: Costs) => {
      state.onPut(key, value);
      if (!state.admit) return false;
      values.set(key, value);
      state.rows = [
        ...state.rows.filter((row) => row.key !== key),
        { key, ..._costs },
      ];
      state.peakEntries = Math.max(state.peakEntries, values.size);
      return true;
    }),
    remove: vi.fn(async (key: string) => values.delete(key)),
    updateCosts: vi.fn(async (key: string, costs: { restoreMs: number }) => {
      const row = state.rows.find((candidate) => candidate.key === key);
      if (!row) return false;
      row.restoreMs = costs.restoreMs;
      if (
        row.recomputeMs !== undefined &&
        costs.restoreMs > row.recomputeMs * 0.95
      ) {
        values.delete(key);
        state.rows = state.rows.filter((candidate) => candidate.key !== key);
        return false;
      }
      return true;
    }),
    inspect: vi.fn(async (): Promise<Row[]> => state.rows),
  };
};

const strategies: ReturnType<typeof createProjectedTerrainCacheStrategy>[] = [];
export const cache = () => {
  const records = registration();
  const profiles = registration();
  const probes = registration();
  const register = vi.fn((namespace: string, _version: string) => {
    if (namespace === "terrain-projected") return records;
    if (namespace === "terrain-cache-strategies") return profiles;
    if (namespace === "terrain-cache-probes") return probes;
    throw new Error(`Unexpected cache namespace: ${namespace}`);
  });
  const manager = {
    register,
    stats: vi.fn(async () => ({ minimumSavingRatio: 0.05 })),
  } as unknown as DerivedBufferCache;
  const strategy = createProjectedTerrainCacheStrategy(
    manager,
    "terrain-projected",
    VERSION,
    validate
  );
  strategies.push(strategy);
  return { manager, strategy, register, records, profiles, probes };
};
export const profileKey = (size = "coarse") => `${ENVIRONMENT}|${VERSION}|${size}`;
export const profile = (format: Format = "binary") => ({
  environment: ENVIRONMENT,
  measuredAt: NOW,
  format,
  scope: "worker-storage-restore",
  observedReuseCount: 1,
  audit: { winnerId: format, baseline: null, candidates: [] },
});
export const reusableRow = (hits = 1): Row => ({
  key: "real-terrain-hit",
  bytes: 256,
  hits,
  recomputeMs: 40,
  restoreMs: 10,
});
export const seed = (context: ReturnType<typeof cache>, hits = 1) => {
  const entry = source();
  context.records.state.rows = [reusableRow(hits)];
  context.records.values.set("real-terrain-hit", entry);
  return entry;
};
export const formatOf = (payload: unknown): Format =>
  (payload as { format?: Format }).format ?? "native";
export const timing = (
  context: ReturnType<typeof cache>,
  options: {
    binary?: number[];
    meshopt?: number[];
    prepare?: number;
    seedReadMs?: number;
  } = {}
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
  context.records.state.onGet = () => {
    now += options.seedReadMs ?? 0;
  };
  context.probes.state.onGet = (key) => {
    const format = formatOf(context.probes.values.get(key));
    now += samples[format][reads[format]++];
  };
};

export let lockRequest: ReturnType<typeof vi.fn>;
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
