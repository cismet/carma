import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import { loadObliqueSeriesData, type ObliqueData } from "./load-oblique-series";
import { loadWithOptionalCatalogCache } from "./optional-catalog-cache";

vi.mock("./load-oblique-series", () => ({
  loadObliqueSeriesData: vi.fn(),
}));

const dataset = { id: "fixture" } as ObliqueDataset;
const data: ObliqueData = {
  imageRecords: new Map(),
  datasets: new Map(),
  centers: new Map(),
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("optional catalog cache startup", () => {
  it("uses a ready persistent cache without fetching twice", async () => {
    const cached = vi.fn().mockResolvedValue(data);
    await expect(
      loadWithOptionalCatalogCache(dataset, async () => cached)
    ).resolves.toBe(data);
    expect(cached).toHaveBeenCalledWith(dataset, undefined, undefined);
    expect(loadObliqueSeriesData).not.toHaveBeenCalled();
  });

  it("adds the requested fetch priority to every catalog request", async () => {
    const network = vi.fn<typeof fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", network);
    const cached = vi.fn().mockResolvedValue(data);
    await loadWithOptionalCatalogCache(dataset, async () => cached, {
      fetchPriority: "low",
    });
    const fetchSource = cached.mock.calls[0][2] as typeof fetch;
    await fetchSource("https://images.example/catalog.json", {
      cache: "no-cache",
    });
    expect(network).toHaveBeenCalledWith(
      "https://images.example/catalog.json",
      { cache: "no-cache", priority: "low" }
    );
  });

  it("adds a pitch summary to an older cached catalog without refetching or replacing its records", async () => {
    const oldDataset = {
      ...dataset,
      cameras: { oblique: { view: "front" }, nadir: { view: "nadir" } },
    } as unknown as ObliqueDataset;
    const records = new Map([
      [
        "one",
        {
          id: "one",
          seriesId: dataset.id,
          cameraId: "oblique",
          pose: { pitchDeg: 30, bearingDeg: 325 },
        } as ObliqueImageRecord,
      ],
      [
        "two",
        {
          id: "two",
          seriesId: dataset.id,
          cameraId: "oblique",
          pose: { pitchDeg: 50, bearingDeg: 54 },
        } as ObliqueImageRecord,
      ],
      [
        "nadir",
        {
          id: "nadir",
          seriesId: dataset.id,
          cameraId: "nadir",
          pose: { pitchDeg: 10, bearingDeg: 325 },
        } as ObliqueImageRecord,
      ],
    ]);
    const legacy: ObliqueData = {
      imageRecords: records,
      datasets: new Map([[dataset.id, oldDataset]]),
      centers: new Map(),
    };
    const cached = vi.fn().mockResolvedValue(legacy);
    const result = await loadWithOptionalCatalogCache(
      dataset,
      async () => cached
    );
    expect(result).toBe(legacy);
    expect(result.imageRecords).toBe(records);
    expect(result.obliquePitchBySeries?.get(dataset.id)?.imageCount).toBe(2);
    expect(
      result.obliquePitchBySeries?.get(dataset.id)?.pitchSumRad
    ).toBeCloseTo((80 * Math.PI) / 180, 12);
    expect(result.obliquePitchByDirectionBySeries?.get(dataset.id)?.get(0)?.imageCount).toBe(1);
    expect(result.obliquePitchByDirectionBySeries?.get(dataset.id)?.get(1)?.imageCount).toBe(1);
    expect(cached).toHaveBeenCalledOnce();
    expect(loadObliqueSeriesData).not.toHaveBeenCalled();
  });

  it("continues parsing when the optional module import never completes", async () => {
    vi.useFakeTimers();
    vi.mocked(loadObliqueSeriesData).mockResolvedValue(data);
    const pending = loadWithOptionalCatalogCache(
      dataset,
      () => new Promise(() => {})
    );
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe(data);
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("continues parsing when the optional import rejects", async () => {
    vi.mocked(loadObliqueSeriesData).mockResolvedValue(data);
    await expect(
      loadWithOptionalCatalogCache(dataset, async () => {
        throw new Error("Optional module unavailable");
      })
    ).resolves.toBe(data);
  });

  it("ignores a late cache import without starting a duplicate catalog load", async () => {
    vi.useFakeTimers();
    vi.mocked(loadObliqueSeriesData).mockResolvedValue(data);
    const cached = vi.fn().mockResolvedValue(data);
    let resolveImport!: (loader: typeof cached) => void;
    const pending = loadWithOptionalCatalogCache(
      dataset,
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    resolveImport(cached);
    await Promise.resolve();
    expect(cached).not.toHaveBeenCalled();
    expect(loadObliqueSeriesData).toHaveBeenCalledOnce();
  });
});
