import { afterEach, describe, expect, it, vi } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type {
  CardinalDirection,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueReferenceSummary,
} from "../../core/types";
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
    ).toBeCloseTo(degToRad(80 as Degrees), 12);
    expect(
      result.obliquePitchByDirectionBySeries?.get(dataset.id)?.get(0)
        ?.imageCount
    ).toBe(1);
    expect(
      result.obliquePitchByDirectionBySeries?.get(dataset.id)?.get(1)
        ?.imageCount
    ).toBe(1);
    expect(cached).toHaveBeenCalledOnce();
    expect(loadObliqueSeriesData).not.toHaveBeenCalled();
  });

  it("repairs an older cached catalog with pitch totals but no reference map once", async () => {
    const legacyDataset = {
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
          sector: 1,
          pose: { pitchDeg: 30, bearingDeg: 350 },
        } as ObliqueImageRecord,
      ],
      [
        "two",
        {
          id: "two",
          seriesId: dataset.id,
          cameraId: "oblique",
          sector: 1,
          pose: { pitchDeg: 50, bearingDeg: 10 },
        } as ObliqueImageRecord,
      ],
      [
        "nadir",
        {
          id: "nadir",
          seriesId: dataset.id,
          cameraId: "nadir",
          sector: 1,
          pose: { pitchDeg: 10, bearingDeg: 90 },
        } as ObliqueImageRecord,
      ],
    ]);
    const previousSeriesTotals = new Map([
      [dataset.id, { pitchSumRad: degToRad(80 as Degrees), imageCount: 2 }],
    ]);
    const previousDirectionTotals = new Map([
      [
        dataset.id,
        new Map([
          [0 as CardinalDirection, previousSeriesTotals.get(dataset.id)!],
        ]),
      ],
    ]);
    const legacy: ObliqueData = {
      imageRecords: records,
      datasets: new Map([[dataset.id, legacyDataset]]),
      centers: new Map(),
      obliquePitchBySeries: previousSeriesTotals,
      obliquePitchByDirectionBySeries: previousDirectionTotals,
    };
    const recordsBefore = structuredClone(records);
    const iterate = vi.spyOn(records, "values");
    const cached = vi.fn().mockResolvedValue(legacy);
    const result = await loadWithOptionalCatalogCache(
      dataset,
      async () => cached
    );
    const referenceDirections = result.obliqueReferenceByDirectionBySeries?.get(
      dataset.id
    );
    const reference = referenceDirections?.get(1);
    expect(result).toBe(legacy);
    expect(result.imageRecords).toBe(records);
    expect(result.imageRecords).toEqual(recordsBefore);
    expect(result.obliquePitchBySeries).toBe(previousSeriesTotals);
    expect(result.obliquePitchByDirectionBySeries).toBe(
      previousDirectionTotals
    );
    expect(referenceDirections?.size).toBe(1);
    expect(reference?.imageCount).toBe(2);
    expect(reference?.opticalPitchSumRad).toBeCloseTo(
      degToRad(80 as Degrees),
      12
    );
    expect(reference?.headingSinSum).toBeCloseTo(0, 12);
    expect(reference?.headingCosSum).toBeCloseTo(
      2 * Math.cos(degToRad(10 as Degrees)),
      12
    );
    const referenceMap = result.obliqueReferenceByDirectionBySeries;
    const again = await loadWithOptionalCatalogCache(
      dataset,
      async () => cached
    );
    expect(again.obliqueReferenceByDirectionBySeries).toBe(referenceMap);
    expect(iterate).toHaveBeenCalledOnce();
    expect(loadObliqueSeriesData).not.toHaveBeenCalled();
  });

  it("preserves a cached reference map and raw records without recomputing", async () => {
    const record = Object.freeze({
      id: "one",
      seriesId: dataset.id,
      cameraId: "oblique",
      sector: 1,
      pose: Object.freeze({ pitchDeg: 30, bearingDeg: 350 }),
    }) as unknown as ObliqueImageRecord;
    const records = new Map([[record.id, record]]);
    const reference = Object.freeze({
      opticalPitchSumRad: degToRad(30 as Degrees),
      headingSinSum: Math.sin(degToRad(350 as Degrees)),
      headingCosSum: Math.cos(degToRad(350 as Degrees)),
      imageCount: 1,
    });
    const directions = new Map<CardinalDirection, ObliqueReferenceSummary>([
      [1, reference],
    ]);
    const referenceMap = new Map([[dataset.id, directions]]);
    const cachedData: ObliqueData = {
      imageRecords: records,
      datasets: new Map(),
      centers: new Map(),
      obliquePitchBySeries: new Map(),
      obliquePitchByDirectionBySeries: new Map(),
      obliqueReferenceByDirectionBySeries: referenceMap,
    };
    const iterate = vi.spyOn(records, "values");
    const cached = vi.fn().mockResolvedValue(cachedData);
    const result = await loadWithOptionalCatalogCache(
      dataset,
      async () => cached
    );
    expect(result).toBe(cachedData);
    expect(result.imageRecords).toBe(records);
    expect(result.imageRecords.get(record.id)).toBe(record);
    expect(result.obliqueReferenceByDirectionBySeries).toBe(referenceMap);
    expect(result.obliqueReferenceByDirectionBySeries?.get(dataset.id)).toBe(
      directions
    );
    expect(
      result.obliqueReferenceByDirectionBySeries?.get(dataset.id)?.get(1)
    ).toBe(reference);
    expect(iterate).not.toHaveBeenCalled();
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
