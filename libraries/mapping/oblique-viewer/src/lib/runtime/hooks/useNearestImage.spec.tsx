import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  NearestObliqueImageRecord,
  ObliqueDataset,
  ObliqueImageRecord,
} from "../../core/types";
import { TEST_LEGACY_SERIES } from "../../core/utils/synthetic-series.test-fixture";
import { CardinalDirectionEnum } from "../../core/utils/orientation";
import type { ObliqueData } from "./useObliqueData";
import { useNearestImage } from "./useNearestImage";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  forward: vi.fn(),
  inverse: vi.fn(),
}));
vi.mock("../utils/image-selection", () => ({
  createImageSelectionSearch: mocks.create,
}));
vi.mock("@carma-geo/proj", () => ({
  getGcg2016Wgs84VerticalTransformer: () => ({
    forward: mocks.forward,
    inverse: mocks.inverse,
  }),
}));
const series: ObliqueDataset = {
  ...TEST_LEGACY_SERIES,
  id: "test-series",
  heightDatum: "ellipsoidal",
};
const catalog = (): ObliqueData => ({
  imageRecords: new Map(),
  centers: new Map(),
  datasets: new Map([
    [series.id, series],
    ["second-series", { ...series, id: "second-series" }],
  ]),
});
const candidate = (id: string, covered = true): NearestObliqueImageRecord => ({
  record: { id } as ObliqueImageRecord,
  distanceOnGround: 1,
  distanceToCamera: 2,
  coversTarget: covered,
  imageCenter: {
    x: 0,
    y: 0,
    longitude: 7.2,
    latitude: 51.27,
    cardinal: CardinalDirectionEnum.North,
  },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const target = {
  longitude: 7.2,
  latitude: 51.27,
  heightMeters: 50,
  heightDatum: "dhhn2016" as const,
};
const map = {
  getBearing: () => 0,
  getPitch: () => 45,
  getCenter: () => ({ lng: 7.2, lat: 51.27 }),
  queryTerrainElevation: () => 50,
  on: vi.fn(),
  off: vi.fn(),
} as unknown as MaplibreMap;
const mount = (data = catalog(), viewMode: "oblique" | "nadir" = "oblique") => {
  const onSelect = vi.fn(),
    onCandidates = vi.fn();
  const view = renderHook(
    ({ data, locked }) =>
      useNearestImage({
        map,
        enabled: false,
        dataset: series,
        viewMode,
        data,
        locked,
        selectedImageId: null,
        onSelect,
        onCandidates,
      }),
    { initialProps: { data, locked: true } }
  );
  return { ...view, onSelect, onCandidates };
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  mocks.forward.mockResolvedValue(123);
  mocks.inverse.mockResolvedValue(45);
});
describe("independent geometric navigation batches", () => {
  it("searches before datum conversion and reuses its result for later queries", async () => {
    const conversion = deferred<number>();
    mocks.forward.mockReturnValue(conversion.promise);
    const search = {
      query: vi.fn(),
      queryBatch: vi
        .fn()
        .mockResolvedValue([
          [candidate("neighbor"), candidate("outside", false)],
        ]),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const view = mount();
    const results = await view.result.current.computeNavigation([
      { target, excludeImageId: "current", numCandidates: 99 },
    ]);
    expect(results?.[0]).toEqual([candidate("neighbor")]);
    expect(mocks.forward).toHaveBeenCalledTimes(1);
    const query = search.queryBatch.mock.calls[0][0][0];
    expect(query).toMatchObject({
      excludeImageId: "current",
      numCandidates: 4,
      target,
    });
    expect([...query.perSeriesTargetHeightMeters]).toEqual([]);
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.onCandidates).not.toHaveBeenCalled();

    await act(async () => {
      conversion.resolve(123);
      await conversion.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await view.result.current.computeNavigation([{ target }]);
    expect(mocks.forward).toHaveBeenCalledTimes(1);
    expect([
      ...search.queryBatch.mock.calls[1][0][0].perSeriesTargetHeightMeters,
    ]).toEqual([
      [series.id, 123],
      ["second-series", 123],
    ]);
  });
  it("allows initial image selection while the datum grid is still loading", async () => {
    const conversion = deferred<number>();
    mocks.forward.mockReturnValue(conversion.promise);
    const search = {
      query: vi.fn().mockResolvedValue([candidate("selected")]),
      queryBatch: vi.fn(),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const data = catalog();
    const onSelect = vi.fn();
    renderHook(() =>
      useNearestImage({
        map,
        enabled: true,
        dataset: series,
        data,
        locked: false,
        selectedImageId: null,
        onSelect,
      })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(search.query).toHaveBeenCalledOnce();
    expect([
      ...search.query.mock.calls[0][0].perSeriesTargetHeightMeters,
    ]).toEqual([]);
    expect(onSelect).toHaveBeenCalledOnce();

    await act(async () => {
      conversion.resolve(123);
      await conversion.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(search.query).toHaveBeenCalledTimes(2);
    expect([
      ...search.query.mock.calls[1][0].perSeriesTargetHeightMeters,
    ]).toEqual([
      [series.id, 123],
      ["second-series", 123],
    ]);
  });
  it("does not invalidate navigation when locked changes or scalar work starts", async () => {
    const pending = deferred<(NearestObliqueImageRecord[] | undefined)[]>();
    const search = {
      query: vi.fn().mockResolvedValue([candidate("selected")]),
      queryBatch: vi.fn().mockReturnValue(pending.promise),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const data = catalog(),
      view = mount(data);
    const nav = view.result.current.computeNavigation([{ target }]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    view.rerender({ data, locked: false });
    const scalar = await view.result.current.refreshSearch({
      target,
      immediate: true,
    });
    expect(scalar?.[0].record.id).toBe("selected");
    pending.resolve([[candidate("next")]]);
    await expect(nav).resolves.toEqual([[candidate("next")]]);
    expect(view.onSelect).toHaveBeenCalledOnce();
  });
  it("invalidates only older navigation generation while scalar selection remains independent", async () => {
    const first = deferred<(NearestObliqueImageRecord[] | undefined)[]>(),
      second = deferred<(NearestObliqueImageRecord[] | undefined)[]>();
    const search = {
      query: vi.fn().mockResolvedValue([candidate("scalar")]),
      queryBatch: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const view = mount();
    const old = view.result.current.computeNavigation([{ target }]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const latest = view.result.current.computeNavigation([{ target }]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    first.resolve([[candidate("old")]]);
    second.resolve([[candidate("latest")]]);
    await expect(old).resolves.toEqual([undefined]);
    await expect(latest).resolves.toEqual([[candidate("latest")]]);
    await expect(
      view.result.current.refreshSearch({
        target,
        computeOnly: true,
        immediate: true,
      })
    ).resolves.toEqual([candidate("scalar")]);
  });
  it("drops results from an updated catalog and limits the batch to twelve", async () => {
    const pending = deferred<(NearestObliqueImageRecord[] | undefined)[]>(),
      oldSearch = {
        query: vi.fn(),
        queryBatch: vi.fn().mockReturnValue(pending.promise),
        update: vi.fn(),
        dispose: vi.fn(),
      },
      nextSearch = {
        query: vi.fn(),
        queryBatch: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      };
    mocks.create.mockReturnValueOnce(oldSearch).mockReturnValue(nextSearch);
    const view = mount();
    const old = view.result.current.computeNavigation([{ target }]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    view.rerender({ data: catalog(), locked: true });
    pending.resolve([[candidate("stale")]]);
    await expect(old).resolves.toEqual([undefined]);
    expect(oldSearch.update).toHaveBeenCalledOnce();
    expect(oldSearch.dispose).not.toHaveBeenCalled();
    await expect(
      view.result.current.computeNavigation(Array(13).fill({ target }))
    ).rejects.toThrow(/twelve/);
    expect(nextSearch.queryBatch).not.toHaveBeenCalled();
  });
  it("prepares explicit oblique cardinal queries independently of the active nadir mode", async () => {
    const search = {
      query: vi.fn(),
      queryBatch: vi.fn().mockResolvedValue([[candidate("oblique")]]),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const view = mount(catalog(), "nadir");
    await view.result.current.computeNavigation([
      { target, cameraView: "oblique" },
    ]);
    expect(search.queryBatch.mock.calls[0][0][0].cameraView).toBeUndefined();
  });
});
