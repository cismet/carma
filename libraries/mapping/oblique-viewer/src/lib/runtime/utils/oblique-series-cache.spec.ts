import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import { loadObliqueSeriesData } from "./load-oblique-series";
import { loadCachedObliqueSeriesData } from "./oblique-series-cache";
import {
  OBLIQUE_CATALOG_CACHE_VERSION,
  OBLIQUE_CATALOG_FRESHNESS_MS,
  syncObliqueCatalogCacheVersion,
} from "./oblique-series-cache-version";

const storage = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failRead: false,
  failWrite: false,
  readBarrier: null as Promise<void> | null,
  options: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@carma-commons/utils", () => ({
  resolveDerivedCacheAssetEpoch: () => "worker-fixture-v1",
  createDerivedBufferCache: (options: unknown) => {
    storage.options(options);
    return {
      close: storage.close,
      register: (namespace: string, version: string) => ({
        get: async (key: string) => {
          await storage.readBarrier;
          if (storage.failRead) throw new Error("Unavailable");
          const value = storage.values.get(namespace + version + key);
          return value ? { value } : null;
        },
        put: async (key: string, value: unknown, entry: { bytes: number }) => {
          if (storage.failWrite) throw new Error("QuotaExceededError");
          if (entry.bytes > 192 * 1024 ** 2) throw new Error("Budget exceeded");
          storage.values.set(namespace + version + key, value);
          return true;
        },
      }),
    };
  },
}));
vi.mock("./load-oblique-series", () => ({ loadObliqueSeriesData: vi.fn() }));
const dataset = {
  id: "2026",
  exteriorOrientationsURI: "https://images.example/metadata.json",
  animations: {},
  referenceGroundHeightMeters: 200,
} as ObliqueDataset;
const reply = (
  id: string,
  headers: Record<string, string> = {},
  status = 200
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name.toLowerCase()
        )?.[1] ?? null,
    },
    json: async () => ({ id }),
  } as Response);
let now = 1000;
let network: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.clearAllMocks();
  storage.values.clear();
  storage.failRead = storage.failWrite = false;
  storage.readBarrier = null;
  now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  network = vi.fn<typeof fetch>(async () =>
    reply("first", { ETag: '"first"' })
  );
  vi.stubGlobal("fetch", network);
  vi.mocked(loadObliqueSeriesData).mockImplementation(
    async (series, signal, fetchSource = fetch) => {
      const response = await fetchSource(series.exteriorOrientationsURI, {
        signal,
      });
      if (!response.ok) throw new Error("Metadata HTTP " + response.status);
      const body = (await response.json()) as { id: string };
      if (series.footprintsURI) {
        try {
          const footprint = await fetchSource(series.footprintsURI, { signal });
          await footprint.json();
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }
      return {
        imageRecords: new Map([
          [body.id, { id: body.id } as ObliqueImageRecord],
        ]),
        centers: new Map(),
        datasets: new Map([[series.id, series]]),
      };
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("persistent parsed catalog freshness", () => {
  it("discards only cached approximation rings without clearing storage or reloading metadata", async () => {
    const series = { ...dataset, catalogVersion: "static-v1" };
    const first = await loadCachedObliqueSeriesData(series);
    const approximate = first.imageRecords.values().next().value!;
    approximate.footprint = [
      [7, 51],
      [8, 51],
      [8, 52],
      [7, 52],
      [7, 51],
    ];
    approximate.footprintApproximate = true;
    const delivered = {
      ...approximate,
      id: "delivered",
      footprintApproximate: false,
    };
    first.imageRecords.set(delivered.id, delivered);
    network.mockClear();
    const restored = await loadCachedObliqueSeriesData(series);
    expect(
      restored.imageRecords.get(approximate.id)?.footprint
    ).toBeUndefined();
    expect(restored.imageRecords.get(delivered.id)?.footprint).toEqual(
      delivered.footprint
    );
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(1);
  });

  it("restores Maps after validating metadata and footprint headers without parsing again", async () => {
    const series = {
      ...dataset,
      footprintsURI: "https://images.example/footprints.json",
    };
    const first = await loadCachedObliqueSeriesData(series);
    const restored = await loadCachedObliqueSeriesData(series);
    expect(restored.imageRecords).toBeInstanceOf(Map);
    expect([...restored.imageRecords.keys()]).toEqual([
      ...first.imageRecords.keys(),
    ]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(network.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(
      ["GET", "GET", "HEAD", "HEAD"]
    );
    expect(
      network.mock.calls.every(([, init]) => init?.cache === "no-cache")
    ).toBe(true);
    expect(storage.options).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityBytes: 192 * 1024 ** 2,
        maxEntries: 12,
      })
    );
  });
  it("reparses changed metadata using validators from the same GET body", async () => {
    await loadCachedObliqueSeriesData(dataset);
    network.mockImplementation(async () =>
      reply("second", { ETag: '"second"' })
    );
    const updated = await loadCachedObliqueSeriesData(dataset);
    expect([...updated.imageRecords.keys()]).toEqual(["second"]);
    await loadCachedObliqueSeriesData(dataset);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("invalidates a catalog when only delivered footprints change", async () => {
    const series = {
      ...dataset,
      footprintsURI: "https://images.example/footprints.json",
    };
    await loadCachedObliqueSeriesData(series);
    network.mockImplementation(async (input) =>
      reply("first", {
        ETag: input === series.footprintsURI ? '"new-footprints"' : '"first"',
      })
    );
    await loadCachedObliqueSeriesData(series);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("expires sources without exposed validators instead of indefinitely extending their TTL", async () => {
    network.mockImplementation(async () => reply("first"));
    await loadCachedObliqueSeriesData(dataset);
    now += OBLIQUE_CATALOG_FRESHNESS_MS - 1;
    await loadCachedObliqueSeriesData(dataset);
    expect(network).toHaveBeenCalledOnce();
    now++;
    network.mockImplementation(async () => reply("new"));
    const updated = await loadCachedObliqueSeriesData(dataset);
    expect([...updated.imageRecords.keys()]).toEqual(["new"]);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("does not reuse a differently calibrated configuration at the same source URL", async () => {
    await loadCachedObliqueSeriesData(dataset);
    await loadCachedObliqueSeriesData({
      ...dataset,
      referenceGroundHeightMeters: 250,
    });
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
    expect(storage.values.size).toBe(2);
  });
  it("does not return stale catalogs when validation and network loading fail", async () => {
    await loadCachedObliqueSeriesData(dataset);
    network.mockRejectedValue(new TypeError("Offline"));
    await expect(loadCachedObliqueSeriesData(dataset)).rejects.toThrow(
      "Offline"
    );
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("uses Last-Modified plus content length when ETag is unavailable", async () => {
    network.mockImplementation(async () =>
      reply("first", {
        "Last-Modified": "Thu, 01 Oct 2026 12:00:00 GMT",
        "Content-Length": "120",
      })
    );
    await loadCachedObliqueSeriesData(dataset);
    await loadCachedObliqueSeriesData(dataset);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    network.mockImplementation(async () =>
      reply("changed", {
        "Last-Modified": "Thu, 01 Oct 2026 12:00:00 GMT",
        "Content-Length": "121",
      })
    );
    await loadCachedObliqueSeriesData(dataset);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
});
describe("immutable catalog revisions", () => {
  it("loads cold once, then serves a versioned catalog offline without HEAD or GET", async () => {
    const series = {
      ...dataset,
      catalogVersion: "sha256-first",
      footprintsURI: "https://images.example/footprints.json",
    };
    const first = await loadCachedObliqueSeriesData(series);
    now += 365 * 24 * 60 * 60 * 1000;
    network.mockRejectedValue(new TypeError("Offline"));
    const warm = await loadCachedObliqueSeriesData(series);
    expect([...warm.imageRecords]).toEqual([...first.imageRecords]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(network.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(
      ["GET", "GET"]
    );
    expect(storage.options).toHaveBeenCalledWith(
      expect.objectContaining({
        producerEpoch: OBLIQUE_CATALOG_CACHE_VERSION,
        databaseName: "carma-oblique-catalog-cache-v3-192m-12",
        maxEntries: 12,
      })
    );
  });
  it("keeps an immutable parsed entry when only the compressed transport URL changes", async () => {
    const series = {
      ...dataset,
      catalogVersion: "sha256-first",
      compressedCatalogURI: "https://images.example/old.json.gz",
    };
    vi.mocked(loadObliqueSeriesData).mockImplementation(
      async (input, signal, fetchSource = fetch) => {
        await fetchSource(input.compressedCatalogURI!, { signal });
        return {
          imageRecords: new Map([
            ["first", { id: "first" } as ObliqueImageRecord],
          ]),
          centers: new Map(),
          datasets: new Map([[input.id, input]]),
        };
      }
    );
    await loadCachedObliqueSeriesData(series);
    network.mockRejectedValue(new TypeError("Offline"));
    const warm = await loadCachedObliqueSeriesData({
      ...series,
      compressedCatalogURI: "https://images.example/new.json.gz",
    });
    expect([...warm.imageRecords.keys()]).toEqual(["first"]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledOnce();
  });
  it("misses a new revision without deleting the previous revision", async () => {
    const first = { ...dataset, catalogVersion: "sha256-first" };
    await loadCachedObliqueSeriesData(first);
    network.mockImplementation(async () => reply("second"));
    const updated = await loadCachedObliqueSeriesData({
      ...dataset,
      catalogVersion: "sha256-second",
    });
    expect([...updated.imageRecords.keys()]).toEqual(["second"]);
    expect(storage.values.size).toBe(2);
    network.mockRejectedValue(new TypeError("Offline"));
    const restored = await loadCachedObliqueSeriesData(first);
    expect([...restored.imageRecords.keys()]).toEqual(["first"]);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("does not reuse a value missing the explicit immutable revision", async () => {
    const series = { ...dataset, catalogVersion: "sha256-first" };
    await loadCachedObliqueSeriesData(series);
    const stored = [...storage.values.values()][0] as {
      catalogVersion?: string;
    };
    delete stored.catalogVersion;
    network.mockImplementation(async () => reply("refreshed"));
    expect([
      ...(await loadCachedObliqueSeriesData(series)).imageRecords.keys(),
    ]).toEqual(["refreshed"]);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
  });
  it("isolates parser-schema entries and preserves an older parser entry", async () => {
    const series = { ...dataset, catalogVersion: "sha256-first" };
    await loadCachedObliqueSeriesData(series);
    const [currentKey, value] = [...storage.values.entries()][0];
    const olderKey = currentKey.replace(
      OBLIQUE_CATALOG_CACHE_VERSION,
      "oblique-catalog-v2"
    );
    storage.values.delete(currentKey);
    storage.values.set(olderKey, value);
    await loadCachedObliqueSeriesData(series);
    expect(loadObliqueSeriesData).toHaveBeenCalledTimes(2);
    expect(storage.values.has(olderKey)).toBe(true);
    expect(storage.values.size).toBe(2);
  });
  it("restores current runtime animation callbacks on an immutable hit", async () => {
    const easing = (value: number) => value;
    const series = {
      ...dataset,
      catalogVersion: "sha256-first",
      animations: { enterObliqueMode: { easingFunction: easing } },
    };
    await loadCachedObliqueSeriesData(series);
    const warm = await loadCachedObliqueSeriesData(series);
    expect(
      warm.datasets.get(dataset.id)?.animations.enterObliqueMode?.easingFunction
    ).toBe(easing);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
});
describe("optional storage and cancellation", () => {
  it("keeps metadata usable when storage reads or quota writes fail", async () => {
    storage.failRead = true;
    const first = await loadCachedObliqueSeriesData(dataset);
    expect(first.imageRecords.size).toBe(1);
    storage.failRead = false;
    storage.failWrite = true;
    const second = await loadCachedObliqueSeriesData(dataset);
    expect(second.imageRecords.size).toBe(1);
    expect(storage.values.size).toBe(0);
  });
  it("does not persist runtime easing callbacks", async () => {
    const easing = (value: number) => value;
    const result = await loadCachedObliqueSeriesData({
      ...dataset,
      animations: { enterObliqueMode: { easingFunction: easing } },
    });
    expect(
      result.datasets.get(dataset.id)?.animations.enterObliqueMode
        ?.easingFunction
    ).toBe(easing);
    const stored = [...storage.values.values()][0] as {
      data: { datasets: Map<string, ObliqueDataset> };
    };
    expect(stored.data.datasets.get(dataset.id)?.animations).toEqual({});
  });
  it("aborts a stalled IndexedDB read without starting the parser", async () => {
    storage.readBarrier = new Promise(() => {});
    const controller = new AbortController();
    const pending = loadCachedObliqueSeriesData(dataset, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(loadObliqueSeriesData).not.toHaveBeenCalled();
    expect(storage.close).toHaveBeenCalled();
  });
  it("bounds a stalled storage read and falls back to network parsing", async () => {
    vi.useFakeTimers();
    storage.readBarrier = new Promise(() => {});
    const pending = loadCachedObliqueSeriesData(dataset);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).imageRecords.size).toBe(1);
    expect(storage.close).toHaveBeenCalled();
  });
  it("puts only a short schema marker in localStorage and tolerates blocked storage", () => {
    const marker = new Map<string, string>();
    const local = {
      getItem: (key: string) => marker.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        marker.set(key, value);
      }),
    };
    vi.stubGlobal("localStorage", local);
    syncObliqueCatalogCacheVersion();
    syncObliqueCatalogCacheVersion();
    expect(local.setItem).toHaveBeenCalledOnce();
    expect([...marker.values()]).toEqual([OBLIQUE_CATALOG_CACHE_VERSION]);
    local.setItem.mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    marker.clear();
    expect(syncObliqueCatalogCacheVersion).not.toThrow();
  });
  it("reuses a legitimate canonical parsed cache when only preferred compression is added", async () => {
    const first = await loadCachedObliqueSeriesData(dataset);
    const restored = await loadCachedObliqueSeriesData({
      ...dataset,
      compressedCatalogURI: "https://images.example/metadata.json.gz",
    });
    expect([...restored.imageRecords.keys()]).toEqual([
      ...first.imageRecords.keys(),
    ]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(
      network.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])
    ).toEqual([
      [dataset.exteriorOrientationsURI, "GET"],
      [dataset.exteriorOrientationsURI, "HEAD"],
    ]);
  });
  it("keeps the canonical parsed cache when a directional transport plan is added", async () => {
    const first = await loadCachedObliqueSeriesData(dataset);
    const restored = await loadCachedObliqueSeriesData({
      ...dataset,
      directionalCatalogs: [
        {
          id: "north",
          sector: "N",
          cameraIds: ["RI"],
          meanHeadingRad: 0 as import("@carma-units").Radians,
          imageCount: 1,
          exteriorOrientationsURI: "https://images.example/north.json",
        },
      ],
    });
    expect([...restored.imageRecords]).toEqual([...first.imageRecords]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
  it("stores and revalidates only the successful compressed primary validator", async () => {
    const series = {
      ...dataset,
      compressedCatalogURI: "https://images.example/metadata.json.gz",
    };
    vi.mocked(loadObliqueSeriesData).mockImplementation(
      async (input, signal, fetchSource = fetch) => {
        const response = await fetchSource(input.compressedCatalogURI!, {
          signal,
        });
        const body = (await response.json()) as { id: string };
        return {
          imageRecords: new Map([
            [body.id, { id: body.id } as ObliqueImageRecord],
          ]),
          centers: new Map(),
          datasets: new Map([[input.id, input]]),
        };
      }
    );
    await loadCachedObliqueSeriesData(series);
    await loadCachedObliqueSeriesData(series);
    expect(
      network.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])
    ).toEqual([
      [series.compressedCatalogURI, "GET"],
      [series.compressedCatalogURI, "HEAD"],
    ]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
  it("does not retain an invalid compressed validator when canonical fallback succeeds", async () => {
    const series = {
      ...dataset,
      compressedCatalogURI: "https://images.example/metadata.json.gz",
    };
    vi.mocked(loadObliqueSeriesData).mockImplementation(
      async (input, signal, fetchSource = fetch) => {
        await fetchSource(input.compressedCatalogURI!, { signal });
        const response = await fetchSource(input.exteriorOrientationsURI, {
            signal,
          }),
          body = (await response.json()) as { id: string };
        return {
          imageRecords: new Map([
            [body.id, { id: body.id } as ObliqueImageRecord],
          ]),
          centers: new Map(),
          datasets: new Map([[input.id, input]]),
        };
      }
    );
    await loadCachedObliqueSeriesData(series);
    await loadCachedObliqueSeriesData(series);
    expect(
      network.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])
    ).toEqual([
      [series.compressedCatalogURI, "GET"],
      [series.exteriorOrientationsURI, "GET"],
      [series.exteriorOrientationsURI, "HEAD"],
    ]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
});

describe("caller fetch source", () => {
  it("sends catalog GETs and validation HEADs only through the caller's fetch source", async () => {
    const series = {
      ...dataset,
      footprintsURI: "https://images.example/footprints.json",
    };
    const prioritized = vi.fn<typeof fetch>(async () =>
      reply("first", { ETag: '"first"' })
    );
    await loadCachedObliqueSeriesData(series, undefined, prioritized);
    await loadCachedObliqueSeriesData(series, undefined, prioritized);
    expect(network).not.toHaveBeenCalled();
    expect(
      prioritized.mock.calls.map(([, init]) => [
        init?.method ?? "GET",
        init?.cache,
      ])
    ).toEqual([
      ["GET", "no-cache"],
      ["GET", "no-cache"],
      ["HEAD", "no-cache"],
      ["HEAD", "no-cache"],
    ]);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
});
