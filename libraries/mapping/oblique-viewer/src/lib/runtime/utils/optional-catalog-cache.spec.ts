import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset } from "../../core/types";
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
});

describe("optional catalog cache startup", () => {
  it("uses a ready persistent cache without fetching twice", async () => {
    const cached = vi.fn().mockResolvedValue(data);
    await expect(
      loadWithOptionalCatalogCache(dataset, async () => cached)
    ).resolves.toBe(data);
    expect(cached).toHaveBeenCalledWith(dataset);
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
