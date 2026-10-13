import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  NearestObliqueImageRecord,
  ObliqueDataset,
  ObliqueViewQuery,
  ObliqueImageRecord,
} from "../../core/types";
import { NAVIGATION_SELECTION } from "../../core/constants";
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
const mount = (
  data = catalog(),
  viewMode: "oblique" | "nadir" = "oblique",
  resolveCandidates?: (
    query: ObliqueViewQuery,
    isCurrent: () => boolean
  ) => Promise<NearestObliqueImageRecord[] | undefined>
) => {
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
        resolveCandidates,
      }),
    { initialProps: { data, locked: true } }
  );
  return { ...view, data, onSelect, onCandidates };
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
  it("preserves requested indexed result counts up to 128 without publishing a selection", async () => {
    const counts = [undefined, 128, 999, 12.9, NaN, Infinity, 0, -3];
    const expected = [4, 128, 128, 12, 4, 4, 1, 1];
    const search = {
      query: vi.fn(),
      queryBatch: vi.fn(async (queries: { numCandidates: number }[]) =>
        queries.map(({ numCandidates }) =>
          Array.from({ length: numCandidates }, (_, index) =>
            candidate(`neighbor-${index + 1}`)
          )
        )
      ),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const view = mount();
    const results = await view.result.current.computeNavigation(
      counts.map((numCandidates) => ({ target, numCandidates }))
    );
    expect(search.queryBatch).toHaveBeenCalledOnce();
    expect(
      search.queryBatch.mock.calls[0][0].map((query) => query.numCandidates)
    ).toEqual(expected);
    expect(results.map((result) => result?.length)).toEqual(expected);
    expect(results[1]?.[127].record.id).toBe("neighbor-128");
    expect(search.query).not.toHaveBeenCalled();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.onCandidates).not.toHaveBeenCalled();
  });

  it("keeps explicit image neighbors without old-target coverage while default pivot queries still require coverage", async () => {
    const covered = candidate("covered"),
      outside = candidate("outside", false);
    const untested = { ...candidate("untested"), coversTarget: undefined };
    const results = [outside, untested, covered];
    const search = {
      query: vi.fn(),
      queryBatch: vi
        .fn()
        .mockResolvedValue([results, results, results, results]),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    const view = mount();
    const navigation = await view.result.current.computeNavigation([
      {
        target,
        navigationSelection: NAVIGATION_SELECTION.CAPTURE_NEIGHBOR,
        navigationArrow: "down",
        excludeImageId: "current",
      },
      {
        target,
        navigationSelection: NAVIGATION_SELECTION.CENTER_DISTANCE,
        excludeImageId: "current",
      },
      { target, navigationOrigin: target, excludeImageId: "current" },
      { target, excludeImageId: "current" },
    ]);
    expect(navigation).toEqual([results, results, results, [covered]]);
    expect(
      search.queryBatch.mock.calls[0][0].map(
        (query: { navigationSelection?: string }) => query.navigationSelection
      )
    ).toEqual([
      NAVIGATION_SELECTION.CAPTURE_NEIGHBOR,
      NAVIGATION_SELECTION.CENTER_DISTANCE,
      undefined,
      undefined,
    ]);
    expect(search.queryBatch.mock.calls[0][0][2].navigationOrigin).toEqual(
      target
    );
    expect(view.onSelect).not.toHaveBeenCalled();
  });

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
      numCandidates: 99,
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

describe("authoritative field resolution", () => {
  beforeEach(() => {
    // Keep the independent datum refresh pending while testing request epochs.
    mocks.forward.mockReturnValue(new Promise<number>(() => undefined));
  });
  const searchFixture = () => {
    const search = {
      query: vi.fn().mockResolvedValue([candidate("legacy")]),
      queryBatch: vi.fn().mockResolvedValue([[candidate("neighbor")]]),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    mocks.create.mockReturnValue(search);
    return search;
  };

  it("bypasses worker query for automatic selection and compute-only requests", async () => {
    const search = searchFixture(),
      best = candidate("shared-best");
    const resolve = vi.fn(
      async (_query: ObliqueViewQuery, isCurrent: () => boolean) => {
        expect(isCurrent()).toBe(true);
        return [best];
      }
    );
    const view = mount(catalog(), "oblique", resolve);
    view.rerender({ data: view.data, locked: false });
    await expect(
      view.result.current.refreshSearch({ target, immediate: true })
    ).resolves.toEqual([best]);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ target }),
      expect.any(Function)
    );
    expect(view.onSelect).toHaveBeenCalledWith(best);
    expect(view.onCandidates).toHaveBeenCalledWith([best]);
    view.rerender({ data: view.data, locked: true });
    await expect(
      view.result.current.refreshSearch({
        target,
        immediate: true,
        computeOnly: true,
      })
    ).resolves.toEqual([best]);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(view.onSelect).toHaveBeenCalledOnce();
    expect(view.onCandidates).toHaveBeenCalledOnce();
    expect(search.query).not.toHaveBeenCalled();
    expect(search.queryBatch).not.toHaveBeenCalled();
  });

  it("ignores undefined field results without a legacy retry or selection publication", async () => {
    const search = searchFixture();
    const resolve = vi.fn().mockResolvedValue(undefined);
    const view = mount(catalog(), "oblique", resolve);
    view.rerender({ data: view.data, locked: false });
    await expect(
      view.result.current.refreshSearch({ target, immediate: true })
    ).resolves.toBeUndefined();
    await expect(
      view.result.current.refreshSearch({
        target,
        immediate: true,
        computeOnly: true,
      })
    ).resolves.toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(search.query).not.toHaveBeenCalled();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.onCandidates).not.toHaveBeenCalled();
  });

  it("drops a superseded field result and exposes its stale isCurrent callback", async () => {
    const search = searchFixture();
    const first = deferred<NearestObliqueImageRecord[] | undefined>();
    const resolve = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([candidate("latest")]);
    const view = mount(catalog(), "oblique", resolve);
    view.rerender({ data: view.data, locked: false });
    const old = view.result.current.refreshSearch({ target, immediate: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolve).toHaveBeenCalledOnce();
    const oldCurrent = resolve.mock.calls[0][1];
    expect(oldCurrent()).toBe(true);
    await expect(
      view.result.current.refreshSearch({ target, immediate: true })
    ).resolves.toEqual([candidate("latest")]);
    expect(oldCurrent()).toBe(false);
    first.resolve([candidate("old")]);
    await expect(old).resolves.toBeUndefined();
    expect(view.onSelect).toHaveBeenCalledOnce();
    expect(view.onSelect).toHaveBeenCalledWith(candidate("latest"));
    expect(search.query).not.toHaveBeenCalled();
  });

  it("rejects field results belonging to a replaced catalogue", async () => {
    const search = searchFixture();
    const pending = deferred<NearestObliqueImageRecord[] | undefined>();
    const resolve = vi.fn().mockReturnValue(pending.promise);
    const view = mount(catalog(), "oblique", resolve);
    view.rerender({ data: view.data, locked: false });
    const old = view.result.current.refreshSearch({ target, immediate: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolve).toHaveBeenCalledOnce();
    view.rerender({ data: catalog(), locked: false });
    expect(resolve.mock.calls[0][1]()).toBe(false);
    pending.resolve([candidate("stale")]);
    await expect(old).resolves.toBeUndefined();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.onCandidates).not.toHaveBeenCalled();
    expect(search.query).not.toHaveBeenCalled();
  });

  it("rejects late field results after unmount", async () => {
    const search = searchFixture();
    const pending = deferred<NearestObliqueImageRecord[] | undefined>();
    const resolve = vi.fn().mockReturnValue(pending.promise);
    const view = mount(catalog(), "oblique", resolve);
    const old = view.result.current.refreshSearch({
      target,
      immediate: true,
      computeOnly: true,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolve).toHaveBeenCalledOnce();
    view.unmount();
    expect(resolve.mock.calls[0][1]()).toBe(false);
    pending.resolve([candidate("late")]);
    await expect(old).resolves.toBeUndefined();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(search.query).not.toHaveBeenCalled();
  });

  it("keeps indexed search for hosts without a field resolver", async () => {
    const search = searchFixture();
    const view = mount();
    view.rerender({ data: view.data, locked: false });
    await expect(
      view.result.current.refreshSearch({ target, immediate: true })
    ).resolves.toEqual([candidate("legacy")]);
    view.rerender({ data: view.data, locked: true });
    await expect(
      view.result.current.refreshSearch({
        target,
        immediate: true,
        computeOnly: true,
      })
    ).resolves.toEqual([candidate("legacy")]);
    expect(search.query).toHaveBeenCalledTimes(2);
    expect(view.onSelect).toHaveBeenCalledOnce();
    expect(view.onSelect).toHaveBeenCalledWith(candidate("legacy"));
    expect(search.queryBatch).not.toHaveBeenCalled();
  });

  it("preserves explicit neighbor queryBatch independently of the field resolver", async () => {
    const search = searchFixture();
    const resolve = vi.fn().mockResolvedValue([candidate("field")]);
    const view = mount(catalog(), "oblique", resolve);
    await expect(
      view.result.current.computeNavigation([
        {
          target,
          navigationSelection: NAVIGATION_SELECTION.CAPTURE_NEIGHBOR,
          excludeImageId: "current",
        },
      ])
    ).resolves.toEqual([[candidate("neighbor")]]);
    expect(search.queryBatch).toHaveBeenCalledOnce();
    expect(search.queryBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        target,
        navigationSelection: NAVIGATION_SELECTION.CAPTURE_NEIGHBOR,
        excludeImageId: "current",
      }),
    ]);
    expect(resolve).not.toHaveBeenCalled();
    expect(search.query).not.toHaveBeenCalled();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.onCandidates).not.toHaveBeenCalled();
  });
});
